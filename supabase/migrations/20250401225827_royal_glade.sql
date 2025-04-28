/*
  # Add logo_url column to users table

  1. Changes
    - Add `logo_url` column to users table to store business logo URL
    - Column is nullable text type

  2. Notes
    - No changes to existing data or policies required
    - URLs will point to images stored in Supabase Storage
*/

DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'users' AND column_name = 'logo_url'
  ) THEN
    ALTER TABLE users ADD COLUMN logo_url text;
  END IF;
END $$;