CREATE TABLE IF NOT EXISTS users (
  id BIGSERIAL PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  full_name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'student',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS listings (
  id BIGSERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('book','instrument','notes','video','pdf')),
  listing_type TEXT NOT NULL CHECK (listing_type IN ('rent','buy')),
  price NUMERIC(10,2) NOT NULL DEFAULT 0,
  city TEXT NOT NULL,
  latitude DOUBLE PRECISION NOT NULL,
  longitude DOUBLE PRECISION NOT NULL,
  created_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS media_assets (
  id BIGSERIAL PRIMARY KEY,
  listing_id BIGINT REFERENCES listings(id) ON DELETE CASCADE,
  object_key TEXT NOT NULL,
  object_url TEXT,
  media_type TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_listings_geo ON listings (latitude, longitude);
CREATE INDEX IF NOT EXISTS idx_listings_created_at ON listings (created_at DESC);
