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

CREATE INDEX IF NOT EXISTS idx_ai_chat_memory_user_created ON ai_chat_memory (user_id, created_at DESC);
