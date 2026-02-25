const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const cookieParser = require('cookie-parser');
const path = require('path');
const multer = require('multer');
const config = require('./config');
const { query } = require('./db');
const { runDbBootstrap } = require('./bootstrap');
const { uploadMedia, r2Enabled } = require('./storage');
const { askPadhAI } = require('./ai');
const { createRepository } = require('./repository');
const { generateTotpSecret, verifyTotpCode, createOtpAuthUrl } = require('./totp');
const {
  hashPassword,
  verifyPassword,
  createSessionToken,
  verifySessionToken,
  sessionCookieOptions
} = require('./auth');
const { sanitizeText } = require('./sanitize');
const {
  listingSchema,
  listingQuerySchema,
  authRegisterSchema,
  authLoginSchema,
  profileUpdateSchema,
  changePasswordSchema,
  totpEnableSchema,
  communityPostSchema,
  communityCommentSchema,
  communityListQuerySchema,
  notificationsQuerySchema,
  adminActionQuerySchema,
  adminUsersQuerySchema,
  adminResetUserPasswordSchema,
  adminChangePasswordSchema,
  aiSchema
} = require('./validators');

function parseId(value) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function isZodError(error) {
  return Array.isArray(error?.issues);
}

function getIpAddress(req) {
  const forwarded = req.headers?.['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.trim()) {
    return forwarded.split(',')[0].trim();
  }
  return req.ip || req.socket?.remoteAddress || '';
}

function toSerializableObject(value) {
  if (!value || typeof value !== 'object') return {};
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return {};
  }
}

function toPublicUser(user) {
  if (!user) return null;
  return {
    id: user.id,
    email: user.email,
    fullName: user.fullName,
    role: user.role,
    totpEnabled: Boolean(user.totpEnabled)
  };
}

