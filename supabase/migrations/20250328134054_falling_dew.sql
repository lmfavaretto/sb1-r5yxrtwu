/*
  # Add address fields to customers table

  1. Changes
    - Add `city` column to customers table
    - Add `neighborhood` column to customers table

  2. Notes
    - Both fields are nullable text columns
    - No changes to existing data or policies required
*/

DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'customers' AND column_name = 'city'
  ) THEN
    ALTER TABLE customers ADD COLUMN city text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'customers' AND column_name = 'neighborhood'
  ) THEN
    ALTER TABLE customers ADD COLUMN neighborhood text;
  END IF;
END $$;