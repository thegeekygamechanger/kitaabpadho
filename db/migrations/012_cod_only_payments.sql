UPDATE listings
SET payment_modes = ARRAY['cod']::TEXT[]
WHERE payment_modes IS DISTINCT FROM ARRAY['cod']::TEXT[];

UPDATE marketplace_orders
SET
  payment_mode = 'cod',
  payment_state = CASE
    WHEN payment_state = 'paid' THEN 'paid'
    ELSE 'cod_due'
  END,
  payment_gateway = '',
  payment_gateway_order_id = '',
  updated_at = NOW()
WHERE payment_mode <> 'cod'
   OR payment_state <> CASE WHEN payment_state = 'paid' THEN 'paid' ELSE 'cod_due' END
   OR payment_gateway <> ''
   OR payment_gateway_order_id <> '';

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'marketplace_orders_payment_mode_check'
      AND conrelid = 'marketplace_orders'::regclass
  ) THEN
    ALTER TABLE marketplace_orders DROP CONSTRAINT marketplace_orders_payment_mode_check;
  END IF;
END $$;

ALTER TABLE marketplace_orders
  ADD CONSTRAINT marketplace_orders_payment_mode_check
  CHECK (payment_mode IN ('cod'));
