DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'delivery_jobs_status_check'
      AND conrelid = 'delivery_jobs'::regclass
  ) THEN
    ALTER TABLE delivery_jobs
      DROP CONSTRAINT delivery_jobs_status_check;
  END IF;
END $$;

ALTER TABLE delivery_jobs
  ADD CONSTRAINT delivery_jobs_status_check
  CHECK (status IN ('open','claimed','picked','in_transit','on_the_way','delivered','rejected','completed','cancelled'));

ALTER TABLE marketplace_orders
  ADD COLUMN IF NOT EXISTS buyer_rating SMALLINT;

ALTER TABLE marketplace_orders
  ADD COLUMN IF NOT EXISTS buyer_rating_remark TEXT NOT NULL DEFAULT '';

ALTER TABLE marketplace_orders
  ADD COLUMN IF NOT EXISTS buyer_rated_at TIMESTAMPTZ;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'marketplace_orders_buyer_rating_check'
      AND conrelid = 'marketplace_orders'::regclass
  ) THEN
    ALTER TABLE marketplace_orders
      ADD CONSTRAINT marketplace_orders_buyer_rating_check
      CHECK (buyer_rating IS NULL OR (buyer_rating BETWEEN 1 AND 5));
  END IF;
END $$;
