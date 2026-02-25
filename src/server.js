const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const cookieParser = require('cookie-parser');
const path = require('path');
const multer = require('multer');
const webpush = require('web-push');
const QRCode = require('qrcode');
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
  listingUpdateSchema,
  listingQuerySchema,
  authRegisterSchema,
  authLoginSchema,
  profileUpdateSchema,
  changePasswordSchema,
  totpEnableSchema,
  communityPostSchema,
  communityPostUpdateSchema,
  communityCommentSchema,
  communityCommentUpdateSchema,
  communityListQuerySchema,
  notificationsQuerySchema,
  adminActionQuerySchema,
  adminUsersQuerySchema,
  adminUserCreateSchema,
  adminUserUpdateSchema,
  adminResetUserPasswordSchema,
  adminChangePasswordSchema,
  aiSchema,
  totpSignupSetupSchema,
  pushToggleSchema,
  pushSubscribeSchema,
  deliveryJobsQuerySchema,
  deliveryJobStatusSchema,
  orderStatuses,
  marketplaceOrderCreateSchema,
  marketplaceOrdersQuerySchema,
  marketplaceOrderStatusSchema,
  marketplaceOrderNoteSchema,
  feedbackCreateSchema,
  feedbackListQuerySchema,
  bannerQuerySchema,
  bannerSchema,
  bannerUpdateSchema,
  locationGeocodeSchema
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
    phoneNumber: user.phoneNumber || '',
    role: user.role,
    pushEnabled: Boolean(user.pushEnabled),
    totpEnabled: Boolean(user.totpEnabled)
  };
}

