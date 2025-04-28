/*
  # Remove WhatsApp integration tables and related data

  1. Changes
    - Drop all WhatsApp-related tables
    - Remove WhatsApp-related columns from other tables
    - Drop related indexes and constraints

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

-- Remove WhatsApp-related columns from users table if they exist
DO $$ 
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'users' AND column_name = 'whatsapp_number'
  ) THEN
    ALTER TABLE users DROP COLUMN whatsapp_number;
  END IF;
END $$;

-- Drop related indexes
DROP INDEX IF EXISTS whatsapp_connections_user_id_idx;
DROP INDEX IF EXISTS conversations_user_id_idx;
DROP INDEX IF EXISTS messages_conversation_id_idx;
DROP INDEX IF EXISTS message_tags_conversation_id_idx;