ALTER TABLE listings
  DROP CONSTRAINT IF EXISTS listings_listing_type_check;

ALTER TABLE listings
  ADD CONSTRAINT listings_listing_type_check
  CHECK (listing_type IN ('rent','buy','sell'));

ALTER TABLE listings
  ADD COLUMN IF NOT EXISTS area_code TEXT NOT NULL DEFAULT 'other';

ALTER TABLE listings
  DROP CONSTRAINT IF EXISTS listings_area_code_check;

ALTER TABLE listings
  ADD CONSTRAINT listings_area_code_check
  CHECK (area_code IN ('loni_kalbhor','hadapsar','camp','other'));

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

CREATE INDEX IF NOT EXISTS idx_listings_filters ON listings (listing_type, category, area_code);
CREATE INDEX IF NOT EXISTS idx_media_listing_id ON media_assets (listing_id);
CREATE INDEX IF NOT EXISTS idx_community_posts_created_at ON community_posts (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_community_posts_category ON community_posts (category_id);
CREATE INDEX IF NOT EXISTS idx_community_comments_post ON community_comments (post_id, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_project_actions_created_at ON project_actions (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_project_actions_action_type ON project_actions (action_type);
CREATE INDEX IF NOT EXISTS idx_project_actions_entity ON project_actions (entity_type, entity_id);

INSERT INTO community_categories (slug, name, description)
VALUES
  ('books-and-notes', 'Books & Notes', 'Find books, notes, and exam prep material around you.'),
  ('instruments-and-tools', 'Instruments & Tools', 'Share, rent, or buy practical tools and kits.'),
  ('helping-hands', 'Helping Hands', 'Connect with seniors and peers for study guidance.'),
  ('local-libraries', 'Local Libraries', 'Discuss nearby libraries, timings, and availability.')
ON CONFLICT (slug) DO NOTHING;
