ALTER TABLE users
  ADD COLUMN IF NOT EXISTS phone_number TEXT;

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS push_enabled BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE listings
  ADD COLUMN IF NOT EXISTS seller_type TEXT NOT NULL DEFAULT 'student';

ALTER TABLE listings
  ADD COLUMN IF NOT EXISTS delivery_mode TEXT NOT NULL DEFAULT 'peer_to_peer';

ALTER TABLE listings
  ADD COLUMN IF NOT EXISTS payment_modes TEXT[] NOT NULL DEFAULT ARRAY['cod']::TEXT[];

ALTER TABLE listings
  DROP CONSTRAINT IF EXISTS listings_seller_type_check;

ALTER TABLE listings
  ADD CONSTRAINT listings_seller_type_check
  CHECK (seller_type IN ('student','library','reseller','wholesaler','college','individual_seller','shop'));

ALTER TABLE listings
  DROP CONSTRAINT IF EXISTS listings_delivery_mode_check;

ALTER TABLE listings
  ADD CONSTRAINT listings_delivery_mode_check
  CHECK (delivery_mode IN ('peer_to_peer','seller_dedicated','kpi_dedicated'));

CREATE TABLE IF NOT EXISTS push_subscriptions (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL UNIQUE,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  city TEXT NOT NULL DEFAULT '',
  area_code TEXT NOT NULL DEFAULT '',
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS delivery_jobs (
  id BIGSERIAL PRIMARY KEY,
  listing_id BIGINT NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  pickup_city TEXT NOT NULL,
  pickup_area_code TEXT NOT NULL DEFAULT 'other',
  pickup_latitude DOUBLE PRECISION,
  pickup_longitude DOUBLE PRECISION,
  delivery_mode TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','claimed','completed','cancelled')),
  created_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
  claimed_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user ON push_subscriptions (user_id);
CREATE INDEX IF NOT EXISTS idx_delivery_jobs_status_created ON delivery_jobs (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_delivery_jobs_geo ON delivery_jobs (pickup_latitude, pickup_longitude);
