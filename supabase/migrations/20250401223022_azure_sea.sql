/*
  # Add missing columns to users table

  1. Changes
    - Add `phone` column to users table if it doesn't exist
    - Add `business_name` column to users table if it doesn't exist
    - Add `name` column to users table if it doesn't exist

  2. Notes
    - All fields are nullable text columns
    - No changes to existing data or policies required
    - Safe migration that checks for column existence before adding
*/

DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'users' AND column_name = 'phone'
  ) THEN
    ALTER TABLE users ADD COLUMN phone text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'users' AND column_name = 'business_name'
  ) THEN
    ALTER TABLE users ADD COLUMN business_name text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'users' AND column_name = 'name'
  ) THEN
    ALTER TABLE users ADD COLUMN name text;
  END IF;
END $$;