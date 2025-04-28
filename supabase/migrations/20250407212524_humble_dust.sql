/*
  # Add check constraints safely

  1. Changes
    - Add check constraints for numeric values in order_items and order_payments
    - Use DO blocks to check for constraint existence before adding
    - Ensures safe execution even if constraints already exist

  2. Notes
    - Prevents invalid numeric values
    - Maintains data consistency
    - Safe to run multiple times
*/

DO $$ 
BEGIN
  -- Add check constraints for order_items if they don't exist
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'order_items_quantity_check'
  ) THEN
    ALTER TABLE order_items
    ADD CONSTRAINT order_items_quantity_check CHECK (quantity > 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'order_items_price_check'
  ) THEN
    ALTER TABLE order_items
    ADD CONSTRAINT order_items_price_check CHECK (price >= 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'order_items_total_price_check'
  ) THEN
    ALTER TABLE order_items
    ADD CONSTRAINT order_items_total_price_check CHECK (total_price >= 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'order_items_discount_check'
  ) THEN
    ALTER TABLE order_items
    ADD CONSTRAINT order_items_discount_check CHECK (discount >= 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'order_items_addition_check'
  ) THEN
    ALTER TABLE order_items
    ADD CONSTRAINT order_items_addition_check CHECK (addition >= 0);
  END IF;

  -- Add check constraint for order_payments if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'order_payments_value_check'
  ) THEN
    ALTER TABLE order_payments
    ADD CONSTRAINT order_payments_value_check CHECK (value >= 0);
  END IF;
END $$;