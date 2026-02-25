ALTER TABLE listings
  ADD COLUMN IF NOT EXISTS total_items INTEGER NOT NULL DEFAULT 1;

ALTER TABLE listings
  ADD COLUMN IF NOT EXISTS remaining_items INTEGER NOT NULL DEFAULT 1;

UPDATE listings
SET total_items = CASE WHEN total_items < 1 THEN 1 ELSE total_items END
WHERE total_items IS NULL OR total_items < 1;

UPDATE listings
SET remaining_items = CASE
  WHEN remaining_items IS NULL THEN total_items
  WHEN remaining_items < 0 THEN 0
  WHEN remaining_items > total_items THEN total_items
  ELSE remaining_items
END
WHERE remaining_items IS NULL OR remaining_items < 0 OR remaining_items > total_items;

ALTER TABLE listings
  ADD CONSTRAINT listings_total_items_ck CHECK (total_items >= 1);

ALTER TABLE listings
  ADD CONSTRAINT listings_remaining_items_ck CHECK (remaining_items >= 0);
