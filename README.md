# KitaabPadho Express Revamp

This branch revamps the project to a modern **Express** stack while preserving and extending legacy intent:
- Geo-aware discovery (GPS + static areas)
- Buy/Rent/**Sell** marketplace
- Community topics + comments
- PadhAI assistant with provider fallback
- PWA install/offline shell support

## Stack
- **Backend:** Express + Helmet + CORS + Rate limiting + Zod validation
- **Database:** **Postgres (Neon compatible)** via `pg`
- **Media:** **Cloudflare R2** (images/videos/pdfs) via S3-compatible API
- **AI (PadhAI):** Gemini primary + Groq fallback/load-switch
- **Frontend:** Modular vanilla JS + responsive Flipkart-style marketplace UI
- **Geolocation:** Browser geolocation + reverse geocode with OpenStreetMap Nominatim

## Quick start
1. Copy env:
   ```bash
   cp .env.example .env
   ```
2. Set `DATABASE_URL` to your Neon Postgres connection string.
3. Run schema SQL from `db/schema.sql`.
4. If upgrading an existing DB, also run:
   - `db/migrations/001_revamp_kitaabpadhoindia.sql`
5. Install and run:
   ```bash
   npm install
   npm start
   ```
6. Open `http://localhost:3000`.

## Run tests
```bash
npm test
```

## Key API additions
- `POST /api/auth/register`
- `POST /api/auth/login`
- `POST /api/auth/logout`
- `GET /api/auth/me`
- `GET /api/listings` filters include `sell`, `areaCode`, geo sort/pagination
- `GET /api/listings/:id`
- `POST /api/listings/:id/media`
- `GET /api/community/categories`
- `GET /api/community/posts`
- `GET /api/community/posts/:id`
- `POST /api/community/posts`
- `POST /api/community/posts/:id/comments`
- `DELETE /api/community/comments/:id`

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
