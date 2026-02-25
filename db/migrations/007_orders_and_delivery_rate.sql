ALTER TABLE listings
  ADD COLUMN IF NOT EXISTS delivery_rate_per_10km NUMERIC(10,2) NOT NULL DEFAULT 20;

CREATE TABLE IF NOT EXISTS platform_settings (
  setting_key TEXT PRIMARY KEY,
  setting_value TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO platform_settings (setting_key, setting_value, updated_at)
VALUES ('delivery_rate_per_10km', '20', NOW())
ON CONFLICT (setting_key) DO NOTHING;

CREATE TABLE IF NOT EXISTS marketplace_orders (
  id BIGSERIAL PRIMARY KEY,
  listing_id BIGINT NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  buyer_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  seller_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  action_kind TEXT NOT NULL CHECK (action_kind IN ('buy','rent')),
  quantity INT NOT NULL DEFAULT 1,
  unit_price NUMERIC(10,2) NOT NULL DEFAULT 0,
  total_price NUMERIC(10,2) NOT NULL DEFAULT 0,
  distance_km NUMERIC(8,2) NOT NULL DEFAULT 0,
  delivery_rate_per_10km NUMERIC(10,2) NOT NULL DEFAULT 20,
  delivery_charge NUMERIC(10,2) NOT NULL DEFAULT 0,
  payable_total NUMERIC(10,2) NOT NULL DEFAULT 0,
  payment_mode TEXT NOT NULL CHECK (payment_mode IN ('cod','upi','card','razorpay')),
  payment_state TEXT NOT NULL DEFAULT 'pending' CHECK (payment_state IN ('pending','paid','failed','cod_due')),
  payment_gateway TEXT NOT NULL DEFAULT '',
  payment_gateway_order_id TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'received' CHECK (status IN ('received','packing','shipping','out_for_delivery','delivered','cancelled')),
  delivery_mode TEXT NOT NULL DEFAULT 'peer_to_peer',
  delivery_partner_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  paycheck_amount NUMERIC(10,2) NOT NULL DEFAULT 0,
  paycheck_status TEXT NOT NULL DEFAULT 'pending' CHECK (paycheck_status IN ('pending','released')),
  buyer_city TEXT NOT NULL DEFAULT '',
  buyer_area_code TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE marketplace_orders
  ADD COLUMN IF NOT EXISTS delivery_partner_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS paycheck_amount NUMERIC(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS paycheck_status TEXT NOT NULL DEFAULT 'pending';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'marketplace_orders_paycheck_status_check'
  ) THEN
    ALTER TABLE marketplace_orders
      ADD CONSTRAINT marketplace_orders_paycheck_status_check
      CHECK (paycheck_status IN ('pending','released'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_marketplace_orders_buyer_created ON marketplace_orders (buyer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_marketplace_orders_seller_created ON marketplace_orders (seller_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_marketplace_orders_status_updated ON marketplace_orders (status, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_marketplace_orders_listing ON marketplace_orders (listing_id, created_at DESC);
