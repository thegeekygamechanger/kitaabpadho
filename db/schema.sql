CREATE TABLE IF NOT EXISTS users (
  id BIGSERIAL PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  full_name TEXT NOT NULL,
  phone_number TEXT,
  password_hash TEXT NOT NULL,
  totp_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  totp_secret TEXT,
  totp_pending_secret TEXT,
  push_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  role TEXT NOT NULL DEFAULT 'student',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS listings (
  id BIGSERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('book','instrument','notes','video','pdf','stationery','stationary')),
  listing_type TEXT NOT NULL CHECK (listing_type IN ('rent','buy','sell')),
  seller_type TEXT NOT NULL DEFAULT 'student' CHECK (seller_type IN ('student','library','reseller','wholesaler','college','individual_seller','shop')),
  delivery_mode TEXT NOT NULL DEFAULT 'peer_to_peer' CHECK (delivery_mode IN ('peer_to_peer','seller_dedicated','kpi_dedicated')),
  payment_modes TEXT[] NOT NULL DEFAULT ARRAY['cod']::TEXT[],
  price NUMERIC(10,2) NOT NULL DEFAULT 0,
  city TEXT NOT NULL,
  area_code TEXT NOT NULL DEFAULT 'other' CHECK (area_code IN ('loni_kalbhor','hadapsar','camp','other')),
  latitude DOUBLE PRECISION NOT NULL,
  longitude DOUBLE PRECISION NOT NULL,
  created_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS media_assets (
  id BIGSERIAL PRIMARY KEY,
  listing_id BIGINT NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  object_key TEXT NOT NULL,
  object_url TEXT,
  media_type TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS community_categories (
  id BIGSERIAL PRIMARY KEY,
  slug TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS community_posts (
  id BIGSERIAL PRIMARY KEY,
  category_id BIGINT NOT NULL REFERENCES community_categories(id) ON DELETE RESTRICT,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  created_by BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS community_comments (
  id BIGSERIAL PRIMARY KEY,
  post_id BIGINT NOT NULL REFERENCES community_posts(id) ON DELETE CASCADE,
  created_by BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  comment TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS project_actions (
  id BIGSERIAL PRIMARY KEY,
  actor_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  actor_email TEXT,
  actor_role TEXT,
  action_type TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id BIGINT,
  summary TEXT NOT NULL,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  ip_address TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS notifications (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL DEFAULT '',
  entity_type TEXT NOT NULL DEFAULT '',
  entity_id BIGINT,
  is_read BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

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

CREATE TABLE IF NOT EXISTS user_preferences (
  user_id BIGINT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  exam_focus TEXT,
  preferred_categories TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  preferred_stationery TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  preferred_radius_km INT NOT NULL DEFAULT 200,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ai_chat_memory (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user','assistant')),
  message TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_listings_geo ON listings (latitude, longitude);
CREATE INDEX IF NOT EXISTS idx_listings_created_at ON listings (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_listings_filters ON listings (listing_type, category, area_code);
CREATE INDEX IF NOT EXISTS idx_media_listing_id ON media_assets (listing_id);
CREATE INDEX IF NOT EXISTS idx_community_posts_created_at ON community_posts (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_community_posts_category ON community_posts (category_id);
CREATE INDEX IF NOT EXISTS idx_community_comments_post ON community_comments (post_id, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_project_actions_created_at ON project_actions (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_project_actions_action_type ON project_actions (action_type);
CREATE INDEX IF NOT EXISTS idx_project_actions_entity ON project_actions (entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user_created ON notifications (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_user_unread ON notifications (user_id, is_read, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_chat_memory_user_created ON ai_chat_memory (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user ON push_subscriptions (user_id);
CREATE INDEX IF NOT EXISTS idx_delivery_jobs_status_created ON delivery_jobs (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_delivery_jobs_geo ON delivery_jobs (pickup_latitude, pickup_longitude);

INSERT INTO community_categories (slug, name, description)
VALUES
  ('books-and-notes', 'Books & Notes', 'Find books, notes, and exam prep material around you.'),
  ('instruments-and-tools', 'Instruments & Tools', 'Share, rent, or buy practical tools and kits.'),
  ('helping-hands', 'Helping Hands', 'Connect with seniors and peers for study guidance.'),
  ('local-libraries', 'Local Libraries', 'Discuss nearby libraries, timings, and availability.')
ON CONFLICT (slug) DO NOTHING;
