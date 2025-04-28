/*
  # Add order details and integration fields

  1. New Columns
    - Add to orders table:
      - reference (text, unique identifier from external system)
      - delivery_fee (numeric)
      - payment_method (text)
      - items (jsonb, array of order items)
    
    - Add to integrations table:
      - last_sync (timestamp)
      - sync_status (jsonb)

  2. Notes
    - All new columns are nullable
    - No changes to existing data
    - No changes to RLS policies needed
*/

-- Add columns to orders table
ALTER TABLE orders
ADD COLUMN IF NOT EXISTS reference text,
ADD COLUMN IF NOT EXISTS delivery_fee numeric,
ADD COLUMN IF NOT EXISTS payment_method text,
ADD COLUMN IF NOT EXISTS items jsonb;

-- Add unique constraint on reference
CREATE UNIQUE INDEX IF NOT EXISTS orders_reference_key ON orders (reference)
WHERE reference IS NOT NULL;

-- Add columns to integrations table
ALTER TABLE integrations
ADD COLUMN IF NOT EXISTS last_sync timestamptz,
ADD COLUMN IF NOT EXISTS sync_status jsonb;