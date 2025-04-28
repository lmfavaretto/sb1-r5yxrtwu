/*
  # Add unique constraint for user_id and phone

  1. Changes
    - Add unique constraint on customers table combining user_id and phone
    - This enables upsert operations based on these columns
    - Required for CSV import and API sync functionality

  2. Notes
    - Ensures no duplicate phone numbers per user
    - Allows updating existing customers during import/sync
*/

-- Add unique constraint for user_id and phone combination
DO $$ 
BEGIN
  -- First check if the constraint already exists
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'customers_user_id_phone_key'
  ) THEN
    -- Add the constraint
    ALTER TABLE customers
    ADD CONSTRAINT customers_user_id_phone_key UNIQUE (user_id, phone);
  END IF;
END $$;