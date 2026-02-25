ALTER TABLE listings
  ADD COLUMN IF NOT EXISTS serviceable_area_codes TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN IF NOT EXISTS serviceable_cities TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

CREATE INDEX IF NOT EXISTS idx_listings_serviceable_areas ON listings USING GIN (serviceable_area_codes);
CREATE INDEX IF NOT EXISTS idx_listings_serviceable_cities ON listings USING GIN (serviceable_cities);

CREATE TABLE IF NOT EXISTS customer_feedback (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  source_portal TEXT NOT NULL DEFAULT 'client',
  sender_name TEXT NOT NULL,
  sender_email TEXT NOT NULL,
  sender_role TEXT NOT NULL DEFAULT 'guest',
  subject TEXT NOT NULL DEFAULT '',
  message TEXT NOT NULL,
  attachment_key TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_customer_feedback_user_created ON customer_feedback (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_customer_feedback_created ON customer_feedback (created_at DESC);
