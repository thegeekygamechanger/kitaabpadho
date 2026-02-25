DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'listings_area_code_check') THEN
    ALTER TABLE listings DROP CONSTRAINT listings_area_code_check;
  END IF;
END $$;

ALTER TABLE listings
  ALTER COLUMN area_code SET DEFAULT '',
  ADD COLUMN IF NOT EXISTS publish_india BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE delivery_jobs
  ALTER COLUMN pickup_area_code SET DEFAULT '';

CREATE TABLE IF NOT EXISTS marketing_banners (
  id BIGSERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  message TEXT NOT NULL DEFAULT '',
  image_key TEXT NOT NULL DEFAULT '',
  image_url TEXT NOT NULL DEFAULT '',
  link_url TEXT NOT NULL DEFAULT '/#marketplace',
  button_text TEXT NOT NULL DEFAULT 'View',
  scope TEXT NOT NULL DEFAULT 'local' CHECK (scope IN ('local','india','all')),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  priority INT NOT NULL DEFAULT 0,
  source TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('manual','listing_auto')),
  listing_id BIGINT REFERENCES listings(id) ON DELETE CASCADE,
  created_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
  created_by_role TEXT NOT NULL DEFAULT 'seller',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_listings_publish_india ON listings (publish_india, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_marketing_banners_scope_active ON marketing_banners (scope, is_active, priority DESC, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_marketing_banners_listing ON marketing_banners (listing_id);