function titleCaseFromCode(value) {
  return String(value || '')
    .replaceAll('_', ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function truncateText(value, maxLen) {
  return String(value || '').slice(0, maxLen);
}

function normalizeArray(values) {
  if (!Array.isArray(values)) return [];
  return values
    .map((item) => String(item || '').trim().toLowerCase())
    .filter((item) => item.length > 0);
}

function mergeUniqueStrings(base, incoming, max = 12) {
  const merged = [];
  for (const item of [...normalizeArray(base), ...normalizeArray(incoming)]) {
    if (!merged.includes(item)) merged.push(item);
    if (merged.length >= max) break;
  }
  return merged;
}

function inferPreferencePatch(existingPreferences, prompt) {
  const lower = String(prompt || '').toLowerCase();
  const current = existingPreferences || {};
  const knownExams = ['jee', 'neet', 'gate', 'upsc', 'cat', 'ssc', 'bank', 'ca', 'csir'];
  const knownCategories = ['book', 'notes', 'instrument', 'video', 'pdf', 'stationery', 'stationary'];
  const knownStationery = ['notebook', 'pen', 'pencil', 'marker', 'calculator', 'geometry box', 'stapler', 'diary'];

  const detectedExam = knownExams.find((exam) => lower.includes(exam));
  const detectedCategories = knownCategories.filter((category) => lower.includes(category));
  const detectedStationery = knownStationery.filter((item) => lower.includes(item));
  const radiusMatch = lower.match(/\b(?:within|under|upto|up to|around|nearby)\s*(\d{2,3})\s*km\b/);

  const next = {
    examFocus: current.examFocus || '',
    preferredCategories: normalizeArray(current.preferredCategories),
    preferredStationery: normalizeArray(current.preferredStationery),
    preferredRadiusKm: Number(current.preferredRadiusKm) || 200
  };

  let changed = false;
  if (detectedExam && next.examFocus !== detectedExam.toUpperCase()) {
    next.examFocus = detectedExam.toUpperCase();
    changed = true;
  }

  const mergedCategories = mergeUniqueStrings(next.preferredCategories, detectedCategories, 8);
  if (mergedCategories.join('|') !== next.preferredCategories.join('|')) {
    next.preferredCategories = mergedCategories;
    changed = true;
  }

  const mergedStationery = mergeUniqueStrings(next.preferredStationery, detectedStationery, 12);
  if (mergedStationery.join('|') !== next.preferredStationery.join('|')) {
    next.preferredStationery = mergedStationery;
    changed = true;
  }

  if (radiusMatch) {
    const parsed = Number(radiusMatch[1]);
    if (Number.isFinite(parsed)) {
      const bounded = Math.min(500, Math.max(25, parsed));
      if (bounded !== next.preferredRadiusKm) {
        next.preferredRadiusKm = bounded;
        changed = true;
      }
    }
  }

  return { ...next, changed };
}

function formatListingsForPrompt(items = []) {
  if (!Array.isArray(items) || items.length === 0) return 'No matching items found.';
  return items
    .slice(0, 10)
    .map((item, index) => {
      const distance = typeof item.distanceKm === 'number' ? `, ${Number(item.distanceKm).toFixed(1)} km` : '';
      return `${index + 1}. ${item.title} | ${item.category}/${item.listingType} | INR ${item.price} | ${item.city}${distance}`;
    })
    .join('\n');
}

function createApp(deps = {}) {
  const appConfig = deps.config || config;
  const queryFn = deps.queryFn || query;
  const repository = deps.repo || createRepository(queryFn);
  const uploadMediaFn = deps.uploadMediaFn || uploadMedia;
  const askAiFn = deps.askAiFn || askPadhAI;
  const reverseGeocodeFetch = deps.fetchImpl || fetch;
  const r2EnabledFlag = typeof deps.r2Enabled === 'boolean' ? deps.r2Enabled : r2Enabled;

  const app = express();
  const upload = multer({ limits: { fileSize: 30 * 1024 * 1024 } });
  const cookieOptions = sessionCookieOptions(appConfig);
  const clearCookieOptions = { ...cookieOptions };
  delete clearCookieOptions.maxAge;
  const sseClients = new Set();

  const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 40 });
  const listingWriteLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 80 });
  const communityWriteLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 80 });

  app.use(helmet({ contentSecurityPolicy: false }));
  app.use(cors({ origin: appConfig.corsOrigin, credentials: true }));
  app.use(express.json({ limit: '1mb' }));
  app.use(cookieParser());
  app.use(rateLimit({ windowMs: 15 * 60 * 1000, limit: 200 }));

  app.use((req, _, next) => {
    const token = req.cookies?.[appConfig.sessionCookieName];
    const payload = verifySessionToken(token, appConfig.sessionSecret);
    req.user = payload
      ? {
          id: Number(payload.uid),
          email: payload.email,
          fullName: payload.fullName,
          role: payload.role
        }
      : null;
    next();
  });

  app.use(express.static(path.join(process.cwd(), 'public')));

  const requireAuth = (req, res, next) => {
    if (!req.user?.id) return res.status(401).json({ error: 'Authentication required' });
    return next();
  };

  const requireAdmin = async (req, res, next) => {
    if (!req.user?.id) return res.status(401).json({ error: 'Authentication required' });
    try {
      const freshUser = await repository.findUserById(req.user.id);
      if (!freshUser) return res.status(401).json({ error: 'Authentication required' });
      if (freshUser.role !== 'admin') return res.status(403).json({ error: 'Admin access required' });
      req.user = { ...req.user, role: freshUser.role, email: freshUser.email, fullName: freshUser.fullName };
      return next();
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  };

  const logProjectAction = async (
    req,
    { actor = req.user, actionType, entityType, entityId = null, summary, details = {} }
  ) => {
    if (typeof repository.createProjectAction !== 'function') return;
    try {
      await repository.createProjectAction({
        actorId: actor?.id || null,
        actorEmail: actor?.email || '',
        actorRole: actor?.role || '',
        actionType,
        entityType,
        entityId,
        summary,
        details: toSerializableObject(details),
        ipAddress: getIpAddress(req),
        userAgent: String(req.get('user-agent') || '')
      });
    } catch {
      // Keep primary request flow resilient if audit logging fails.
    }
  };

  const publishRealtimeEvent = (eventName, payload = {}, targetUserId = null) => {
    const data = JSON.stringify(payload);
    const frame = `event: ${eventName}\ndata: ${data}\n\n`;
    const staleClients = [];

    for (const client of sseClients) {
      if (targetUserId && Number(client.userId) !== Number(targetUserId)) continue;
      try {
        client.res.write(frame);
      } catch {
        staleClients.push(client);
      }
    }

    for (const client of staleClients) {
      sseClients.delete(client);
    }
  };

  app.get('/api/health', (_, res) => res.json({ ok: true, stack: 'express-neon-r2-pwa' }));

  app.get('/api/events/stream', (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    if (typeof res.flushHeaders === 'function') res.flushHeaders();

    const client = {
      userId: req.user?.id || null,
      res
    };
    sseClients.add(client);

    res.write(`event: ready\ndata: ${JSON.stringify({ connected: true, userId: client.userId })}\n\n`);

    const pingTimer = setInterval(() => {
      try {
        res.write(`event: ping\ndata: {"ts":${Date.now()}}\n\n`);
      } catch {
        clearInterval(pingTimer);
      }
    }, 25000);

    req.on('close', () => {
      clearInterval(pingTimer);
      sseClients.delete(client);
    });
  });

  app.post('/api/auth/register', authLimiter, async (req, res) => {
    try {
      const body = authRegisterSchema.parse(req.body);
      const existing = await repository.findUserByEmail(body.email);
      if (existing) return res.status(409).json({ error: 'Email already registered' });

      const wantsTotpOnSignup = Boolean(body.totpSecret && body.totpCode);
      if (wantsTotpOnSignup) {
        const validTotp = verifyTotpCode(body.totpSecret, body.totpCode);
        if (!validTotp) return res.status(400).json({ error: 'Invalid TOTP secret/code pair' });
      }

      const passwordHash = await hashPassword(body.password);
      let user = await repository.createUser({
        email: body.email,
        fullName: body.fullName,
        passwordHash
      });
      if (wantsTotpOnSignup && typeof repository.enableTotp === 'function') {
        const updated = await repository.enableTotp({ userId: user.id, secret: body.totpSecret });
        if (updated) user = updated;
      }

      const token = createSessionToken(user, appConfig.sessionSecret, appConfig.sessionTtlSeconds);
      res.cookie(appConfig.sessionCookieName, token, cookieOptions);
      await logProjectAction(req, {
        actor: user,
        actionType: 'auth.register',
        entityType: 'user',
        entityId: user.id,
        summary: 'New user account registered',
        details: { email: user.email }
      });
      return res.status(201).json({ authenticated: true, user: toPublicUser(user) });
    } catch (error) {
      if (isZodError(error)) return res.status(400).json({ error: error.issues[0]?.message || 'Invalid input' });
      return res.status(500).json({ error: error.message });
    }
  });

  app.post('/api/auth/login', authLimiter, async (req, res) => {
    try {
      const body = authLoginSchema.parse(req.body);
      const user = await repository.findUserByEmail(body.email);
      if (!user) return res.status(401).json({ error: 'Invalid credentials' });

      const passwordProvided = typeof body.password === 'string' && body.password.length > 0;
      const totpProvided = typeof body.totpCode === 'string' && body.totpCode.length > 0;

      let passwordValid = false;
      let totpValid = false;

      if (passwordProvided) {
        passwordValid = await verifyPassword(body.password, user.passwordHash);
      }

      if (totpProvided && user.totpEnabled && user.totpSecret) {
        totpValid = verifyTotpCode(user.totpSecret, body.totpCode);
      }

      if (!passwordValid && !totpValid) return res.status(401).json({ error: 'Invalid credentials' });

      const token = createSessionToken(user, appConfig.sessionSecret, appConfig.sessionTtlSeconds);
      res.cookie(appConfig.sessionCookieName, token, cookieOptions);
      await logProjectAction(req, {
        actor: user,
        actionType: 'auth.login',
        entityType: 'user',
        entityId: user.id,
        summary: 'User logged in',
        details: { email: user.email, authMethod: passwordValid ? 'password' : 'totp' }
      });
      return res.json({
        authenticated: true,
        user: toPublicUser(user)
      });
    } catch (error) {
      if (isZodError(error)) return res.status(400).json({ error: error.issues[0]?.message || 'Invalid input' });
      return res.status(500).json({ error: error.message });
    }
  });

  app.post('/api/auth/logout', async (req, res) => {
    if (req.user?.id) {
      await logProjectAction(req, {
        actionType: 'auth.logout',
        entityType: 'user',
        entityId: req.user.id,
        summary: 'User logged out'
      });
    }
    res.clearCookie(appConfig.sessionCookieName, clearCookieOptions);
    res.json({ authenticated: false });
  });

  app.get('/api/auth/me', async (req, res) => {
    try {
      if (!req.user?.id) return res.json({ authenticated: false, user: null });
      const user = await repository.findUserById(req.user.id);
      if (!user) {
        res.clearCookie(appConfig.sessionCookieName, clearCookieOptions);
        return res.json({ authenticated: false, user: null });
      }
      return res.json({ authenticated: true, user: toPublicUser(user) });
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  });

  app.patch('/api/profile', requireAuth, async (req, res) => {
    try {
      const body = profileUpdateSchema.parse(req.body);
      if (typeof repository.updateUserProfile !== 'function') {
        return res.status(500).json({ error: 'Profile update is not available' });
      }
      const user = await repository.updateUserProfile({
        userId: req.user.id,
        fullName: sanitizeText(body.fullName, 120)
      });
      if (!user) return res.status(404).json({ error: 'User not found' });

      await logProjectAction(req, {
        actionType: 'profile.update',
        entityType: 'user',
        entityId: user.id,
        summary: 'Profile updated',
        details: { fullName: user.fullName }
      });

      return res.json({ ok: true, user: toPublicUser(user) });
    } catch (error) {
      if (isZodError(error)) return res.status(400).json({ error: error.issues[0]?.message || 'Invalid body' });
      return res.status(500).json({ error: error.message });
    }
  });

  app.post('/api/profile/change-password', requireAuth, async (req, res) => {
    try {
      const body = changePasswordSchema.parse(req.body);
      if (typeof repository.findUserAuthById !== 'function' || typeof repository.updateUserPassword !== 'function') {
        return res.status(500).json({ error: 'Password update is not available' });
      }

      const user = await repository.findUserAuthById(req.user.id);
      if (!user) return res.status(404).json({ error: 'User not found' });

      let validCurrentPassword = false;
      let validTotpCode = false;

      if (body.currentPassword) {
        validCurrentPassword = await verifyPassword(body.currentPassword, user.passwordHash);
      }

      if (body.totpCode && user.totpEnabled && user.totpSecret) {
        validTotpCode = verifyTotpCode(user.totpSecret, body.totpCode);
      }

      if (!validCurrentPassword && !validTotpCode) {
        return res.status(401).json({ error: 'Current password or TOTP code is invalid' });
      }

      const newPasswordHash = await hashPassword(body.newPassword);
      await repository.updateUserPassword({ userId: req.user.id, passwordHash: newPasswordHash });

      await logProjectAction(req, {
        actionType: 'profile.change_password',
        entityType: 'user',
        entityId: req.user.id,
        summary: 'Password changed',
        details: { authMethod: validCurrentPassword ? 'password' : 'totp' }
      });

      return res.json({ ok: true });
    } catch (error) {
      if (isZodError(error)) return res.status(400).json({ error: error.issues[0]?.message || 'Invalid body' });
      return res.status(500).json({ error: error.message });
    }
  });

  app.post('/api/profile/totp/setup', requireAuth, async (req, res) => {
    try {
      if (typeof repository.setTotpPendingSecret !== 'function') {
        return res.status(500).json({ error: 'TOTP setup is not available' });
      }

      const secret = generateTotpSecret();
      const user = await repository.setTotpPendingSecret({
        userId: req.user.id,
        pendingSecret: secret
      });
      if (!user) return res.status(404).json({ error: 'User not found' });

      const issuer = 'KitaabPadhoIndia';
      const otpauthUrl = createOtpAuthUrl({
        issuer,
        accountName: user.email,
        secret
      });

      await logProjectAction(req, {
        actionType: 'profile.totp_setup',
        entityType: 'user',
        entityId: user.id,
        summary: 'TOTP setup initiated'
      });

      return res.json({
        secret,
        otpauthUrl,
        accountName: user.email,
        issuer
      });
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  });

  app.post('/api/profile/totp/enable', requireAuth, async (req, res) => {
    try {
      const body = totpEnableSchema.parse(req.body);
      if (typeof repository.findUserAuthById !== 'function' || typeof repository.enableTotp !== 'function') {
        return res.status(500).json({ error: 'TOTP enable is not available' });
      }

      const user = await repository.findUserAuthById(req.user.id);
      if (!user) return res.status(404).json({ error: 'User not found' });
      if (!user.totpPendingSecret) return res.status(400).json({ error: 'Run TOTP setup first' });

      const valid = verifyTotpCode(user.totpPendingSecret, body.code);
      if (!valid) return res.status(400).json({ error: 'Invalid TOTP code' });

      const updated = await repository.enableTotp({ userId: user.id, secret: user.totpPendingSecret });
      await logProjectAction(req, {
        actionType: 'profile.totp_enable',
        entityType: 'user',
        entityId: user.id,
        summary: 'TOTP enabled'
      });
      return res.json({ ok: true, user: toPublicUser(updated) });
    } catch (error) {
      if (isZodError(error)) return res.status(400).json({ error: error.issues[0]?.message || 'Invalid body' });
      return res.status(500).json({ error: error.message });
    }
  });

  app.post('/api/profile/totp/disable', requireAuth, async (req, res) => {
    try {
      const currentPassword = typeof req.body?.currentPassword === 'string' ? req.body.currentPassword : '';
      const totpCode = typeof req.body?.totpCode === 'string' ? req.body.totpCode : '';

      if (!currentPassword && !totpCode) {
        return res.status(400).json({ error: 'Provide currentPassword or totpCode' });
      }
      if (typeof repository.findUserAuthById !== 'function' || typeof repository.disableTotp !== 'function') {
        return res.status(500).json({ error: 'TOTP disable is not available' });
      }

      const user = await repository.findUserAuthById(req.user.id);
      if (!user) return res.status(404).json({ error: 'User not found' });
      if (!user.totpEnabled || !user.totpSecret) return res.status(400).json({ error: 'TOTP is not enabled' });

      let validCurrentPassword = false;
      let validTotpCode = false;

      if (currentPassword) {
        validCurrentPassword = await verifyPassword(currentPassword, user.passwordHash);
      }
      if (totpCode) {
        validTotpCode = verifyTotpCode(user.totpSecret, totpCode);
      }
      if (!validCurrentPassword && !validTotpCode) {
        return res.status(401).json({ error: 'Current password or TOTP code is invalid' });
      }

      const updated = await repository.disableTotp({ userId: user.id });
      await logProjectAction(req, {
        actionType: 'profile.totp_disable',
        entityType: 'user',
        entityId: user.id,
        summary: 'TOTP disabled',
        details: { authMethod: validCurrentPassword ? 'password' : 'totp' }
      });
      return res.json({ ok: true, user: toPublicUser(updated) });
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  });

  app.get('/api/notifications', requireAuth, async (req, res) => {
    try {
      const queryFilters = notificationsQuerySchema.parse(req.query);
      const data =
        typeof repository.listNotifications === 'function'
          ? await repository.listNotifications({
              userId: req.user.id,
              unreadOnly: queryFilters.unreadOnly,
              limit: queryFilters.limit,
              offset: queryFilters.offset
            })
          : [];
      const unreadCount =
        typeof repository.countUnreadNotifications === 'function'
          ? await repository.countUnreadNotifications({ userId: req.user.id })
          : 0;

      return res.json({
        data,
        meta: {
          unreadCount,
          limit: queryFilters.limit,
          offset: queryFilters.offset
        }
      });
    } catch (error) {
      if (isZodError(error)) return res.status(400).json({ error: error.issues[0]?.message || 'Invalid query' });
      return res.status(500).json({ error: error.message });
    }
  });

  app.post('/api/notifications/:id/read', requireAuth, async (req, res) => {
    const notificationId = parseId(req.params.id);
    if (!notificationId) return res.status(400).json({ error: 'Invalid notification id' });
    try {
      if (typeof repository.markNotificationRead !== 'function') {
        return res.status(500).json({ error: 'Notification read is not available' });
      }
      const marked = await repository.markNotificationRead({
        userId: req.user.id,
        notificationId
      });
      if (!marked) return res.status(404).json({ error: 'Notification not found' });
      return res.json({ ok: true });
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  });

  app.post('/api/notifications/read-all', requireAuth, async (req, res) => {
    try {
      if (typeof repository.markAllNotificationsRead !== 'function') {
        return res.status(500).json({ error: 'Notification read-all is not available' });
      }
      const updated = await repository.markAllNotificationsRead({ userId: req.user.id });
      return res.json({ ok: true, updated });
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  });

  app.get('/api/areas', async (_, res) => {
    try {
      const areaRows = typeof repository.listAreaOptions === 'function' ? await repository.listAreaOptions() : [];
      return res.json({
        data: [
          { value: 'all', label: 'All Areas', listingCount: 0 },
          ...areaRows.map((item) => ({
            value: item.areaCode,
            label: item.areaName || titleCaseFromCode(item.areaCode),
            listingCount: Number(item.listingCount || 0)
          }))
        ]
      });
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  });

  app.get('/api/location/nearby', async (req, res) => {
    const lat = Number(req.query.lat);
    const lon = Number(req.query.lon);
    if (Number.isNaN(lat) || Number.isNaN(lon)) {
      return res.status(400).json({ error: 'lat and lon are required numbers' });
    }

    const [nearbyCities, areaRows] = await Promise.all([
      typeof repository.listNearbyCities === 'function'
        ? repository.listNearbyCities({ lat, lon, radiusKm: 250, limit: 12 }).catch(() => [])
        : Promise.resolve([]),
      typeof repository.listAreaOptions === 'function' ? repository.listAreaOptions().catch(() => []) : Promise.resolve([])
    ]);

    try {
      const reverse = await reverseGeocodeFetch(
        `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lon}`,
        { headers: { 'User-Agent': 'kitaabpadho/2.0' } }
      );
      const geo = reverse.ok ? await reverse.json() : {};
      return res.json({
        current: {
          latitude: lat,
          longitude: lon,
          address: geo.display_name || 'Detected location'
        },
        nearbyCities,
        areaOptions: areaRows.map((item) => ({
          value: item.areaCode,
          label: item.areaName || titleCaseFromCode(item.areaCode),
          listingCount: Number(item.listingCount || 0)
        })),
        hint: 'Listings are dynamically sorted by distance from your location (200 km radius).'
      });
    } catch {
      return res.json({
        current: {
          latitude: lat,
          longitude: lon,
          address: 'Location detected (offline geocoder)'
        },
        nearbyCities,
        areaOptions: areaRows.map((item) => ({
          value: item.areaCode,
          label: item.areaName || titleCaseFromCode(item.areaCode),
          listingCount: Number(item.listingCount || 0)
        })),
        hint: 'Geocoder unavailable, but geo-filtering still works (200 km radius).'
      });
    }
  });

  app.get('/api/listings', async (req, res) => {
    try {
      const parsed = listingQuerySchema.parse(req.query);
      const filters =
        typeof parsed.lat === 'number' && typeof parsed.lon === 'number' && typeof parsed.radiusKm !== 'number'
          ? { ...parsed, radiusKm: 200 }
          : parsed;
      const data = await repository.listListings(filters);
      const total = await repository.countListings(filters);
      return res.json({
        data,
        meta: {
          total,
          limit: filters.limit,
          offset: filters.offset
        }
      });
    } catch (error) {
      if (isZodError(error)) return res.status(400).json({ error: error.issues[0]?.message || 'Invalid query' });
      return res.status(500).json({ error: error.message });
    }
  });

  app.get('/api/listings/:id', async (req, res) => {
    const listingId = parseId(req.params.id);
    if (!listingId) return res.status(400).json({ error: 'Invalid listing id' });

    try {
      const listing = await repository.getListingById(listingId);
      if (!listing) return res.status(404).json({ error: 'Listing not found' });
      return res.json(listing);
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  });

  app.post('/api/listings', listingWriteLimiter, requireAuth, async (req, res) => {
    try {
      const body = listingSchema.parse(req.body);
      const listing = await repository.createListing({
        ...body,
        title: body.title.trim(),
        description: body.description.trim(),
        city: body.city.trim(),
        createdBy: req.user.id
      });
      await logProjectAction(req, {
        actionType: 'listing.create',
        entityType: 'listing',
        entityId: listing.id,
        summary: 'Marketplace listing created',
        details: {
          listingType: listing.listingType,
          category: listing.category,
          areaCode: listing.areaCode
        }
      });
      if (typeof repository.notifyAllUsersAboutListing === 'function') {
        await repository.notifyAllUsersAboutListing({
          actorId: req.user.id,
          listingId: listing.id,
          title: listing.title,
          city: listing.city,
          listingType: listing.listingType,
          category: listing.category
        });
      }

      publishRealtimeEvent('listing.created', {
        id: listing.id,
        title: listing.title,
        city: listing.city,
        listingType: listing.listingType,
        category: listing.category
      });
      publishRealtimeEvent('notifications.invalidate', { source: 'listing.create' });

      return res.status(201).json(listing);
    } catch (error) {
      if (isZodError(error)) return res.status(400).json({ error: error.issues[0]?.message || 'Invalid body' });
      return res.status(500).json({ error: error.message });
    }
  });

  app.post('/api/listings/:id/media', listingWriteLimiter, requireAuth, upload.single('file'), async (req, res) => {
    const listingId = parseId(req.params.id);
    if (!listingId) return res.status(400).json({ error: 'Invalid listing id' });
    if (!req.file) return res.status(400).json({ error: 'file is required' });

    const allowed = ['image/', 'video/', 'application/pdf'];
    if (!allowed.some((prefix) => req.file.mimetype.startsWith(prefix))) {
      return res.status(400).json({ error: 'Only image/video/pdf files are supported' });
    }

    try {
      const listing = await repository.getListingOwner(listingId);
      if (!listing) return res.status(404).json({ error: 'Listing not found' });
      if (Number(listing.createdBy) !== Number(req.user.id)) {
        return res.status(403).json({ error: 'You can only upload media to your own listing' });
      }

      const key = `listings/${listingId}/${Date.now()}-${req.file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
      const uploaded = await uploadMediaFn({
        buffer: req.file.buffer,
        contentType: req.file.mimetype,
        key
      });

      const media = await repository.createListingMedia({
        listingId,
        key: uploaded.key,
        url: uploaded.url,
        mediaType: req.file.mimetype
      });
      await logProjectAction(req, {
        actionType: 'listing.media_upload',
        entityType: 'listing',
        entityId: listingId,
        summary: 'Listing media uploaded',
        details: {
          mediaId: media.id,
          mediaType: req.file.mimetype,
          key: uploaded.key
        }
      });

      return res.json({ ...media, r2Enabled: r2EnabledFlag });
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  });

  app.post('/api/media/upload', upload.single('file'), async (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'file is required' });
    const allowed = ['image/', 'video/', 'application/pdf'];
    if (!allowed.some((prefix) => req.file.mimetype.startsWith(prefix))) {
      return res.status(400).json({ error: 'Only image/video/pdf files are supported' });
    }

    const key = `uploads/${Date.now()}-${req.file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
    try {
      const uploaded = await uploadMediaFn({
        buffer: req.file.buffer,
        contentType: req.file.mimetype,
        key
      });
      return res.json({ ...uploaded, r2Enabled: r2EnabledFlag });
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  });

  app.get('/api/community/categories', async (_, res) => {
    try {
      const data = await repository.listCommunityCategories();
      return res.json({ data });
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  });

  app.get('/api/community/posts', async (req, res) => {
    try {
      const filters = communityListQuerySchema.parse(req.query);
      const data = await repository.listCommunityPosts(filters);
      const total = await repository.countCommunityPosts(filters);
      return res.json({
        data,
        meta: { total, limit: filters.limit, offset: filters.offset }
      });
    } catch (error) {
      if (isZodError(error)) return res.status(400).json({ error: error.issues[0]?.message || 'Invalid query' });
      return res.status(500).json({ error: error.message });
    }
  });

  app.get('/api/community/posts/:id', async (req, res) => {
    const postId = parseId(req.params.id);
    if (!postId) return res.status(400).json({ error: 'Invalid post id' });

    try {
      const post = await repository.getCommunityPostById(postId);
      if (!post) return res.status(404).json({ error: 'Post not found' });
      return res.json(post);
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  });

  app.post('/api/community/posts', communityWriteLimiter, requireAuth, async (req, res) => {
    try {
      const body = communityPostSchema.parse(req.body);
      const category = await repository.findCommunityCategoryBySlug(body.categorySlug);
      if (!category) return res.status(400).json({ error: 'Invalid categorySlug' });

      const post = await repository.createCommunityPost({
        title: sanitizeText(body.title, 160),
        content: sanitizeText(body.content, 4000),
        categoryId: category.id,
        createdBy: req.user.id
      });
      await logProjectAction(req, {
        actionType: 'community.post_create',
        entityType: 'community_post',
        entityId: post.id,
        summary: 'Community post created',
        details: { categorySlug: body.categorySlug }
      });

      const fullPost = await repository.getCommunityPostById(post.id);
      publishRealtimeEvent('community.updated', { type: 'post_created', postId: post.id });
      return res.status(201).json(fullPost || post);
    } catch (error) {
      if (isZodError(error)) return res.status(400).json({ error: error.issues[0]?.message || 'Invalid body' });
      return res.status(500).json({ error: error.message });
    }
  });

  app.post('/api/community/posts/:id/comments', communityWriteLimiter, requireAuth, async (req, res) => {
    const postId = parseId(req.params.id);
    if (!postId) return res.status(400).json({ error: 'Invalid post id' });

    try {
      const post = await repository.getCommunityPostById(postId);
      if (!post) return res.status(404).json({ error: 'Post not found' });

      const body = communityCommentSchema.parse(req.body);
      const comment = await repository.createCommunityComment({
        postId,
        createdBy: req.user.id,
        content: sanitizeText(body.content, 1000)
      });
      await logProjectAction(req, {
        actionType: 'community.comment_create',
        entityType: 'community_comment',
        entityId: comment.id,
        summary: 'Community comment added',
        details: { postId }
      });
      if (typeof repository.createUserNotification === 'function' && Number(post.createdBy) !== Number(req.user.id)) {
        await repository.createUserNotification({
          userId: post.createdBy,
          kind: 'community_message',
          title: 'New comment on your post',
          body: `${req.user.fullName || 'A member'} replied: ${String(comment.content || '').slice(0, 140)}`,
          entityType: 'community_post',
          entityId: postId
        });
        publishRealtimeEvent(
          'notifications.invalidate',
          { source: 'community.comment', postId, actorName: req.user.fullName || '' },
          post.createdBy
        );
      }
      publishRealtimeEvent('community.updated', { type: 'comment_created', postId, commentId: comment.id });
      return res.status(201).json({ ...comment, authorName: req.user.fullName });
    } catch (error) {
      if (isZodError(error)) return res.status(400).json({ error: error.issues[0]?.message || 'Invalid body' });
      return res.status(500).json({ error: error.message });
    }
  });

  app.delete('/api/community/comments/:id', communityWriteLimiter, requireAuth, async (req, res) => {
    const commentId = parseId(req.params.id);
    if (!commentId) return res.status(400).json({ error: 'Invalid comment id' });

    try {
      const deleted = await repository.deleteCommunityComment(commentId, req.user.id);
      if (!deleted) return res.status(404).json({ error: 'Comment not found or forbidden' });
      await logProjectAction(req, {
        actionType: 'community.comment_delete',
        entityType: 'community_comment',
        entityId: commentId,
        summary: 'Community comment deleted'
      });
      publishRealtimeEvent('community.updated', { type: 'comment_deleted', commentId });
      return res.json({ ok: true });
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  });

  app.post('/api/ai/chat', async (req, res) => {
    try {
      const body = aiSchema.parse(req.body);
      const prompt = sanitizeText(body.prompt, 2000);
      const hasCoords = typeof body.lat === 'number' && typeof body.lon === 'number';
      const lat = hasCoords ? body.lat : null;
      const lon = hasCoords ? body.lon : null;
      const cityHint = body.city ? sanitizeText(body.city, 100) : '';

      let preferences = {
        examFocus: '',
        preferredCategories: [],
        preferredStationery: [],
        preferredRadiusKm: 200
      };
      if (req.user?.id && typeof repository.getUserPreferences === 'function') {
        preferences = await repository.getUserPreferences(req.user.id);
      }

      const inferred = inferPreferencePatch(preferences, prompt);
      if (req.user?.id && inferred.changed && typeof repository.upsertUserPreferences === 'function') {
        preferences = await repository.upsertUserPreferences({
          userId: req.user.id,
          examFocus: inferred.examFocus || '',
          preferredCategories: inferred.preferredCategories || [],
          preferredStationery: inferred.preferredStationery || [],
          preferredRadiusKm: inferred.preferredRadiusKm || 200
        });
      } else {
        preferences = {
          ...preferences,
          examFocus: inferred.examFocus || preferences.examFocus || '',
          preferredCategories: inferred.preferredCategories || preferences.preferredCategories || [],
          preferredStationery: inferred.preferredStationery || preferences.preferredStationery || [],
          preferredRadiusKm: inferred.preferredRadiusKm || preferences.preferredRadiusKm || 200
        };
      }

      const radiusKm = Math.min(500, Math.max(25, Number(body.radiusKm || preferences.preferredRadiusKm || 200)));
      const preferredCategories = normalizeArray(preferences.preferredCategories);

      let memoryRows = [];
      if (req.user?.id && typeof repository.listRecentAiChatMemory === 'function') {
        memoryRows = await repository.listRecentAiChatMemory({ userId: req.user.id, limit: 10 });
      }

      if (req.user?.id && typeof repository.addAiChatMemory === 'function') {
        await repository.addAiChatMemory({ userId: req.user.id, role: 'user', message: truncateText(prompt, 3500) });
      }

      let ragListings = [];
      if (typeof repository.searchListingsForAi === 'function') {
        ragListings = await repository.searchListingsForAi({
          q: truncateText(prompt, 160),
          lat,
          lon,
          city: cityHint,
          categories: preferredCategories,
          radiusKm,
          limit: 8
        });
      } else if (typeof repository.listListings === 'function') {
        ragListings = await repository.listListings({
          q: truncateText(prompt, 120),
          city: cityHint || undefined,
          lat,
          lon,
          radiusKm,
          sort: hasCoords ? 'distance' : 'newest',
          limit: 8,
          offset: 0
        });
      }

      const nearbyStationery =
        typeof repository.listNearbyStationery === 'function'
          ? await repository.listNearbyStationery({
              lat,
              lon,
              city: cityHint,
              radiusKm,
              limit: 8
            })
          : [];

      const nearbyCities =
        hasCoords && typeof repository.listNearbyCities === 'function'
          ? await repository.listNearbyCities({ lat, lon, radiusKm: 250, limit: 8 })
          : [];

      const locationText = hasCoords
        ? `Latitude: ${lat}, Longitude: ${lon}`
        : cityHint
          ? `City hint: ${cityHint}`
          : 'No location shared';
      const nearbyCitiesText = nearbyCities.length
        ? nearbyCities
            .map(
              (item, index) =>
                `${index + 1}. ${item.city} (${Number(item.distanceKm || 0).toFixed(1)} km, ${Number(item.listingCount || 0)} listings)`
            )
            .join('\n')
        : 'No nearby cities found.';

      const systemPrompt = [
        'You are PadhAI for KitaabPadhoIndia.',
        'Rules: respond in natural, direct conversation.',
        'No meta lines, no self-references, no mention of hidden context.',
        'Use the provided memory and marketplace data to answer follow-up queries correctly.',
        'For product/stationery suggestions, prefer items from provided listings and respect user preferences and radius.'
      ].join('\n');

      const messages = [
        ...memoryRows.map((row) => ({
          role: row.role === 'assistant' ? 'assistant' : 'user',
          content: truncateText(row.message, 1200)
        })),
        {
          role: 'user',
          content: [
            `User: ${req.user?.fullName || 'Guest'}`,
            `Exam Focus: ${preferences.examFocus || 'not set'}`,
            `Preferred Categories: ${(preferences.preferredCategories || []).join(', ') || 'not set'}`,
            `Preferred Stationery: ${(preferences.preferredStationery || []).join(', ') || 'not set'}`,
            `Preferred Radius: ${radiusKm} km`,
            `Location: ${locationText}`,
            'Nearby Cities (<=250 km):',
            nearbyCitiesText,
            'Marketplace Matches:',
            formatListingsForPrompt(ragListings),
            'Stationery Matches:',
            formatListingsForPrompt(nearbyStationery),
            'Current User Message:',
            prompt
          ].join('\n')
        }
      ];

      const aiInput = askAiFn === askPadhAI ? { prompt, systemPrompt, messages } : prompt;
      const ai = await askAiFn(aiInput);

      if (req.user?.id && typeof repository.addAiChatMemory === 'function' && ai?.text) {
        await repository.addAiChatMemory({
          userId: req.user.id,
          role: 'assistant',
          message: truncateText(ai.text, 3500)
        });
      }

      await logProjectAction(req, {
        actionType: 'ai.chat',
        entityType: 'assistant',
        summary: 'AI chat request processed',
        details: {
          provider: ai.provider,
          promptLength: String(prompt).length,
          memoryItems: memoryRows.length,
          ragListings: ragListings.length,
          stationeryMatches: nearbyStationery.length,
          hasCoords
        }
      });
      return res.json({
        ...ai,
        context: {
          memoryItems: memoryRows.length,
          nearbyCities: nearbyCities.slice(0, 5),
          radiusKm
        }
      });
    } catch (error) {
      if (isZodError(error)) return res.status(400).json({ error: error.issues[0]?.message || 'Invalid body' });
      return res.status(500).json({ error: error.message });
    }
  });

  app.get('/api/admin/summary', requireAuth, requireAdmin, async (req, res) => {
    try {
      const summary =
        typeof repository.getAdminSummary === 'function'
          ? await repository.getAdminSummary()
          : {
              users: 0,
              listings: 0,
              communityPosts: 0,
              communityComments: 0,
              actionsTotal: 0,
              actionsLast24h: 0
            };
      await logProjectAction(req, {
        actionType: 'admin.summary_view',
        entityType: 'admin_panel',
        summary: 'Admin viewed platform summary'
      });
      return res.json(summary);
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  });

  app.get('/api/admin/actions', requireAuth, requireAdmin, async (req, res) => {
    try {
      const filters = adminActionQuerySchema.parse(req.query);
      const data =
        typeof repository.listProjectActions === 'function' ? await repository.listProjectActions(filters) : [];
      const total =
        typeof repository.countProjectActions === 'function'
          ? await repository.countProjectActions(filters)
          : data.length;
      await logProjectAction(req, {
        actionType: 'admin.actions_view',
        entityType: 'admin_panel',
        summary: 'Admin viewed project action feed',
        details: {
          actionType: filters.actionType || '',
          entityType: filters.entityType || '',
          hasSearch: Boolean(filters.q),
          limit: filters.limit,
          offset: filters.offset
        }
      });
      return res.json({
        data,
        meta: {
          total,
          limit: filters.limit,
          offset: filters.offset
        }
      });
    } catch (error) {
      if (isZodError(error)) return res.status(400).json({ error: error.issues[0]?.message || 'Invalid query' });
      return res.status(500).json({ error: error.message });
    }
  });

  app.get('/api/admin/users', requireAuth, requireAdmin, async (req, res) => {
    try {
      const filters = adminUsersQuerySchema.parse(req.query);
      const data =
        typeof repository.listUsers === 'function'
          ? await repository.listUsers({
              q: filters.q || '',
              limit: filters.limit,
              offset: filters.offset
            })
          : [];
      const total = typeof repository.countUsers === 'function' ? await repository.countUsers({ q: filters.q || '' }) : data.length;

      await logProjectAction(req, {
        actionType: 'admin.users_view',
        entityType: 'admin_panel',
        summary: 'Admin viewed users'
      });

      return res.json({
        data: data.map(toPublicUser),
        meta: { total, limit: filters.limit, offset: filters.offset }
      });
    } catch (error) {
      if (isZodError(error)) return res.status(400).json({ error: error.issues[0]?.message || 'Invalid query' });
      return res.status(500).json({ error: error.message });
    }
  });

  app.get('/api/admin/users/:id/history', requireAuth, requireAdmin, async (req, res) => {
    const actorId = parseId(req.params.id);
    if (!actorId) return res.status(400).json({ error: 'Invalid user id' });
    try {
      const filters = adminActionQuerySchema.parse(req.query);
      const mergedFilters = { ...filters, actorId };
      const data =
        typeof repository.listProjectActions === 'function' ? await repository.listProjectActions(mergedFilters) : [];
      const total =
        typeof repository.countProjectActions === 'function'
          ? await repository.countProjectActions(mergedFilters)
          : data.length;
      return res.json({
        data,
        meta: { total, limit: mergedFilters.limit, offset: mergedFilters.offset }
      });
    } catch (error) {
      if (isZodError(error)) return res.status(400).json({ error: error.issues[0]?.message || 'Invalid query' });
      return res.status(500).json({ error: error.message });
    }
  });

  app.post('/api/admin/change-password', requireAuth, requireAdmin, async (req, res) => {
    try {
      const body = adminChangePasswordSchema.parse(req.body);
      if (typeof repository.findUserAuthById !== 'function' || typeof repository.updateUserPassword !== 'function') {
        return res.status(500).json({ error: 'Admin password change is not available' });
      }

      const adminUser = await repository.findUserAuthById(req.user.id);
      if (!adminUser) return res.status(404).json({ error: 'User not found' });
      const validCurrent = await verifyPassword(body.currentPassword, adminUser.passwordHash);
      if (!validCurrent) return res.status(401).json({ error: 'Current password is invalid' });

      const newPasswordHash = await hashPassword(body.newPassword);
      await repository.updateUserPassword({ userId: req.user.id, passwordHash: newPasswordHash });

      await logProjectAction(req, {
        actionType: 'admin.change_password',
        entityType: 'user',
        entityId: req.user.id,
        summary: 'Admin changed own password'
      });

      return res.json({ ok: true });
    } catch (error) {
      if (isZodError(error)) return res.status(400).json({ error: error.issues[0]?.message || 'Invalid body' });
      return res.status(500).json({ error: error.message });
    }
  });

  app.post('/api/admin/users/reset-password', requireAuth, requireAdmin, async (req, res) => {
    try {
      const body = adminResetUserPasswordSchema.parse(req.body);
      if (typeof repository.adminResetUserPassword !== 'function') {
        return res.status(500).json({ error: 'Admin user password reset is not available' });
      }

      const newPasswordHash = await hashPassword(body.newPassword);
      const user = await repository.adminResetUserPassword({
        email: body.email,
        passwordHash: newPasswordHash
      });
      if (!user) return res.status(404).json({ error: 'User not found' });

      await logProjectAction(req, {
        actionType: 'admin.reset_user_password',
        entityType: 'user',
        entityId: user.id,
        summary: 'Admin reset user password',
        details: { targetEmail: user.email }
      });

      return res.json({ ok: true, user: toPublicUser(user) });
    } catch (error) {
      if (isZodError(error)) return res.status(400).json({ error: error.issues[0]?.message || 'Invalid body' });
      return res.status(500).json({ error: error.message });
    }
  });

  app.get('/manifest.webmanifest', (_, res) => {
    res.sendFile(path.join(process.cwd(), 'public', 'manifest.webmanifest'));
  });

  app.get('*', (_, res) => {
    res.sendFile(path.join(process.cwd(), 'public', 'index.html'));
  });

  return app;
}

if (require.main === module) {
  const app = createApp();

  (async () => {
    try {
      await runDbBootstrap({ logger: console });
      app.listen(config.port, () => {
        console.log(`KitaabPadho revamp running on ${config.appBaseUrl}`);
      });
    } catch (error) {
      console.error(`Startup failed: ${error.message}`);
      process.exit(1);
    }
  })();
}

module.exports = { createApp };
