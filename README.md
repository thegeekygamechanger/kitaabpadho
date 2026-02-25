# KitaabPadho Express Revamp

This branch revamps the project to a modern **Express** stack while preserving the core behavior (buy/rent flows, location-aware discovery, and AI helper).

## Stack
- **Backend:** Express + Helmet + CORS + Rate limiting + Zod validation
- **Database:** **Postgres (Neon compatible)** via `pg`
- **Media:** **Cloudflare R2** (images/videos/pdfs) via S3-compatible API
- **AI (PadhAI):** Gemini primary + Groq fallback/load-switch
- **Frontend:** Responsive web UI + **PWA** install support + Service Worker
- **Geolocation:** Browser geolocation + reverse geocode with OpenStreetMap Nominatim

## Quick start
1. Copy env:
   ```bash
   cp .env.example .env
   ```
2. Set `DATABASE_URL` to your Neon Postgres connection string.
3. Run schema SQL from `db/schema.sql`.
4. Install and run:
   ```bash
   npm install
   npm start
   ```
5. Open `http://localhost:3000`.

## Security baseline included
- Security headers (Helmet)
- API rate limiting
- Strict JSON parsing + payload limits
- Input validation using Zod
- Media MIME restrictions and upload size limit

## Notes
- If AI keys are missing, PadhAI returns graceful fallback message.
- If R2 credentials are missing, upload endpoint returns metadata without persistent object storage.
- Legacy PHP folders are intentionally left in repo for reference; new runtime is in `src/` + `public/`.
