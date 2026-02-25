ALTER TABLE delivery_jobs
  ADD COLUMN IF NOT EXISTS order_id BIGINT;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'delivery_jobs_status_check'
      AND conrelid = 'delivery_jobs'::regclass
  ) THEN
    ALTER TABLE delivery_jobs DROP CONSTRAINT delivery_jobs_status_check;
  END IF;
END $$;

ALTER TABLE delivery_jobs
  ADD CONSTRAINT delivery_jobs_status_check
  CHECK (status IN ('open','claimed','picked','on_the_way','delivered','rejected','completed','cancelled'));

UPDATE delivery_jobs
SET status = 'delivered'
WHERE status = 'completed';

CREATE INDEX IF NOT EXISTS idx_delivery_jobs_order ON delivery_jobs (order_id, status, updated_at DESC);