function titleCaseFromCode(value) {
  return String(value || '')
    .replaceAll('_', ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function slugifyAreaCode(value, fallback = 'unknown') {
  const normalized = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return normalized || fallback;
}

function normalizeRole(inputRole) {
  const role = String(inputRole || 'student').trim().toLowerCase();
  if (role === 'seller' || role === 'delivery' || role === 'student') return role;
  return 'student';
}

function uniquePushString(target, value) {
  const normalized = String(value || '').trim();
  if (normalized.length < 2) return;
  if (target.some((item) => item.toLowerCase() === normalized.toLowerCase())) return;
  target.push(normalized);
}

function deriveLocalityContext(geo, nearbyCities = []) {
  const address = geo && typeof geo === 'object' ? geo.address || {} : {};
  const currentCity = String(address.city || address.town || address.village || address.county || '').trim();
  const currentLocality = String(address.suburb || address.neighbourhood || address.city_district || address.quarter || '').trim();
  const localityNames = [];

  uniquePushString(localityNames, address.suburb);
  uniquePushString(localityNames, address.neighbourhood);
  uniquePushString(localityNames, address.city_district);
  uniquePushString(localityNames, address.quarter);
  uniquePushString(localityNames, address.city);
  uniquePushString(localityNames, address.town);
  uniquePushString(localityNames, address.village);
  uniquePushString(localityNames, address.county);
  for (const cityRow of nearbyCities) {
    uniquePushString(localityNames, cityRow?.city);
  }

  const fallbackCity = String(currentCity || nearbyCities?.[0]?.city || '').trim();
  const localityOptions = localityNames.slice(0, 12).map((name) => ({
    name,
    filterCity: fallbackCity || name
  }));

  return {
    currentCity,
    currentLocality,
    localityOptions
  };
}

function truncateText(value, maxLen) {
  return String(value || '').slice(0, maxLen);
}

function asMoney(value, fallback = 0) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return Number(fallback || 0);
  return Number(amount.toFixed(2));
}

function haversineDistanceKm(fromLat, fromLon, toLat, toLon) {
  const lat1 = Number(fromLat);
  const lon1 = Number(fromLon);
  const lat2 = Number(toLat);
  const lon2 = Number(toLon);
  if (![lat1, lon1, lat2, lon2].every((value) => Number.isFinite(value))) return 0;
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return 6371 * c;
}

function computeDeliveryCharge({ distanceKm = 0, ratePer10Km = 20 }) {
  const distance = Math.max(0, Number(distanceKm || 0));
  const rate = Math.max(0, Number(ratePer10Km || 0));
  if (distance === 0 || rate === 0) return 0;
  return asMoney(Math.ceil(distance / 10) * rate, 0);
}

function buildFeedbackObjectKey(sourcePortal = 'client') {
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, '0');
  const stamp = `${now.getTime()}-${Math.random().toString(36).slice(2, 10)}`;
  return `feedback/${sourcePortal}/${year}/${month}/${stamp}.json`;
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

  if (appConfig.push?.vapidPublicKey && appConfig.push?.vapidPrivateKey) {
    webpush.setVapidDetails(appConfig.push.subject, appConfig.push.vapidPublicKey, appConfig.push.vapidPrivateKey);
  }

  const app = express();
  const upload = multer({ limits: { fileSize: 30 * 1024 * 1024 } });
  const cookieOptions = sessionCookieOptions(appConfig);
  const clearCookieOptions = { ...cookieOptions };
  delete clearCookieOptions.maxAge;
  const sseClients = new Set();
  const validOrderStatuses = new Set(orderStatuses);
  app.set('trust proxy', 1);

  const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 60,
    standardHeaders: true,
    legacyHeaders: false
  });
  const listingWriteLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 120,
    standardHeaders: true,
    legacyHeaders: false
  });
  const communityWriteLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 120,
    standardHeaders: true,
    legacyHeaders: false
  });
  const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 1200,
    standardHeaders: true,
    legacyHeaders: false,
    skip: (req) => req.path === '/events/stream'
  });

  app.use(helmet({ contentSecurityPolicy: false }));
  app.use(cors({ origin: appConfig.corsOrigin, credentials: true }));
  app.use(express.static(path.join(process.cwd(), 'public')));
  app.use(express.json({ limit: '1mb' }));
  app.use(cookieParser());
  app.use('/api', apiLimiter);

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

  const requireRole = (allowedRoles = []) => async (req, res, next) => {
    if (!req.user?.id) return res.status(401).json({ error: 'Authentication required' });
    try {
      const freshUser = await repository.findUserById(req.user.id);
      if (!freshUser) return res.status(401).json({ error: 'Authentication required' });
      const role = String(freshUser.role || '').toLowerCase();
      const allowed = new Set(allowedRoles.map((item) => String(item || '').toLowerCase()));
      if (role !== 'admin' && !allowed.has(role)) {
        return res.status(403).json({ error: `Role ${allowedRoles.join(' or ')} required` });
      }
      req.user = { ...req.user, role: freshUser.role, email: freshUser.email, fullName: freshUser.fullName };
      return next();
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  };

  const resolveActorPermissions = async (req) => {
    if (!req.user?.id) return { isAdmin: false };
    try {
      const freshUser = await repository.findUserById(req.user.id);
      if (!freshUser) return { isAdmin: false };
      req.user = { ...req.user, role: freshUser.role, email: freshUser.email, fullName: freshUser.fullName };
      return { isAdmin: freshUser.role === 'admin' };
    } catch {
      return { isAdmin: req.user?.role === 'admin' };
    }
  };

  const isUsernameTaken = async (fullName) => {
    if (!fullName) return false;
    if (typeof repository.findUserByFullName === 'function') {
      const user = await repository.findUserByFullName(fullName);
      return Boolean(user);
    }
    try {
      const existing = await queryFn(`SELECT id FROM users WHERE lower(full_name) = lower($1) LIMIT 1`, [fullName]);
      return existing.rowCount > 0;
    } catch {
      return false;
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

  const sendWebPushToSubscriptions = async (subscriptions, payload) => {
    if (!Array.isArray(subscriptions) || subscriptions.length === 0) return 0;
    if (!appConfig.push?.vapidPublicKey || !appConfig.push?.vapidPrivateKey) return 0;

    const data = JSON.stringify(payload);
    let delivered = 0;
    await Promise.all(
      subscriptions.map(async (subscription) => {
        try {
          await webpush.sendNotification(subscription, data);
          delivered += 1;
        } catch {
          // Ignore stale tokens for resilience.
        }
      })
    );
    return delivered;
  };

  const pushToUser = async (userId, payload) => {
    if (!userId || typeof repository.listPushSubscriptionsByUser !== 'function') return 0;
    const subscriptions = await repository.listPushSubscriptionsByUser({ userId });
    return sendWebPushToSubscriptions(subscriptions, payload);
  };

  app.get('/api/health', (_, res) => res.json({ ok: true, stack: 'express-neon-r2-pwa' }));

  app.get('/api/portals', (_, res) => {
    return res.json({
      buyer: `${appConfig.appBaseUrl}/`,
      admin: `${appConfig.appBaseUrl}/admin`,
      seller: `${appConfig.appBaseUrl}/seller`,
      delivery: `${appConfig.appBaseUrl}/delivery`
    });
  });

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

  app.post('/api/auth/signup/totp/setup', authLimiter, async (req, res) => {
    try {
      const body = totpSignupSetupSchema.parse(req.body);
      const existingByEmail = await repository.findUserByEmail(body.email);
      if (existingByEmail) return res.status(409).json({ error: 'Email already registered' });
      if (await isUsernameTaken(body.fullName)) return res.status(409).json({ error: 'Username already used' });

      const secret = generateTotpSecret();
      const otpauthUrl = createOtpAuthUrl({
        issuer: 'KitaabPadhoIndia',
        accountName: body.email,
        secret
      });
      const qrDataUrl = await QRCode.toDataURL(otpauthUrl, { width: 220, margin: 1 });

      return res.json({
        secret,
        otpauthUrl,
        qrDataUrl
      });
    } catch (error) {
      if (isZodError(error)) return res.status(400).json({ error: error.issues[0]?.message || 'Invalid input' });
      return res.status(500).json({ error: error.message });
    }
  });

  app.post('/api/auth/register', authLimiter, async (req, res) => {
    try {
      const body = authRegisterSchema.parse(req.body);
      const existing = await repository.findUserByEmail(body.email);
      if (existing) return res.status(409).json({ error: 'Email already registered' });
      if (await isUsernameTaken(body.fullName)) return res.status(409).json({ error: 'Username already used' });

      const wantsTotpOnSignup = Boolean(body.totpSecret && body.totpCode);
      if (wantsTotpOnSignup) {
        const validTotp = verifyTotpCode(body.totpSecret, body.totpCode);
        if (!validTotp) return res.status(400).json({ error: 'Invalid TOTP secret/code pair' });
      }

      const passwordHash = await hashPassword(body.password);
      let user = await repository.createUser({
        email: body.email,
        fullName: body.fullName,
        phoneNumber: body.phoneNumber || '',
        passwordHash,
        role: normalizeRole(body.role)
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
        details: { email: user.email, role: user.role }
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
        fullName: sanitizeText(body.fullName, 120),
        phoneNumber: sanitizeText(body.phoneNumber, 20)
      });
      if (!user) return res.status(404).json({ error: 'User not found' });

      await logProjectAction(req, {
        actionType: 'profile.update',
        entityType: 'user',
        entityId: user.id,
        summary: 'Profile updated',
        details: { fullName: user.fullName, phoneNumber: user.phoneNumber || '' }
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

      res.clearCookie(appConfig.sessionCookieName, clearCookieOptions);
      return res.json({ ok: true, reauthRequired: true });
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

  app.post('/api/feedback', async (req, res) => {
    try {
      const body = feedbackCreateSchema.parse(req.body);
      if (typeof repository.createFeedback !== 'function') {
        return res.status(500).json({ error: 'Feedback API is not available' });
      }

      const authUser = req.user?.id ? await repository.findUserById(req.user.id).catch(() => null) : null;
      const senderName = authUser?.fullName || sanitizeText(body.senderName || '', 120);
      const senderEmail = authUser?.email || sanitizeText(body.senderEmail || '', 180);
      if (!senderName || !senderEmail) {
        return res.status(400).json({ error: 'Name and email are required for feedback.' });
      }

      const sourcePortal = body.sourcePortal || 'client';
      const feedbackPayload = {
        sourcePortal,
        senderName,
        senderEmail,
        senderRole: authUser?.role || 'guest',
        subject: sanitizeText(body.subject, 160),
        message: sanitizeText(body.message, 3000)
      };

      let attachmentKey = '';
      const feedbackObject = {
        ...feedbackPayload,
        userId: authUser?.id || null,
        submittedAt: new Date().toISOString()
      };
      const serializedFeedback = JSON.stringify(feedbackObject, null, 2);
      try {
        const key = buildFeedbackObjectKey(sourcePortal);
        const uploaded = await uploadMediaFn({
          buffer: Buffer.from(serializedFeedback),
          contentType: 'application/json',
          key
        });
        attachmentKey = uploaded?.key || key;
      } catch {
        attachmentKey = '';
      }

      const feedback = await repository.createFeedback({
        ...feedbackPayload,
        userId: authUser?.id || null,
        attachmentKey
      });

      await logProjectAction(req, {
        actor: authUser || req.user,
        actionType: 'feedback.create',
        entityType: 'feedback',
        entityId: feedback?.id || null,
        summary: 'Customer support query submitted',
        details: { sourcePortal, senderRole: feedbackPayload.senderRole }
      });

      if (authUser?.id) {
        publishRealtimeEvent('feedback.updated', { type: 'feedback_created', feedbackId: feedback?.id }, authUser.id);
      }

      return res.status(201).json({ ok: true, feedback, r2Enabled: r2EnabledFlag });
    } catch (error) {
      if (isZodError(error)) return res.status(400).json({ error: error.issues[0]?.message || 'Invalid body' });
      return res.status(500).json({ error: error.message });
    }
  });

  app.get('/api/feedback/mine', requireAuth, async (req, res) => {
    try {
      if (typeof repository.listFeedbackForUser !== 'function') {
        return res.json({ data: [], meta: { limit: 20, offset: 0 } });
      }
      const queryFilters = feedbackListQuerySchema.parse(req.query);
      const data = await repository.listFeedbackForUser({
        userId: req.user.id,
        limit: queryFilters.limit,
        offset: queryFilters.offset
      });
      return res.json({
        data,
        meta: { limit: queryFilters.limit, offset: queryFilters.offset, total: data.length }
      });
    } catch (error) {
      if (isZodError(error)) return res.status(400).json({ error: error.issues[0]?.message || 'Invalid query' });
      return res.status(500).json({ error: error.message });
    }
  });

  app.get('/api/banners', async (req, res) => {
    try {
      const filters = bannerQuerySchema.parse(req.query);
      const data = typeof repository.listPublicBanners === 'function' ? await repository.listPublicBanners(filters) : [];
      return res.json({ data, meta: { scope: filters.scope, limit: filters.limit, total: data.length } });
    } catch (error) {
      if (isZodError(error)) return res.status(400).json({ error: error.issues[0]?.message || 'Invalid query' });
      return res.status(500).json({ error: error.message });
    }
  });

  app.get('/api/banners/mine', requireAuth, async (req, res) => {
    try {
      const { isAdmin } = await resolveActorPermissions(req);
      const limitRaw = Number(req.query.limit || 60);
      const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(120, limitRaw)) : 60;
      const data =
        typeof repository.listBannersByActor === 'function'
          ? await repository.listBannersByActor({ actorId: req.user.id, isAdmin, limit })
          : [];
      return res.json({ data, meta: { total: data.length, limit } });
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  });

  app.post('/api/banners/upload', requireRole(['seller']), upload.single('file'), async (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'file is required' });
    if (!String(req.file.mimetype || '').startsWith('image/')) {
      return res.status(400).json({ error: 'Only image files are supported' });
    }
    const key = `banners/${req.user.id}/${Date.now()}-${req.file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
    try {
      const uploaded = await uploadMediaFn({
        buffer: req.file.buffer,
        contentType: req.file.mimetype,
        key
      });
      return res.json({ key: uploaded.key, url: uploaded.url, r2Enabled: r2EnabledFlag });
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  });

  app.post('/api/banners', requireRole(['seller']), async (req, res) => {
    try {
      const body = bannerSchema.parse(req.body);
      if (typeof repository.createBanner !== 'function') {
        return res.status(500).json({ error: 'Banner API is not available' });
      }
      const banner = await repository.createBanner({
        title: sanitizeText(body.title, 160),
        message: sanitizeText(body.message || '', 500),
        imageKey: String(body.imageKey || '').trim(),
        imageUrl: String(body.imageUrl || '').trim(),
        linkUrl: String(body.linkUrl || '/#marketplace').trim(),
        buttonText: sanitizeText(body.buttonText || 'View', 40),
        scope: body.scope,
        isActive: Boolean(body.isActive),
        priority: Number(body.priority || 0),
        listingId: body.listingId || null,
        createdBy: req.user.id,
        createdByRole: req.user.role || 'seller'
      });

      await logProjectAction(req, {
        actionType: 'banner.create',
        entityType: 'banner',
        entityId: banner?.id || null,
        summary: 'Marketing banner created',
        details: { scope: body.scope, source: 'manual' }
      });

      publishRealtimeEvent('banner.updated', { type: 'banner_created', bannerId: banner?.id || null });
      return res.status(201).json(banner);
    } catch (error) {
      if (isZodError(error)) return res.status(400).json({ error: error.issues[0]?.message || 'Invalid body' });
      return res.status(500).json({ error: error.message });
    }
  });

  app.put('/api/banners/:id', requireRole(['seller']), async (req, res) => {
    const bannerId = parseId(req.params.id);
    if (!bannerId) return res.status(400).json({ error: 'Invalid banner id' });
    try {
      const body = bannerUpdateSchema.parse(req.body);
      const { isAdmin } = await resolveActorPermissions(req);
      const patch = {};
      if (Object.prototype.hasOwnProperty.call(body, 'title')) patch.title = sanitizeText(body.title, 160);
      if (Object.prototype.hasOwnProperty.call(body, 'message')) patch.message = sanitizeText(body.message, 500);
      if (Object.prototype.hasOwnProperty.call(body, 'imageKey')) patch.imageKey = String(body.imageKey || '').trim();
      if (Object.prototype.hasOwnProperty.call(body, 'imageUrl')) patch.imageUrl = String(body.imageUrl || '').trim();
      if (Object.prototype.hasOwnProperty.call(body, 'linkUrl')) patch.linkUrl = String(body.linkUrl || '').trim();
      if (Object.prototype.hasOwnProperty.call(body, 'buttonText')) patch.buttonText = sanitizeText(body.buttonText, 40);
      if (Object.prototype.hasOwnProperty.call(body, 'scope')) patch.scope = body.scope;
      if (Object.prototype.hasOwnProperty.call(body, 'isActive')) patch.isActive = Boolean(body.isActive);
      if (Object.prototype.hasOwnProperty.call(body, 'priority')) patch.priority = Number(body.priority || 0);

      const updated = await repository.updateBanner({
        bannerId,
        actorId: req.user.id,
        isAdmin,
        patch
      });
      if (!updated) return res.status(404).json({ error: 'Banner not found or forbidden' });

      await logProjectAction(req, {
        actionType: 'banner.update',
        entityType: 'banner',
        entityId: bannerId,
        summary: 'Marketing banner updated'
      });
      publishRealtimeEvent('banner.updated', { type: 'banner_updated', bannerId });
      return res.json(updated);
    } catch (error) {
      if (isZodError(error)) return res.status(400).json({ error: error.issues[0]?.message || 'Invalid body' });
      return res.status(500).json({ error: error.message });
    }
  });

  app.delete('/api/banners/:id', requireRole(['seller']), async (req, res) => {
    const bannerId = parseId(req.params.id);
    if (!bannerId) return res.status(400).json({ error: 'Invalid banner id' });
    try {
      const { isAdmin } = await resolveActorPermissions(req);
      const deleted = await repository.deleteBanner({ bannerId, actorId: req.user.id, isAdmin });
      if (!deleted) return res.status(404).json({ error: 'Banner not found or forbidden' });

      await logProjectAction(req, {
        actionType: 'banner.delete',
        entityType: 'banner',
        entityId: bannerId,
        summary: 'Marketing banner deleted'
      });
      publishRealtimeEvent('banner.updated', { type: 'banner_deleted', bannerId });
      return res.json({ ok: true, deleted });
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  });

  app.get('/api/push/public-key', (_, res) => {
    return res.json({
      publicKey: appConfig.push?.vapidPublicKey || ''
    });
  });

  app.post('/api/push/toggle', requireAuth, async (req, res) => {
    try {
      const { enabled } = pushToggleSchema.parse(req.body);
      if (typeof repository.setUserPushEnabled !== 'function') {
        return res.status(500).json({ error: 'Push preference update is not available' });
      }
      const user = await repository.setUserPushEnabled({ userId: req.user.id, enabled });
      return res.json({ ok: true, user: toPublicUser(user) });
    } catch (error) {
      if (isZodError(error)) return res.status(400).json({ error: error.issues[0]?.message || 'Invalid body' });
      return res.status(500).json({ error: error.message });
    }
  });

  app.post('/api/push/subscribe', requireAuth, async (req, res) => {
    try {
      const body = pushSubscribeSchema.parse(req.body);
      if (typeof repository.upsertPushSubscription !== 'function') {
        return res.status(500).json({ error: 'Push subscription is not available' });
      }

      const saved = await repository.upsertPushSubscription({
        userId: req.user.id,
        endpoint: body.subscription.endpoint,
        p256dh: body.subscription.keys.p256dh,
        auth: body.subscription.keys.auth,
        city: body.city || '',
        areaCode: body.areaCode || '',
        latitude: body.lat ?? null,
        longitude: body.lon ?? null
      });

      if (typeof repository.setUserPushEnabled === 'function') {
        await repository.setUserPushEnabled({ userId: req.user.id, enabled: true });
      }

      await sendWebPushToSubscriptions(
        [
          {
            endpoint: body.subscription.endpoint,
            keys: {
              p256dh: body.subscription.keys.p256dh,
              auth: body.subscription.keys.auth
            }
          }
        ],
        {
          title: 'KitaabPadho Notifications Enabled',
          body: 'Push is active for your account. You will receive listing and community alerts.',
          url: appConfig.appBaseUrl
        }
      );

      return res.json({ ok: true, subscription: saved });
    } catch (error) {
      if (isZodError(error)) return res.status(400).json({ error: error.issues[0]?.message || 'Invalid body' });
      return res.status(500).json({ error: error.message });
    }
  });

  app.post('/api/push/unsubscribe', requireAuth, async (req, res) => {
    try {
      const endpoint = String(req.body?.endpoint || '').trim();
      if (!endpoint) return res.status(400).json({ error: 'endpoint is required' });
      if (typeof repository.deletePushSubscription !== 'function') {
        return res.status(500).json({ error: 'Push unsubscribe is not available' });
      }
      await repository.deletePushSubscription({ userId: req.user.id, endpoint });
      return res.json({ ok: true });
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

  app.get('/api/settings/delivery-rate', async (_, res) => {
    try {
      const setting = await repository.getPlatformSetting?.('delivery_rate_per_10km');
      const amountPer10Km = asMoney(setting?.value, 20);
      return res.json({ amountPer10Km });
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  });

  app.put('/api/admin/settings/delivery-rate', requireAuth, requireAdmin, async (req, res) => {
    try {
      const amountPer10Km = asMoney(req.body?.amountPer10Km, -1);
      if (!Number.isFinite(amountPer10Km) || amountPer10Km < 0 || amountPer10Km > 500) {
        return res.status(400).json({ error: 'amountPer10Km must be between 0 and 500' });
      }
      const saved = await repository.upsertPlatformSetting?.({
        key: 'delivery_rate_per_10km',
        value: String(amountPer10Km)
      });
      await logProjectAction(req, {
        actionType: 'admin.delivery_rate_update',
        entityType: 'platform_setting',
        summary: 'Admin updated delivery rate per 10km',
        details: { amountPer10Km }
      });
      return res.json({ ok: true, amountPer10Km, setting: saved });
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
      const localityContext = deriveLocalityContext(geo, nearbyCities);
      return res.json({
        current: {
          latitude: lat,
          longitude: lon,
          address: geo.display_name || 'Detected location',
          city: localityContext.currentCity || '',
          locality: localityContext.currentLocality || ''
        },
        nearbyCities,
        localityOptions: localityContext.localityOptions,
        areaOptions: areaRows.map((item) => ({
          value: item.areaCode,
          label: item.areaName || titleCaseFromCode(item.areaCode),
          listingCount: Number(item.listingCount || 0)
        })),
        hint: 'Listings are dynamically sorted by distance from your location (250 km radius).'
      });
    } catch {
      const localityOptions = nearbyCities.slice(0, 8).map((item) => ({
        name: String(item.city || ''),
        filterCity: String(item.city || '')
      }));
      return res.json({
        current: {
          latitude: lat,
          longitude: lon,
          address: 'Location detected (offline geocoder)',
          city: '',
          locality: ''
        },
        nearbyCities,
        localityOptions,
        areaOptions: areaRows.map((item) => ({
          value: item.areaCode,
          label: item.areaName || titleCaseFromCode(item.areaCode),
          listingCount: Number(item.listingCount || 0)
        })),
        hint: 'Geocoder unavailable, but geo-filtering still works (250 km radius).'
      });
    }
  });

  app.get('/api/location/cities', async (req, res) => {
    try {
      const q = String(req.query.q || '').trim();
      const areaCode = String(req.query.areaCode || '').trim();
      const limitRaw = Number(req.query.limit || 30);
      const limit = Number.isFinite(limitRaw) ? Math.min(100, Math.max(1, limitRaw)) : 30;
      if (typeof repository.listCitySuggestions !== 'function') {
        return res.json({ data: [] });
      }
      const data = await repository.listCitySuggestions({ q, areaCode, limit });
      return res.json({ data });
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  });

  app.get('/api/location/geocode', async (req, res) => {
    try {
      const { q } = locationGeocodeSchema.parse(req.query);
      const response = await reverseGeocodeFetch(
        `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q=${encodeURIComponent(q)}`,
        { headers: { 'User-Agent': 'kitaabpadho/2.0' } }
      );
      if (!response.ok) return res.status(502).json({ error: 'Geocode service unavailable' });
      const rows = await response.json();
      const first = Array.isArray(rows) ? rows[0] : null;
      if (!first) return res.status(404).json({ error: 'Location not found' });
      const lat = Number(first.lat);
      const lon = Number(first.lon);
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
        return res.status(502).json({ error: 'Invalid geocode response' });
      }
      const city = String(first.display_name || '').split(',')[0]?.trim() || '';
      return res.json({
        lat,
        lon,
        address: first.display_name || q,
        city,
        areaCode: slugifyAreaCode(city || q)
      });
    } catch (error) {
      if (isZodError(error)) return res.status(400).json({ error: error.issues[0]?.message || 'Invalid query' });
      return res.status(500).json({ error: error.message });
    }
  });

  app.get('/api/listings', async (req, res) => {
    try {
      const parsed = listingQuerySchema.parse(req.query);
      const filters =
        typeof parsed.lat === 'number' && typeof parsed.lon === 'number' && typeof parsed.radiusKm !== 'number'
          ? { ...parsed, radiusKm: 250 }
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

  app.post('/api/listings', listingWriteLimiter, requireRole(['seller']), async (req, res) => {
    try {
      const body = listingSchema.parse(req.body);
      const platformRateSetting = await repository.getPlatformSetting?.('delivery_rate_per_10km').catch(() => null);
      const defaultDeliveryRatePer10Km = asMoney(platformRateSetting?.value, 20);
      const deliveryRatePer10Km = asMoney(body.deliveryRatePer10Km, defaultDeliveryRatePer10Km);
      const baseAreaCode = slugifyAreaCode(body.areaCode || body.city || 'unknown');
      const serviceableAreaCodes = [
        ...new Set((body.serviceableAreaCodes || []).map((item) => slugifyAreaCode(item, '')).filter(Boolean))
      ];
      const serviceableCities = [
        ...new Set((body.serviceableCities || []).map((item) => sanitizeText(String(item || ''), 100)).filter(Boolean))
      ];
      const listing = await repository.createListing({
        ...body,
        title: body.title.trim(),
        description: body.description.trim(),
        city: body.city.trim(),
        deliveryRatePer10Km,
        paymentModes: ['cod'],
        areaCode: baseAreaCode,
        serviceableAreaCodes,
        serviceableCities,
        publishIndia: Boolean(body.publishIndia),
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
          areaCode: listing.areaCode,
          serviceableAreaCodes: listing.serviceableAreaCodes || [],
          serviceableCities: listing.serviceableCities || [],
          sellerType: listing.sellerType,
          deliveryMode: listing.deliveryMode,
          publishIndia: Boolean(listing.publishIndia)
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
      if (typeof repository.listPushSubscriptionsNear === 'function') {
        const listingSubscriptions = await repository.listPushSubscriptionsNear({
          lat: listing.latitude,
          lon: listing.longitude,
          radiusKm: 250,
          city: listing.city
        });
        await sendWebPushToSubscriptions(listingSubscriptions, {
          title: 'New arrival in marketplace',
          body: `${listing.title} | ${listing.city} | ${listing.listingType}`,
          url: `${appConfig.appBaseUrl}/#marketplace`
        });
      }

      await repository
        .upsertAutoBannerForListing?.({
          listingId: listing.id,
          title: listing.title,
          city: listing.city,
          listingType: listing.listingType,
          publishIndia: Boolean(listing.publishIndia),
          createdBy: req.user.id,
          createdByRole: req.user.role || 'seller'
        })
        .catch(() => null);

      let deliveryJob = null;
      if (listing.deliveryMode === 'peer_to_peer' && typeof repository.createDeliveryJob === 'function') {
        deliveryJob = await repository.createDeliveryJob({
          listingId: listing.id,
          pickupCity: listing.city,
          pickupAreaCode: listing.areaCode,
          pickupLatitude: listing.latitude,
          pickupLongitude: listing.longitude,
          deliveryMode: listing.deliveryMode,
          createdBy: req.user.id
        });
      }

      if (deliveryJob && typeof repository.listPushSubscriptionsNear === 'function') {
        const deliverySubscriptions = await repository.listPushSubscriptionsNear({
          lat: listing.latitude,
          lon: listing.longitude,
          radiusKm: 250,
          city: listing.city
        });
        await sendWebPushToSubscriptions(deliverySubscriptions, {
          title: 'New Delivery Job Nearby',
          body: `${listing.title} in ${listing.city}. Open Delivery Portal to claim.`,
          url: `${appConfig.appBaseUrl}/delivery`
        });
      }

      publishRealtimeEvent('listing.created', {
        id: listing.id,
        title: listing.title,
        city: listing.city,
        listingType: listing.listingType,
        category: listing.category,
        sellerType: listing.sellerType
      });
      publishRealtimeEvent('notifications.invalidate', { source: 'listing.create' });
      if (deliveryJob) publishRealtimeEvent('delivery.updated', { type: 'delivery_job_created', deliveryJobId: deliveryJob.id });

      return res.status(201).json({ ...listing, deliveryJob });
    } catch (error) {
      if (isZodError(error)) return res.status(400).json({ error: error.issues[0]?.message || 'Invalid body' });
      return res.status(500).json({ error: error.message });
    }
  });

  app.put('/api/listings/:id', listingWriteLimiter, requireRole(['seller']), async (req, res) => {
    const listingId = parseId(req.params.id);
    if (!listingId) return res.status(400).json({ error: 'Invalid listing id' });

    try {
      if (typeof repository.updateListing !== 'function') {
        return res.status(500).json({ error: 'Listing update is not available' });
      }
      const existing = await repository.getListingById(listingId);
      if (!existing) return res.status(404).json({ error: 'Listing not found' });

      const { isAdmin } = await resolveActorPermissions(req);
      if (!isAdmin && Number(existing.createdBy) !== Number(req.user.id)) {
        return res.status(403).json({ error: 'Only owner or admin can update this listing' });
      }

      const body = listingUpdateSchema.parse(req.body);
      const platformRateSetting = await repository.getPlatformSetting?.('delivery_rate_per_10km').catch(() => null);
      const defaultDeliveryRatePer10Km = asMoney(platformRateSetting?.value, 20);
      const nextDeliveryRatePer10Km = asMoney(
        body.deliveryRatePer10Km,
        asMoney(existing.deliveryRatePer10Km, defaultDeliveryRatePer10Km)
      );
      const normalizedAreaCode = slugifyAreaCode(body.areaCode || body.city || existing.areaCode || 'unknown');
      const serviceableAreaCodes = [
        ...new Set((body.serviceableAreaCodes || []).map((item) => slugifyAreaCode(item, '')).filter(Boolean))
      ];
      const serviceableCities = [
        ...new Set((body.serviceableCities || []).map((item) => sanitizeText(String(item || ''), 100)).filter(Boolean))
      ];
      const updated = await repository.updateListing({
        listingId,
        actorId: req.user.id,
        isAdmin,
        title: sanitizeText(body.title, 120),
        description: sanitizeText(body.description, 1500),
        category: body.category,
        listingType: body.listingType,
        sellerType: body.sellerType,
        deliveryMode: body.deliveryMode,
        deliveryRatePer10Km: nextDeliveryRatePer10Km,
        paymentModes: ['cod'],
        price: Number(body.price),
        city: sanitizeText(body.city, 100),
        areaCode: normalizedAreaCode,
        serviceableAreaCodes,
        serviceableCities,
        publishIndia: Boolean(body.publishIndia),
        latitude: Number(body.latitude),
        longitude: Number(body.longitude)
      });
      if (!updated) return res.status(404).json({ error: 'Listing not found or forbidden' });

      await logProjectAction(req, {
        actionType: 'listing.update',
        entityType: 'listing',
        entityId: listingId,
        summary: 'Marketplace listing updated',
        details: {
          listingType: updated.listingType,
          category: updated.category,
          areaCode: updated.areaCode,
          serviceableAreaCodes: updated.serviceableAreaCodes || [],
          serviceableCities: updated.serviceableCities || [],
          sellerType: updated.sellerType,
          deliveryMode: updated.deliveryMode,
          publishIndia: Boolean(updated.publishIndia)
        }
      });

      await repository
        .upsertAutoBannerForListing?.({
          listingId,
          title: updated.title,
          city: updated.city,
          listingType: updated.listingType,
          publishIndia: Boolean(updated.publishIndia),
          createdBy: updated.createdBy,
          createdByRole: req.user.role || 'seller'
        })
        .catch(() => null);

      publishRealtimeEvent('listing.updated', { id: listingId });
      publishRealtimeEvent('notifications.invalidate', { source: 'listing.update' });

      const fullListing = await repository.getListingById(listingId).catch(() => null);
      return res.json(fullListing || updated);
    } catch (error) {
      if (isZodError(error)) return res.status(400).json({ error: error.issues[0]?.message || 'Invalid body' });
      return res.status(500).json({ error: error.message });
    }
  });

  app.delete('/api/listings/:id', listingWriteLimiter, requireAuth, async (req, res) => {
    const listingId = parseId(req.params.id);
    if (!listingId) return res.status(400).json({ error: 'Invalid listing id' });

    try {
      if (typeof repository.deleteListing !== 'function') {
        return res.status(500).json({ error: 'Listing delete is not available' });
      }
      const existing = await repository.getListingById(listingId);
      if (!existing) return res.status(404).json({ error: 'Listing not found' });

      const { isAdmin } = await resolveActorPermissions(req);
      if (!isAdmin && Number(existing.createdBy) !== Number(req.user.id)) {
        return res.status(403).json({ error: 'Only owner or admin can delete this listing' });
      }

      const deleted = await repository.deleteListing({
        listingId,
        actorId: req.user.id,
        isAdmin
      });
      if (!deleted) return res.status(404).json({ error: 'Listing not found or forbidden' });

      await logProjectAction(req, {
        actionType: 'listing.delete',
        entityType: 'listing',
        entityId: listingId,
        summary: 'Marketplace listing deleted',
        details: {
          title: existing.title,
          category: existing.category,
          listingType: existing.listingType
        }
      });

      publishRealtimeEvent('listing.deleted', { id: listingId });
      publishRealtimeEvent('notifications.invalidate', { source: 'listing.delete' });
      publishRealtimeEvent('delivery.updated', { type: 'delivery_job_deleted_by_listing', listingId });

      return res.json({ ok: true, deleted });
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  });

  app.post('/api/listings/:id/media', listingWriteLimiter, requireAuth, upload.single('file'), async (req, res) => {
    const listingId = parseId(req.params.id);
    if (!listingId) return res.status(400).json({ error: 'Invalid listing id' });
    if (!req.file) return res.status(400).json({ error: 'file is required' });

    const allowed = ['image/'];
    if (!allowed.some((prefix) => req.file.mimetype.startsWith(prefix))) {
      return res.status(400).json({ error: 'Only image files are supported' });
    }

    try {
      const listing = await repository.getListingOwner(listingId);
      if (!listing) return res.status(404).json({ error: 'Listing not found' });
      if (Number(listing.createdBy) !== Number(req.user.id)) {
        return res.status(403).json({ error: 'You can only upload media to your own listing' });
      }
      if (typeof repository.countListingMedia === 'function') {
        const mediaCount = await repository.countListingMedia(listingId);
        if (mediaCount >= 10) {
          return res.status(400).json({ error: 'Maximum 10 images allowed per listing' });
        }
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
      const listingForBanner = await repository.getListingById(listingId).catch(() => null);
      if (listingForBanner) {
        await repository
          .upsertAutoBannerForListing?.({
            listingId,
            title: listingForBanner.title,
            city: listingForBanner.city,
            listingType: listingForBanner.listingType,
            imageKey: uploaded.key,
            imageUrl: uploaded.url,
            publishIndia: Boolean(listingForBanner.publishIndia),
            createdBy: listingForBanner.createdBy,
            createdByRole: req.user.role || 'seller'
          })
          .catch(() => null);
      }
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
    const allowed = ['image/'];
    if (!allowed.some((prefix) => req.file.mimetype.startsWith(prefix))) {
      return res.status(400).json({ error: 'Only image files are supported' });
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

  app.post('/api/orders', listingWriteLimiter, requireAuth, async (req, res) => {
    try {
      const body = marketplaceOrderCreateSchema.parse(req.body);
      if (typeof repository.getListingById !== 'function' || typeof repository.createMarketplaceOrder !== 'function') {
        return res.status(500).json({ error: 'Order create is not available' });
      }

      const listing = await repository.getListingById(body.listingId);
      if (!listing) return res.status(404).json({ error: 'Listing not found' });
      if (!listing.createdBy) return res.status(400).json({ error: 'Listing seller is unavailable' });
      if (Number(listing.createdBy) === Number(req.user.id)) {
        return res.status(400).json({ error: 'You cannot place order on your own listing' });
      }

      const selectedPaymentMode = 'cod';

      const actionKind = listing.listingType === 'rent' ? 'rent' : 'buy';
      if (body.action && body.action !== actionKind) {
        return res.status(400).json({ error: `${listing.listingType} listing supports ${actionKind} flow only` });
      }

      const quantity = Number(body.quantity || 1);
      const unitPrice = asMoney(listing.price, 0);
      const totalPrice = asMoney(unitPrice * quantity, 0);

      const buyerLat = typeof body.buyerLat === 'number' ? body.buyerLat : null;
      const buyerLon = typeof body.buyerLon === 'number' ? body.buyerLon : null;
      const distanceKm =
        buyerLat !== null && buyerLon !== null
          ? asMoney(haversineDistanceKm(buyerLat, buyerLon, listing.latitude, listing.longitude), 0)
          : 0;
      const deliveryRatePer10Km = asMoney(listing.deliveryRatePer10Km, 20);
      const deliveryCharge = computeDeliveryCharge({ distanceKm, ratePer10Km: deliveryRatePer10Km });
      const payableTotal = asMoney(totalPrice + deliveryCharge, 0);
      const paymentState = 'cod_due';

      const order = await repository.createMarketplaceOrder({
        listingId: listing.id,
        buyerId: req.user.id,
        sellerId: listing.createdBy,
        actionKind,
        quantity,
        unitPrice,
        totalPrice,
        distanceKm,
        deliveryRatePer10Km,
        deliveryCharge,
        payableTotal,
        paymentMode: selectedPaymentMode,
        paymentState,
        status: 'received',
        deliveryMode: listing.deliveryMode || 'peer_to_peer',
        buyerCity: sanitizeText(body.buyerCity || '', 120),
        buyerAreaCode: slugifyAreaCode(body.buyerAreaCode || '', ''),
        notes: sanitizeText(body.notes || '', 500)
      });
      if (!order) return res.status(500).json({ error: 'Unable to create order' });

      await logProjectAction(req, {
        actionType: 'order.create',
        entityType: 'marketplace_order',
        entityId: order.id,
        summary: 'Marketplace order created',
        details: {
          listingId: listing.id,
          actionKind,
          paymentMode: selectedPaymentMode,
          payableTotal
        }
      });

      if (typeof repository.createUserNotification === 'function') {
        await repository.createUserNotification({
          userId: order.sellerId,
          kind: 'order_new',
          title: 'New order received',
          body: `${order.actionKind.toUpperCase()} order for ${order.listingTitle || `listing #${order.listingId}`}`,
          entityType: 'marketplace_order',
          entityId: order.id
        });
        await repository.createUserNotification({
          userId: order.buyerId,
          kind: 'order_new',
          title: 'Order placed',
          body: `Your order #${order.id} is ${order.status.replaceAll('_', ' ')}`,
          entityType: 'marketplace_order',
          entityId: order.id
        });
      }

      publishRealtimeEvent('orders.updated', { type: 'order_created', orderId: order.id }, order.buyerId);
      publishRealtimeEvent('orders.updated', { type: 'order_created', orderId: order.id }, order.sellerId);
      publishRealtimeEvent('notifications.invalidate', { source: 'order.create' }, order.buyerId);
      publishRealtimeEvent('notifications.invalidate', { source: 'order.create' }, order.sellerId);

      return res.status(201).json({ ok: true, order });
    } catch (error) {
      if (isZodError(error)) return res.status(400).json({ error: error.issues[0]?.message || 'Invalid body' });
      return res.status(500).json({ error: error.message });
    }
  });

  app.get('/api/orders/mine', requireAuth, async (req, res) => {
    try {
      const filters = marketplaceOrdersQuerySchema.parse(req.query);
      if (typeof repository.listMarketplaceOrdersByBuyer !== 'function') {
        return res.status(500).json({ error: 'Order list is not available' });
      }
      const data = await repository.listMarketplaceOrdersByBuyer({
        buyerId: req.user.id,
        status: filters.status || '',
        limit: filters.limit,
        offset: filters.offset
      });
      return res.json({ data, meta: { total: data.length, limit: filters.limit, offset: filters.offset } });
    } catch (error) {
      if (isZodError(error)) return res.status(400).json({ error: error.issues[0]?.message || 'Invalid query' });
      return res.status(500).json({ error: error.message });
    }
  });

  app.get('/api/orders/seller', requireRole(['seller']), async (req, res) => {
    try {
      const filters = marketplaceOrdersQuerySchema.parse(req.query);
      if (typeof repository.listMarketplaceOrdersBySeller !== 'function') {
        return res.status(500).json({ error: 'Seller order list is not available' });
      }
      const { isAdmin } = await resolveActorPermissions(req);
      const data = isAdmin
        ? await repository.listMarketplaceOrdersBySeller({
            sellerId: req.user.id,
            status: filters.status || '',
            limit: filters.limit,
            offset: filters.offset
          })
        : await repository.listMarketplaceOrdersBySeller({
            sellerId: req.user.id,
            status: filters.status || '',
            limit: filters.limit,
            offset: filters.offset
          });
      return res.json({ data, meta: { total: data.length, limit: filters.limit, offset: filters.offset } });
    } catch (error) {
      if (isZodError(error)) return res.status(400).json({ error: error.issues[0]?.message || 'Invalid query' });
      return res.status(500).json({ error: error.message });
    }
  });

  app.get('/api/orders/delivery', requireRole(['delivery']), async (req, res) => {
    try {
      const filters = marketplaceOrdersQuerySchema.parse(req.query);
      if (typeof repository.listMarketplaceOrdersForDelivery !== 'function') {
        return res.status(500).json({ error: 'Delivery order list is not available' });
      }
      const { isAdmin } = await resolveActorPermissions(req);
      const data = await repository.listMarketplaceOrdersForDelivery({
        deliveryUserId: req.user.id,
        isAdmin,
        status: filters.status || '',
        limit: filters.limit,
        offset: filters.offset
      });
      return res.json({ data, meta: { total: data.length, limit: filters.limit, offset: filters.offset } });
    } catch (error) {
      if (isZodError(error)) return res.status(400).json({ error: error.issues[0]?.message || 'Invalid query' });
      return res.status(500).json({ error: error.message });
    }
  });

  app.get('/api/orders/:id', requireAuth, async (req, res) => {
    const orderId = parseId(req.params.id);
    if (!orderId) return res.status(400).json({ error: 'Invalid order id' });
    try {
      if (typeof repository.getMarketplaceOrderById !== 'function') {
        return res.status(500).json({ error: 'Order view is not available' });
      }
      const order = await repository.getMarketplaceOrderById(orderId);
      if (!order) return res.status(404).json({ error: 'Order not found' });

      const { isAdmin } = await resolveActorPermissions(req);
      const isParty =
        isAdmin ||
        Number(order.buyerId) === Number(req.user.id) ||
        Number(order.sellerId) === Number(req.user.id) ||
        Number(order.deliveryPartnerId) === Number(req.user.id);
      if (!isParty) return res.status(403).json({ error: 'Access denied for this order' });
      return res.json(order);
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  });

  app.put('/api/orders/:id/status', requireRole(['seller', 'delivery']), async (req, res) => {
    const orderId = parseId(req.params.id);
    if (!orderId) return res.status(400).json({ error: 'Invalid order id' });
    try {
      const body = marketplaceOrderStatusSchema.parse(req.body);
      const nextStatus = body.status;
      if (!validOrderStatuses.has(nextStatus)) return res.status(400).json({ error: 'Invalid status' });
      if (
        typeof repository.getMarketplaceOrderById !== 'function' ||
        typeof repository.updateMarketplaceOrderStatus !== 'function'
      ) {
        return res.status(500).json({ error: 'Order status update is not available' });
      }

      const existing = await repository.getMarketplaceOrderById(orderId);
      if (!existing) return res.status(404).json({ error: 'Order not found' });
      const { isAdmin } = await resolveActorPermissions(req);

      const role = String(req.user.role || '').toLowerCase();
      const sellerAllowed = new Set(['received', 'packing', 'shipping', 'cancelled']);
      const deliveryAllowed = new Set(['shipping', 'out_for_delivery', 'delivered']);

      const isSellerActor = Number(existing.sellerId) === Number(req.user.id);
      let isDeliveryActor = false;
      if (role === 'delivery' && typeof repository.canDeliveryUserManageOrder === 'function') {
        isDeliveryActor = await repository.canDeliveryUserManageOrder({
          orderId: existing.id,
          listingId: existing.listingId,
          userId: req.user.id
        });
      }

      if (!isAdmin) {
        if (role === 'seller') {
          if (!isSellerActor) return res.status(403).json({ error: 'Only seller can update this order' });
          if (!sellerAllowed.has(nextStatus)) {
            return res.status(403).json({ error: 'Seller can set received, packing, shipping, or cancelled' });
          }
        } else if (role === 'delivery') {
          if (!isDeliveryActor) return res.status(403).json({ error: 'Claim delivery job first to update this order' });
          if (!deliveryAllowed.has(nextStatus)) {
            return res.status(403).json({ error: 'Delivery can set shipping, out_for_delivery, or delivered' });
          }
        }
      }

      const updated = await repository.updateMarketplaceOrderStatus({
        orderId,
        status: nextStatus,
        actorId: req.user.id,
        isAdmin,
        allowSeller: role === 'seller',
        allowDelivery: role === 'delivery'
      });
      if (!updated) return res.status(404).json({ error: 'Order not found or forbidden' });

      let orderDeliveryJob = null;
      let deliveryAudienceIds = [];
      const normalizedDeliveryMode = String(updated.deliveryMode || '').toLowerCase();
      const needsDeliveryHandoff = normalizedDeliveryMode === 'peer_to_peer' || normalizedDeliveryMode === 'kpi_dedicated';
      if (
        updated.status === 'shipping' &&
        needsDeliveryHandoff &&
        typeof repository.ensureDeliveryJobForOrder === 'function'
      ) {
        const listingForJob =
          typeof repository.getListingById === 'function'
            ? await repository.getListingById(updated.listingId).catch(() => null)
            : null;
        orderDeliveryJob = await repository.ensureDeliveryJobForOrder({
          orderId: updated.id,
          listingId: updated.listingId,
          pickupCity: listingForJob?.city || updated.listingCity || '',
          pickupAreaCode: listingForJob?.areaCode || updated.listingAreaCode || '',
          pickupLatitude:
            listingForJob && typeof listingForJob.latitude === 'number' ? Number(listingForJob.latitude) : null,
          pickupLongitude:
            listingForJob && typeof listingForJob.longitude === 'number' ? Number(listingForJob.longitude) : null,
          deliveryMode: normalizedDeliveryMode || 'peer_to_peer',
          createdBy: updated.sellerId || req.user.id
        });

        if (orderDeliveryJob?.created) {
          const deliveryRows = await queryFn(
            `SELECT id FROM users WHERE lower(role) = 'delivery' ORDER BY id DESC LIMIT 500`,
            []
          ).catch(() => ({ rows: [] }));
          deliveryAudienceIds = [
            ...new Set(
              (deliveryRows.rows || [])
                .map((row) => Number(row.id))
                .filter((id) => Number.isFinite(id) && id > 0 && id !== Number(req.user.id))
            )
          ];
        }
      }

      await logProjectAction(req, {
        actionType: 'order.status_update',
        entityType: 'marketplace_order',
        entityId: orderId,
        summary: 'Marketplace order status updated',
        details: { previousStatus: existing.status, status: updated.status }
      });

      const statusText = String(updated.status || '').replaceAll('_', ' ');
      if (typeof repository.createUserNotification === 'function') {
        if (updated.buyerId) {
          await repository.createUserNotification({
            userId: updated.buyerId,
            kind: 'order_status',
            title: 'Order status updated',
            body: `Order #${updated.id}: ${statusText}`,
            entityType: 'marketplace_order',
            entityId: updated.id
          });
        }
        if (updated.sellerId && Number(updated.sellerId) !== Number(req.user.id)) {
          await repository.createUserNotification({
            userId: updated.sellerId,
            kind: 'order_status',
            title: 'Order status updated',
            body: `Order #${updated.id}: ${statusText}`,
            entityType: 'marketplace_order',
            entityId: updated.id
          });
        }
        if (updated.deliveryPartnerId && Number(updated.deliveryPartnerId) !== Number(req.user.id)) {
          await repository.createUserNotification({
            userId: updated.deliveryPartnerId,
            kind: 'order_status',
            title: 'Order status updated',
            body: `Order #${updated.id}: ${statusText}`,
            entityType: 'marketplace_order',
            entityId: updated.id
          });
        }
        if (orderDeliveryJob?.created && deliveryAudienceIds.length) {
          await Promise.all(
            deliveryAudienceIds.map((deliveryUserId) =>
              repository
                .createUserNotification({
                  userId: deliveryUserId,
                  kind: 'delivery_job_open',
                  title: 'New delivery job available',
                  body: `Order #${updated.id} is ready for pickup in ${updated.listingCity || 'your area'}.`,
                  entityType: 'delivery_job',
                  entityId: orderDeliveryJob.id
                })
                .catch(() => null)
            )
          );
        }
        if (role === 'delivery' && updated.status === 'delivered' && updated.paycheckStatus === 'released') {
          await repository.createUserNotification({
            userId: req.user.id,
            kind: 'delivery_paycheck',
            title: 'Paycheck released',
            body: `INR ${Number(updated.paycheckAmount || 0).toFixed(2)} released for order #${updated.id}.`,
            entityType: 'marketplace_order',
            entityId: updated.id
          });
        }
      }

      await Promise.all([
        pushToUser(updated.buyerId, {
          title: 'Order status updated',
          body: `Order #${updated.id} is now ${statusText}.`,
          url: `${appConfig.appBaseUrl}/#ordersPanel`
        }).catch(() => null),
        updated.sellerId && Number(updated.sellerId) !== Number(req.user.id)
          ? pushToUser(updated.sellerId, {
              title: 'Order status updated',
              body: `Order #${updated.id} is now ${statusText}.`,
              url: `${appConfig.appBaseUrl}/seller#sellerOrdersPanel`
            }).catch(() => null)
          : Promise.resolve(),
        updated.deliveryPartnerId && Number(updated.deliveryPartnerId) !== Number(req.user.id)
          ? pushToUser(updated.deliveryPartnerId, {
              title: 'Order status updated',
              body: `Order #${updated.id} is now ${statusText}.`,
              url: `${appConfig.appBaseUrl}/delivery#deliveryOrdersPanel`
            }).catch(() => null)
          : Promise.resolve()
      ]);

      if (orderDeliveryJob?.created && typeof repository.listPushSubscriptionsNear === 'function') {
        const nearbySubscriptions = await repository
          .listPushSubscriptionsNear({
            lat: orderDeliveryJob.pickupLatitude,
            lon: orderDeliveryJob.pickupLongitude,
            city: orderDeliveryJob.pickupCity || updated.listingCity || '',
            radiusKm: 250
          })
          .catch(() => []);
        await sendWebPushToSubscriptions(nearbySubscriptions, {
          title: 'New delivery job',
          body: `Order #${updated.id} is ready for pickup.`,
          url: `${appConfig.appBaseUrl}/delivery#deliveryJobsPanel`
        });
      }

      publishRealtimeEvent('orders.updated', { type: 'order_status_updated', orderId: updated.id }, updated.buyerId);
      publishRealtimeEvent('orders.updated', { type: 'order_status_updated', orderId: updated.id }, updated.sellerId);
      if (updated.deliveryPartnerId) {
        publishRealtimeEvent('orders.updated', { type: 'order_status_updated', orderId: updated.id }, updated.deliveryPartnerId);
      }
      if (orderDeliveryJob?.id) {
        publishRealtimeEvent('delivery.updated', {
          type: orderDeliveryJob.created ? 'delivery_job_created' : 'delivery_job_updated',
          deliveryJobId: orderDeliveryJob.id,
          orderId: updated.id
        });
      }
      publishRealtimeEvent('notifications.invalidate', { source: 'order.status_update' }, updated.buyerId);
      publishRealtimeEvent('notifications.invalidate', { source: 'order.status_update' }, updated.sellerId);
      if (updated.deliveryPartnerId) {
        publishRealtimeEvent('notifications.invalidate', { source: 'order.status_update' }, updated.deliveryPartnerId);
      }
      for (const deliveryUserId of deliveryAudienceIds) {
        publishRealtimeEvent('notifications.invalidate', { source: 'order.shipping_handoff' }, deliveryUserId);
      }

      return res.json({ ok: true, order: updated, deliveryJob: orderDeliveryJob || null });
    } catch (error) {
      if (isZodError(error)) return res.status(400).json({ error: error.issues[0]?.message || 'Invalid body' });
      return res.status(500).json({ error: error.message });
    }
  });

  app.get('/api/community/categories', requireAuth, async (_, res) => {
    try {
      const data = await repository.listCommunityCategories();
      return res.json({ data });
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  });

  app.get('/api/community/posts', requireAuth, async (req, res) => {
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

  app.get('/api/community/posts/:id', requireAuth, async (req, res) => {
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
      await queryFn(
        `INSERT INTO notifications (user_id, kind, title, body, entity_type, entity_id)
         SELECT u.id, 'community_post', $2, $3, 'community_post', $1
         FROM users u
         WHERE u.id <> $4`,
        [post.id, `New community topic: ${post.title}`, `${req.user.fullName || 'Member'} posted in community.`, req.user.id]
      ).catch(() => null);
      if (typeof repository.listPushSubscriptionsNear === 'function') {
        const subscriptions = await repository.listPushSubscriptionsNear({ city: '', radiusKm: 250 });
        await sendWebPushToSubscriptions(subscriptions, {
          title: 'New community topic',
          body: `${post.title}`,
          url: `${appConfig.appBaseUrl}/#community`
        });
      }

      const fullPost = await repository.getCommunityPostById(post.id);
      publishRealtimeEvent('community.updated', { type: 'post_created', postId: post.id });
      publishRealtimeEvent('notifications.invalidate', { source: 'community.post_create' });
      return res.status(201).json(fullPost || post);
    } catch (error) {
      if (isZodError(error)) return res.status(400).json({ error: error.issues[0]?.message || 'Invalid body' });
      return res.status(500).json({ error: error.message });
    }
  });

  app.put('/api/community/posts/:id', communityWriteLimiter, requireAuth, async (req, res) => {
    const postId = parseId(req.params.id);
    if (!postId) return res.status(400).json({ error: 'Invalid post id' });

    try {
      if (typeof repository.updateCommunityPost !== 'function') {
        return res.status(500).json({ error: 'Community post update is not available' });
      }

      const existing = await repository.getCommunityPostById(postId);
      if (!existing) return res.status(404).json({ error: 'Post not found' });

      const { isAdmin } = await resolveActorPermissions(req);
      if (!isAdmin && Number(existing.createdBy) !== Number(req.user.id)) {
        return res.status(403).json({ error: 'Only owner or admin can update this post' });
      }

      const body = communityPostUpdateSchema.parse(req.body);
      const category = await repository.findCommunityCategoryBySlug(body.categorySlug);
      if (!category) return res.status(400).json({ error: 'Invalid categorySlug' });

      const updated = await repository.updateCommunityPost({
        postId,
        actorId: req.user.id,
        isAdmin,
        title: sanitizeText(body.title, 160),
        content: sanitizeText(body.content, 4000),
        categoryId: category.id
      });
      if (!updated) return res.status(404).json({ error: 'Post not found or forbidden' });

      await logProjectAction(req, {
        actionType: 'community.post_update',
        entityType: 'community_post',
        entityId: postId,
        summary: 'Community post updated',
        details: { categorySlug: body.categorySlug }
      });

      const fullPost = await repository.getCommunityPostById(postId);
      publishRealtimeEvent('community.updated', { type: 'post_updated', postId });
      publishRealtimeEvent('notifications.invalidate', { source: 'community.post_update' });
      return res.json(fullPost || updated);
    } catch (error) {
      if (isZodError(error)) return res.status(400).json({ error: error.issues[0]?.message || 'Invalid body' });
      return res.status(500).json({ error: error.message });
    }
  });

  app.delete('/api/community/posts/:id', communityWriteLimiter, requireAuth, async (req, res) => {
    const postId = parseId(req.params.id);
    if (!postId) return res.status(400).json({ error: 'Invalid post id' });

    try {
      if (typeof repository.deleteCommunityPost !== 'function') {
        return res.status(500).json({ error: 'Community post delete is not available' });
      }

      const existing = await repository.getCommunityPostById(postId);
      if (!existing) return res.status(404).json({ error: 'Post not found' });

      const { isAdmin } = await resolveActorPermissions(req);
      if (!isAdmin && Number(existing.createdBy) !== Number(req.user.id)) {
        return res.status(403).json({ error: 'Only owner or admin can delete this post' });
      }

      const deleted = await repository.deleteCommunityPost({
        postId,
        actorId: req.user.id,
        isAdmin
      });
      if (!deleted) return res.status(404).json({ error: 'Post not found or forbidden' });

      await logProjectAction(req, {
        actionType: 'community.post_delete',
        entityType: 'community_post',
        entityId: postId,
        summary: 'Community post deleted'
      });

      publishRealtimeEvent('community.updated', { type: 'post_deleted', postId });
      publishRealtimeEvent('notifications.invalidate', { source: 'community.post_delete' });
      return res.json({ ok: true, deleted });
    } catch (error) {
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
        await pushToUser(post.createdBy, {
          title: 'New comment on your post',
          body: `${req.user.fullName || 'A member'} replied in community.`,
          url: `${appConfig.appBaseUrl}/#community`
        });
      }
      publishRealtimeEvent('community.updated', { type: 'comment_created', postId, commentId: comment.id });
      return res.status(201).json({ ...comment, authorName: req.user.fullName });
    } catch (error) {
      if (isZodError(error)) return res.status(400).json({ error: error.issues[0]?.message || 'Invalid body' });
      return res.status(500).json({ error: error.message });
    }
  });

  app.put('/api/community/comments/:id', communityWriteLimiter, requireAuth, async (req, res) => {
    const commentId = parseId(req.params.id);
    if (!commentId) return res.status(400).json({ error: 'Invalid comment id' });

    try {
      if (typeof repository.updateCommunityComment !== 'function') {
        return res.status(500).json({ error: 'Community comment update is not available' });
      }

      const existing =
        typeof repository.getCommunityCommentById === 'function'
          ? await repository.getCommunityCommentById(commentId)
          : null;
      if (existing === null && typeof repository.getCommunityCommentById === 'function') {
        return res.status(404).json({ error: 'Comment not found' });
      }

      const { isAdmin } = await resolveActorPermissions(req);
      if (existing && !isAdmin && Number(existing.createdBy) !== Number(req.user.id)) {
        return res.status(403).json({ error: 'Only owner or admin can update this comment' });
      }

      const body = communityCommentUpdateSchema.parse(req.body);
      const updated = await repository.updateCommunityComment({
        commentId,
        actorId: req.user.id,
        isAdmin,
        content: sanitizeText(body.content, 1000)
      });
      if (!updated) return res.status(404).json({ error: 'Comment not found or forbidden' });

      await logProjectAction(req, {
        actionType: 'community.comment_update',
        entityType: 'community_comment',
        entityId: commentId,
        summary: 'Community comment updated',
        details: { postId: updated.postId }
      });
      publishRealtimeEvent('community.updated', { type: 'comment_updated', commentId, postId: updated.postId });
      return res.json(updated);
    } catch (error) {
      if (isZodError(error)) return res.status(400).json({ error: error.issues[0]?.message || 'Invalid body' });
      return res.status(500).json({ error: error.message });
    }
  });

  app.delete('/api/community/comments/:id', communityWriteLimiter, requireAuth, async (req, res) => {
    const commentId = parseId(req.params.id);
    if (!commentId) return res.status(400).json({ error: 'Invalid comment id' });

    try {
      const existing =
        typeof repository.getCommunityCommentById === 'function'
          ? await repository.getCommunityCommentById(commentId)
          : null;
      if (existing === null && typeof repository.getCommunityCommentById === 'function') {
        return res.status(404).json({ error: 'Comment not found' });
      }

      const { isAdmin } = await resolveActorPermissions(req);
      if (existing && !isAdmin && Number(existing.createdBy) !== Number(req.user.id)) {
        return res.status(403).json({ error: 'Only owner or admin can delete this comment' });
      }

      const deleted = await repository.deleteCommunityComment(commentId, req.user.id, isAdmin);
      if (!deleted) return res.status(404).json({ error: 'Comment not found or forbidden' });
      await logProjectAction(req, {
        actionType: 'community.comment_delete',
        entityType: 'community_comment',
        entityId: commentId,
        summary: 'Community comment deleted'
      });
      publishRealtimeEvent('community.updated', { type: 'comment_deleted', commentId, postId: deleted.postId });
      return res.json({ ok: true });
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  });

  app.get('/api/delivery/jobs', async (req, res) => {
    try {
      const filters = deliveryJobsQuerySchema.parse(req.query);
      if (typeof repository.listDeliveryJobs !== 'function') {
        return res.json({ data: [], meta: { total: 0, limit: filters.limit, offset: filters.offset } });
      }
      const data = await repository.listDeliveryJobs(filters);
      return res.json({
        data,
        meta: {
          total: data.length,
          limit: filters.limit,
          offset: filters.offset
        }
      });
    } catch (error) {
      if (isZodError(error)) return res.status(400).json({ error: error.issues[0]?.message || 'Invalid query' });
      return res.status(500).json({ error: error.message });
    }
  });

  app.get('/api/delivery/jobs/:id', requireRole(['delivery', 'seller']), async (req, res) => {
    const jobId = parseId(req.params.id);
    if (!jobId) return res.status(400).json({ error: 'Invalid delivery job id' });

    try {
      if (typeof repository.getDeliveryJobById !== 'function') {
        return res.status(500).json({ error: 'Delivery job view is not available' });
      }
      const job = await repository.getDeliveryJobById(jobId);
      if (!job) return res.status(404).json({ error: 'Delivery job not found' });
      return res.json(job);
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  });

  app.put('/api/delivery/jobs/:id/status', requireRole(['delivery', 'seller']), async (req, res) => {
    const jobId = parseId(req.params.id);
    if (!jobId) return res.status(400).json({ error: 'Invalid delivery job id' });
    try {
      if (typeof repository.updateDeliveryJobStatus !== 'function' || typeof repository.getDeliveryJobById !== 'function') {
        return res.status(500).json({ error: 'Delivery job status update is not available' });
      }

      const existing = await repository.getDeliveryJobById(jobId);
      if (!existing) return res.status(404).json({ error: 'Delivery job not found' });

      const { isAdmin } = await resolveActorPermissions(req);
      const canManage =
        isAdmin ||
        Number(existing.createdBy) === Number(req.user.id) ||
        Number(existing.claimedBy) === Number(req.user.id);
      if (!canManage) return res.status(403).json({ error: 'Only assigned user, creator, or admin can update status' });

      const body = deliveryJobStatusSchema.parse(req.body);
      const updated = await repository.updateDeliveryJobStatus({
        jobId,
        actorId: req.user.id,
        isAdmin,
        status: body.status
      });
      if (!updated) return res.status(404).json({ error: 'Delivery job not found or forbidden' });

      await logProjectAction(req, {
        actionType: 'delivery.job_status_update',
        entityType: 'delivery_job',
        entityId: jobId,
        summary: 'Delivery job status updated',
        details: { previousStatus: existing.status, status: updated.status, listingId: updated.listingId }
      });
      let linkedOrder = null;
      if (updated.orderId && typeof repository.getMarketplaceOrderById === 'function') {
        linkedOrder = await repository.getMarketplaceOrderById(updated.orderId).catch(() => null);
      }

      if (typeof repository.createUserNotification === 'function') {
        if (updated.createdBy && Number(updated.createdBy) !== Number(req.user.id)) {
          await repository.createUserNotification({
            userId: updated.createdBy,
            kind: 'delivery_status',
            title: 'Delivery job status updated',
            body: `Listing #${updated.listingId} is now ${updated.status}.`,
            entityType: 'delivery_job',
            entityId: updated.id
          });
          publishRealtimeEvent('notifications.invalidate', { source: 'delivery.status_update' }, updated.createdBy);
          await pushToUser(updated.createdBy, {
            title: 'Delivery status update',
            body: `Listing #${updated.listingId} is now ${updated.status}.`,
            url: `${appConfig.appBaseUrl}/delivery`
          });
        }
        if (updated.claimedBy && Number(updated.claimedBy) !== Number(req.user.id)) {
          await repository.createUserNotification({
            userId: updated.claimedBy,
            kind: 'delivery_status',
            title: 'Delivery job status updated',
            body: `Your delivery job #${updated.id} is now ${updated.status}.`,
            entityType: 'delivery_job',
            entityId: updated.id
          });
          publishRealtimeEvent('notifications.invalidate', { source: 'delivery.status_update' }, updated.claimedBy);
        }
        if (linkedOrder?.sellerId && Number(linkedOrder.sellerId) !== Number(req.user.id)) {
          await repository.createUserNotification({
            userId: linkedOrder.sellerId,
            kind: 'delivery_status',
            title: 'Delivery status updated',
            body: `Order #${linkedOrder.id} delivery is now ${updated.status}.`,
            entityType: 'marketplace_order',
            entityId: linkedOrder.id
          });
          publishRealtimeEvent('notifications.invalidate', { source: 'delivery.status_update' }, linkedOrder.sellerId);
        }
        if (linkedOrder?.buyerId && Number(linkedOrder.buyerId) !== Number(req.user.id)) {
          await repository.createUserNotification({
            userId: linkedOrder.buyerId,
            kind: 'delivery_status',
            title: 'Delivery status updated',
            body: `Order #${linkedOrder.id} delivery is now ${updated.status}.`,
            entityType: 'marketplace_order',
            entityId: linkedOrder.id
          });
          publishRealtimeEvent('notifications.invalidate', { source: 'delivery.status_update' }, linkedOrder.buyerId);
        }
      }

      publishRealtimeEvent('delivery.updated', {
        type: 'delivery_job_status_updated',
        deliveryJobId: updated.id,
        status: updated.status
      });
      if (linkedOrder) {
        publishRealtimeEvent('orders.updated', { type: 'delivery_status_updated', orderId: linkedOrder.id }, linkedOrder.sellerId);
        publishRealtimeEvent('orders.updated', { type: 'delivery_status_updated', orderId: linkedOrder.id }, linkedOrder.buyerId);
      }

      return res.json({ ok: true, job: updated });
    } catch (error) {
      if (isZodError(error)) return res.status(400).json({ error: error.issues[0]?.message || 'Invalid body' });
      return res.status(500).json({ error: error.message });
    }
  });

  app.delete('/api/delivery/jobs/:id', requireRole(['delivery', 'seller']), async (req, res) => {
    const jobId = parseId(req.params.id);
    if (!jobId) return res.status(400).json({ error: 'Invalid delivery job id' });
    try {
      if (typeof repository.deleteDeliveryJob !== 'function' || typeof repository.getDeliveryJobById !== 'function') {
        return res.status(500).json({ error: 'Delivery job delete is not available' });
      }

      const existing = await repository.getDeliveryJobById(jobId);
      if (!existing) return res.status(404).json({ error: 'Delivery job not found' });

      const { isAdmin } = await resolveActorPermissions(req);
      const canManage =
        isAdmin ||
        Number(existing.createdBy) === Number(req.user.id) ||
        Number(existing.claimedBy) === Number(req.user.id);
      if (!canManage) return res.status(403).json({ error: 'Only assigned user, creator, or admin can delete job' });

      const deleted = await repository.deleteDeliveryJob({
        jobId,
        actorId: req.user.id,
        isAdmin
      });
      if (!deleted) return res.status(404).json({ error: 'Delivery job not found or forbidden' });

      await logProjectAction(req, {
        actionType: 'delivery.job_delete',
        entityType: 'delivery_job',
        entityId: jobId,
        summary: 'Delivery job deleted',
        details: { listingId: deleted.listingId }
      });

      publishRealtimeEvent('delivery.updated', { type: 'delivery_job_deleted', deliveryJobId: jobId });
      if (deleted.createdBy) {
        publishRealtimeEvent('notifications.invalidate', { source: 'delivery.delete' }, deleted.createdBy);
      }
      return res.json({ ok: true, deleted });
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  });

  app.post('/api/delivery/jobs/:id/claim', requireRole(['delivery']), async (req, res) => {
    const jobId = parseId(req.params.id);
    if (!jobId) return res.status(400).json({ error: 'Invalid delivery job id' });
    try {
      if (typeof repository.claimDeliveryJob !== 'function') {
        return res.status(500).json({ error: 'Delivery claim is not available' });
      }
      const job = await repository.claimDeliveryJob({ jobId, userId: req.user.id });
      if (!job) return res.status(404).json({ error: 'Delivery job not found or already claimed' });

      await logProjectAction(req, {
        actionType: 'delivery.job_claim',
        entityType: 'delivery_job',
        entityId: job.id,
        summary: 'Delivery executive claimed a job',
        details: { listingId: job.listingId, orderId: job.orderId || null }
      });

      publishRealtimeEvent('delivery.updated', { type: 'delivery_job_claimed', deliveryJobId: job.id });
      let linkedOrder = null;
      if (job.orderId && typeof repository.getMarketplaceOrderById === 'function') {
        linkedOrder = await repository.getMarketplaceOrderById(job.orderId).catch(() => null);
      }
      if (job.createdBy) {
        await repository.createUserNotification?.({
          userId: job.createdBy,
          kind: 'delivery_claimed',
          title: 'Delivery job claimed',
          body: `Your delivery request for listing #${job.listingId} was claimed.`,
          entityType: 'delivery_job',
          entityId: job.id
        });
        publishRealtimeEvent('notifications.invalidate', { source: 'delivery.claim' }, job.createdBy);
        await pushToUser(job.createdBy, {
          title: 'Delivery job claimed',
          body: `Listing #${job.listingId} now has an assigned delivery executive.`,
          url: `${appConfig.appBaseUrl}/#notificationsPanel`
        });
      }
      if (linkedOrder && typeof repository.createUserNotification === 'function') {
        if (linkedOrder.sellerId && Number(linkedOrder.sellerId) !== Number(req.user.id)) {
          await repository.createUserNotification({
            userId: linkedOrder.sellerId,
            kind: 'delivery_claimed',
            title: 'Delivery partner assigned',
            body: `Order #${linkedOrder.id} is now assigned to a delivery partner.`,
            entityType: 'marketplace_order',
            entityId: linkedOrder.id
          });
          publishRealtimeEvent('notifications.invalidate', { source: 'delivery.claim' }, linkedOrder.sellerId);
          await pushToUser(linkedOrder.sellerId, {
            title: 'Delivery partner assigned',
            body: `Order #${linkedOrder.id} is now assigned.`,
            url: `${appConfig.appBaseUrl}/seller#sellerOrdersPanel`
          }).catch(() => null);
        }
        if (linkedOrder.buyerId && Number(linkedOrder.buyerId) !== Number(req.user.id)) {
          await repository.createUserNotification({
            userId: linkedOrder.buyerId,
            kind: 'delivery_claimed',
            title: 'Delivery partner assigned',
            body: `Order #${linkedOrder.id} is now assigned to a delivery partner.`,
            entityType: 'marketplace_order',
            entityId: linkedOrder.id
          });
          publishRealtimeEvent('notifications.invalidate', { source: 'delivery.claim' }, linkedOrder.buyerId);
          await pushToUser(linkedOrder.buyerId, {
            title: 'Delivery partner assigned',
            body: `Order #${linkedOrder.id} is now assigned.`,
            url: `${appConfig.appBaseUrl}/#ordersPanel`
          }).catch(() => null);
        }
        publishRealtimeEvent('orders.updated', { type: 'delivery_partner_assigned', orderId: linkedOrder.id }, linkedOrder.buyerId);
        publishRealtimeEvent('orders.updated', { type: 'delivery_partner_assigned', orderId: linkedOrder.id }, linkedOrder.sellerId);
      }
      publishRealtimeEvent('notifications.invalidate', { source: 'delivery.claim' }, req.user.id);

      return res.json({ ok: true, job });
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  });

  app.post('/api/ai/chat', requireAuth, async (req, res) => {
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

  app.get('/api/admin/feedback', requireAuth, requireAdmin, async (req, res) => {
    try {
      const filters = feedbackListQuerySchema.parse(req.query);
      const data = typeof repository.listFeedback === 'function' ? await repository.listFeedback(filters) : [];
      await logProjectAction(req, {
        actionType: 'admin.feedback_view',
        entityType: 'admin_panel',
        summary: 'Admin viewed customer support queries'
      });
      return res.json({
        data,
        meta: { limit: filters.limit, offset: filters.offset, total: data.length }
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
        data: data.map((item) => ({
          ...toPublicUser(item),
          createdAt: item.createdAt || null
        })),
        meta: { total, limit: filters.limit, offset: filters.offset }
      });
    } catch (error) {
      if (isZodError(error)) return res.status(400).json({ error: error.issues[0]?.message || 'Invalid query' });
      return res.status(500).json({ error: error.message });
    }
  });

  app.get('/api/admin/users/:id', requireAuth, requireAdmin, async (req, res) => {
    const userId = parseId(req.params.id);
    if (!userId) return res.status(400).json({ error: 'Invalid user id' });
    try {
      const user =
        typeof repository.getUserForAdmin === 'function'
          ? await repository.getUserForAdmin(userId)
          : await repository.findUserById(userId);
      if (!user) return res.status(404).json({ error: 'User not found' });
      return res.json({
        user: {
          ...toPublicUser(user),
          createdAt: user.createdAt || null
        }
      });
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  });

  app.post('/api/admin/users', requireAuth, requireAdmin, async (req, res) => {
    try {
      const body = adminUserCreateSchema.parse(req.body);
      if (typeof repository.createUser !== 'function' || typeof repository.findUserByEmail !== 'function') {
        return res.status(500).json({ error: 'Admin user create is not available' });
      }

      const existing = await repository.findUserByEmail(body.email);
      if (existing) return res.status(409).json({ error: 'Email already registered' });
      if (await isUsernameTaken(body.fullName)) return res.status(409).json({ error: 'Username already used' });

      const passwordHash = await hashPassword(body.password);
      const user = await repository.createUser({
        email: sanitizeText(body.email, 180).toLowerCase(),
        fullName: sanitizeText(body.fullName, 120),
        phoneNumber: sanitizeText(body.phoneNumber, 20),
        passwordHash,
        role: body.role
      });

      await logProjectAction(req, {
        actionType: 'admin.user_create',
        entityType: 'user',
        entityId: user.id,
        summary: 'Admin created user',
        details: { email: user.email, role: user.role }
      });

      return res.status(201).json({ ok: true, user: toPublicUser(user) });
    } catch (error) {
      if (isZodError(error)) return res.status(400).json({ error: error.issues[0]?.message || 'Invalid body' });
      if (error?.code === '23505') return res.status(409).json({ error: 'Email already registered' });
      return res.status(500).json({ error: error.message });
    }
  });

  app.put('/api/admin/users/:id', requireAuth, requireAdmin, async (req, res) => {
    const userId = parseId(req.params.id);
    if (!userId) return res.status(400).json({ error: 'Invalid user id' });
    try {
      const body = adminUserUpdateSchema.parse(req.body);
      if (typeof repository.adminUpdateUser !== 'function') {
        return res.status(500).json({ error: 'Admin user update is not available' });
      }
      if (Number(req.user.id) === Number(userId) && body.role && body.role !== 'admin') {
        return res.status(400).json({ error: 'Admin cannot remove own admin role' });
      }

      if (body.email && typeof repository.findUserByEmail === 'function') {
        const existing = await repository.findUserByEmail(body.email);
        if (existing && Number(existing.id) !== Number(userId)) {
          return res.status(409).json({ error: 'Email already registered' });
        }
      }

      if (body.fullName && typeof repository.findUserByFullName === 'function') {
        const existingName = await repository.findUserByFullName(body.fullName);
        if (existingName && Number(existingName.id) !== Number(userId)) {
          return res.status(409).json({ error: 'Username already used' });
        }
      }

      const user = await repository.adminUpdateUser({
        userId,
        email: body.email ? sanitizeText(body.email, 180).toLowerCase() : undefined,
        fullName: body.fullName ? sanitizeText(body.fullName, 120) : undefined,
        phoneNumber: body.phoneNumber ? sanitizeText(body.phoneNumber, 20) : undefined,
        role: body.role
      });
      if (!user) return res.status(404).json({ error: 'User not found' });

      await logProjectAction(req, {
        actionType: 'admin.user_update',
        entityType: 'user',
        entityId: user.id,
        summary: 'Admin updated user',
        details: {
          updatedFields: Object.keys(body),
          role: user.role
        }
      });

      return res.json({ ok: true, user: toPublicUser(user) });
    } catch (error) {
      if (isZodError(error)) return res.status(400).json({ error: error.issues[0]?.message || 'Invalid body' });
      if (error?.code === '23505') return res.status(409).json({ error: 'Email already registered' });
      return res.status(500).json({ error: error.message });
    }
  });

  app.delete('/api/admin/users/:id', requireAuth, requireAdmin, async (req, res) => {
    const userId = parseId(req.params.id);
    if (!userId) return res.status(400).json({ error: 'Invalid user id' });
    try {
      if (Number(req.user.id) === Number(userId)) {
        return res.status(400).json({ error: 'Admin cannot delete own account' });
      }
      if (typeof repository.adminDeleteUser !== 'function') {
        return res.status(500).json({ error: 'Admin user delete is not available' });
      }
      const deleted = await repository.adminDeleteUser(userId);
      if (!deleted) return res.status(404).json({ error: 'User not found' });

      await logProjectAction(req, {
        actionType: 'admin.user_delete',
        entityType: 'user',
        entityId: deleted.id,
        summary: 'Admin deleted user',
        details: { email: deleted.email, role: deleted.role }
      });

      return res.json({ ok: true, user: toPublicUser(deleted) });
    } catch (error) {
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

      res.clearCookie(appConfig.sessionCookieName, clearCookieOptions);
      return res.json({ ok: true, reauthRequired: true });
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

  app.get('/sw.js', (_, res) => {
    res.setHeader('Cache-Control', 'no-cache');
    res.sendFile(path.join(process.cwd(), 'public', 'sw.js'));
  });

  app.get('/admin', (_, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.sendFile(path.join(process.cwd(), 'public', 'admin.html'));
  });

  app.get('/seller', (_, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.sendFile(path.join(process.cwd(), 'public', 'seller.html'));
  });

  app.get('/delivery', (_, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.sendFile(path.join(process.cwd(), 'public', 'delivery.html'));
  });

  app.get('/buyer', (_, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.sendFile(path.join(process.cwd(), 'public', 'index.html'));
  });

  app.get('*', (_, res) => {
    res.setHeader('Cache-Control', 'no-store');
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
