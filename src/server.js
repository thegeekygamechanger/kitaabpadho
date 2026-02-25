const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const cookieParser = require('cookie-parser');
const path = require('path');
const multer = require('multer');
const config = require('./config');
const { query } = require('./db');
const { uploadMedia, r2Enabled } = require('./storage');
const { askPadhAI } = require('./ai');
const { listingSchema, aiSchema } = require('./validators');

const app = express();
const upload = multer({ limits: { fileSize: 30 * 1024 * 1024 } });

app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({ origin: config.corsOrigin, credentials: true }));
app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());
app.use(rateLimit({ windowMs: 15 * 60 * 1000, limit: 200 }));
app.use(express.static(path.join(process.cwd(), 'public')));

app.get('/api/health', (_, res) => res.json({ ok: true, stack: 'express-neon-r2-pwa' }));

app.get('/api/location/nearby', async (req, res) => {
  const lat = Number(req.query.lat);
  const lon = Number(req.query.lon);
  if (Number.isNaN(lat) || Number.isNaN(lon)) {
    return res.status(400).json({ error: 'lat and lon are required numbers' });
  }

  try {
    const reverse = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lon}`,
      { headers: { 'User-Agent': 'kitaabpadho/1.0' } }
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
      current: { latitude: lat, longitude: lon, address: 'Location detected (offline geocoder)' },
      hint: 'Geocoder unavailable, but geo-filtering still works.'
    });
  }
});

app.get('/api/listings', async (req, res) => {
  try {
    const result = await query(
      `SELECT id, title, description, category, listing_type AS "listingType", price, city, latitude, longitude,
      created_at AS "createdAt" FROM listings ORDER BY created_at DESC LIMIT 100`
    );
    res.json({ data: result.rows });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/listings', async (req, res) => {
  try {
    const body = listingSchema.parse(req.body);
    const result = await query(
      `INSERT INTO listings (title, description, category, listing_type, price, city, latitude, longitude)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       RETURNING id, title, description, category, listing_type AS "listingType", price, city, latitude, longitude, created_at AS "createdAt"`,
      [body.title, body.description, body.category, body.listingType, body.price, body.city, body.latitude, body.longitude]
    );
    res.status(201).json(result.rows[0]);
  } catch (error) {
    res.status(400).json({ error: error.message });
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
    const uploaded = await uploadMedia({
      buffer: req.file.buffer,
      contentType: req.file.mimetype,
      key
    });
    res.json({ ...uploaded, r2Enabled });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/ai/chat', async (req, res) => {
  try {
    const { prompt } = aiSchema.parse(req.body);
    const ai = await askPadhAI(prompt);
    res.json(ai);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.get('/manifest.webmanifest', (_, res) => {
  res.sendFile(path.join(process.cwd(), 'public', 'manifest.webmanifest'));
});

app.get('*', (_, res) => {
  res.sendFile(path.join(process.cwd(), 'public', 'index.html'));
});

app.listen(config.port, () => {
  console.log(`KitaabPadho revamp running on ${config.appBaseUrl}`);
});
