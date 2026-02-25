ALTER TABLE marketplace_orders
  ADD COLUMN IF NOT EXISTS seller_status_tag TEXT NOT NULL DEFAULT '';

ALTER TABLE marketplace_orders
  ADD COLUMN IF NOT EXISTS seller_note TEXT NOT NULL DEFAULT '';

ALTER TABLE marketplace_orders
  ADD COLUMN IF NOT EXISTS delivery_status_tag TEXT NOT NULL DEFAULT '';

ALTER TABLE marketplace_orders
  ADD COLUMN IF NOT EXISTS delivery_note TEXT NOT NULL DEFAULT '';
