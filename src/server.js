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
  communityPostSchema,
  communityCommentSchema,
  communityListQuerySchema,
  adminActionQuerySchema,
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

  app.get('/api/health', (_, res) => res.json({ ok: true, stack: 'express-neon-r2-pwa' }));

  app.post('/api/auth/register', authLimiter, async (req, res) => {
    try {
      const body = authRegisterSchema.parse(req.body);
      const existing = await repository.findUserByEmail(body.email);
      if (existing) return res.status(409).json({ error: 'Email already registered' });

      const passwordHash = await hashPassword(body.password);
      const user = await repository.createUser({
        email: body.email,
        fullName: body.fullName,
        passwordHash
      });

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
      return res.status(201).json({ authenticated: true, user });
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

      const valid = await verifyPassword(body.password, user.passwordHash);
      if (!valid) return res.status(401).json({ error: 'Invalid credentials' });

      const token = createSessionToken(user, appConfig.sessionSecret, appConfig.sessionTtlSeconds);
      res.cookie(appConfig.sessionCookieName, token, cookieOptions);
      await logProjectAction(req, {
        actor: user,
        actionType: 'auth.login',
        entityType: 'user',
        entityId: user.id,
        summary: 'User logged in',
        details: { email: user.email }
      });
      return res.json({
        authenticated: true,
        user: { id: user.id, email: user.email, fullName: user.fullName, role: user.role }
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
      return res.json({ authenticated: true, user });
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
        hint: 'Listings are dynamically sorted by distance from your location.'
      });
    } catch {
      return res.json({
        current: {
          latitude: lat,
          longitude: lon,
          address: 'Location detected (offline geocoder)'
        },
        hint: 'Geocoder unavailable, but geo-filtering still works.'
      });
    }
  });

  app.get('/api/listings', async (req, res) => {
    try {
      const filters = listingQuerySchema.parse(req.query);
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
      return res.json({ ok: true });
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  });

  app.post('/api/ai/chat', async (req, res) => {
    try {
      const { prompt } = aiSchema.parse(req.body);
      const ai = await askAiFn(prompt);
      await logProjectAction(req, {
        actionType: 'ai.chat',
        entityType: 'assistant',
        summary: 'AI chat request processed',
        details: { provider: ai.provider, promptLength: String(prompt).length }
      });
      return res.json(ai);
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
