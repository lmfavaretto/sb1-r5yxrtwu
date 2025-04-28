/*
  # Remove WhatsApp integration tables

  1. Changes
    - Drop all WhatsApp-related tables
    - Drop related indexes and constraints
    - Keep establishment_id in users table as it may be used by other features

  2. Notes
    - Safe migration with IF EXISTS checks
    - Drops tables in correct order to respect foreign keys
*/

-- Drop tables in reverse order of dependencies
DROP TABLE IF EXISTS messages CASCADE;
DROP TABLE IF EXISTS message_tags CASCADE;
DROP TABLE IF EXISTS tag_rules CASCADE;
DROP TABLE IF EXISTS conversations CASCADE;
DROP TABLE IF EXISTS whatsapp_connections CASCADE;

-- Remove establishment_id from conversations if it exists
DO $$ 
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'conversations' AND column_name = 'establishment_id'
  ) THEN
    ALTER TABLE conversations DROP COLUMN establishment_id;
  END IF;
END $$;

-- Remove establishment_id from whatsapp_connections if it exists
DO $$ 
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'whatsapp_connections' AND column_name = 'establishment_id'
  ) THEN
    ALTER TABLE whatsapp_connections DROP COLUMN establishment_id;
  END IF;
END $$;

-- Drop related indexes
DROP INDEX IF EXISTS whatsapp_connections_establishment_id_idx;
DROP INDEX IF EXISTS conversations_establishment_id_idx;