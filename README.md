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
3. Install and run:
   ```bash
   npm install
   npm start
   ```
4. On startup, the app auto-applies:
   - `db/schema.sql`
   - all `.sql` files under `db/migrations/`
   (tracked using `schema_migrations` table)
5. Open `http://localhost:3000`.

## Run tests
```bash
npm test
```

## Key API additions
- `POST /api/auth/register`
- `POST /api/auth/login`
- `POST /api/auth/logout`
- `GET /api/auth/me`
- `PATCH /api/profile`
- `POST /api/profile/change-password`
- `POST /api/profile/totp/setup`
- `POST /api/profile/totp/enable`
- `POST /api/profile/totp/disable`
- `GET /api/notifications`
- `POST /api/notifications/:id/read`
- `POST /api/notifications/read-all`
- `GET /api/listings` filters include `sell`, `areaCode`, geo sort/pagination
- `GET /api/listings/:id`
- `POST /api/listings/:id/media`
- `GET /api/community/categories`
- `GET /api/community/posts`
- `GET /api/community/posts/:id`
- `POST /api/community/posts`
- `POST /api/community/posts/:id/comments`
- `DELETE /api/community/comments/:id`
- `GET /api/admin/summary` (admin only)
- `GET /api/admin/actions` (admin only)
- `POST /api/admin/change-password` (admin only)
- `POST /api/admin/users/reset-password` (admin only)
- `GET /api/admin/users/:id/history` (admin only)

## Admin panel
- Admin panel is available in the web UI (`Admin` nav tab) only for users with `role = 'admin'`.
- You can bootstrap/reset admin credentials from env on every startup:
  ```env
  ADMIN_EMAIL=your-admin@email.com
  ADMIN_PASSWORD=your_strong_password
  ADMIN_FULL_NAME=KitaabPadho Admin
  ADMIN_PHONE_NUMBER=9999999999
  ```
- If `ADMIN_EMAIL` + `ADMIN_PASSWORD` are set, startup will:
  - create the admin user if it does not exist
  - force role to `admin`
  - reset password to `ADMIN_PASSWORD`
- Promote a user manually in Postgres:
  ```sql
  UPDATE users SET role = 'admin' WHERE email = 'your-admin@email.com';
  ```
- Log out and log in again after role change so the session token reflects admin role.

## Security baseline included
- Security headers (Helmet)
- API rate limiting
- Strict JSON parsing + payload limits
- Input validation using Zod
- Media MIME restrictions and upload size limit

## Notes
- If AI keys are missing, PadhAI returns graceful fallback message.
- If R2 credentials are missing, upload endpoint returns metadata without persistent object storage.
- PWA now shows an update dialog when a new service worker is waiting; clicking `Update Now` applies it and reloads.
- Marketplace catalog supports `stationery` category in filters and listings.

## Groq for PadhAI (Render env format)
Set these env vars in Render to enable Groq:
```env
GROQ_API_KEY=your_groq_api_key
AI_MODEL_GROQ=llama-3.1-8b-instant
AI_PRIMARY_PROVIDER=groq
AI_TIMEOUT_MS=20000
GROQ_BASE_URL=https://api.groq.com/openai/v1
```
Optional fallback to Gemini:
```env
GEMINI_API_KEY=your_gemini_api_key
AI_MODEL_GEMINI=gemini-1.5-flash
AI_GEMINI_WEIGHT=0.75
```
