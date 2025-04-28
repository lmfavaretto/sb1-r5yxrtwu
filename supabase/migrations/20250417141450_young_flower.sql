/*
  # Add establishment_id to users and whatsapp_connections tables

  1. Changes
    - Add establishment_id column to users table
    - Add establishment_id column to whatsapp_connections table
    - Add establishment_id column to conversations table
    - Add indexes and foreign keys

  2. Notes
    - Enables multi-tenant functionality
    - Links WhatsApp connections to establishments
    - Ensures proper data isolation between establishments
*/

-- Add establishment_id to users if it doesn't exist
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'users' AND column_name = 'establishment_id'
  ) THEN
    ALTER TABLE users ADD COLUMN establishment_id uuid;
  END IF;
END $$;

-- Add establishment_id to whatsapp_connections if it doesn't exist
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'whatsapp_connections' AND column_name = 'establishment_id'
  ) THEN
    ALTER TABLE whatsapp_connections ADD COLUMN establishment_id uuid;
  END IF;
END $$;

-- Add establishment_id to conversations if it doesn't exist
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'conversations' AND column_name = 'establishment_id'
  ) THEN
    ALTER TABLE conversations ADD COLUMN establishment_id uuid;
  END IF;
END $$;

-- Add waba_id to whatsapp_connections if it doesn't exist
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'whatsapp_connections' AND column_name = 'waba_id'
  ) THEN
    ALTER TABLE whatsapp_connections ADD COLUMN waba_id text;
  END IF;
END $$;

-- Create indexes
CREATE INDEX IF NOT EXISTS users_establishment_id_idx ON users(establishment_id);
CREATE INDEX IF NOT EXISTS whatsapp_connections_establishment_id_idx ON whatsapp_connections(establishment_id);
CREATE INDEX IF NOT EXISTS conversations_establishment_id_idx ON conversations(establishment_id);

-- Update RLS policies for whatsapp_connections
DROP POLICY IF EXISTS "Users can manage own connections" ON whatsapp_connections;
CREATE POLICY "Users can access establishment connections"
  ON whatsapp_connections
  FOR ALL
  TO authenticated
  USING (
    establishment_id IN (
      SELECT establishment_id FROM users WHERE id = auth.uid()
    )
  )
  WITH CHECK (
    establishment_id IN (
      SELECT establishment_id FROM users WHERE id = auth.uid()
    )
  );

-- Update RLS policies for conversations
DROP POLICY IF EXISTS "Users can manage own conversations" ON conversations;
CREATE POLICY "Users can access establishment conversations"
  ON conversations
  FOR ALL
  TO authenticated
  USING (
    establishment_id IN (
      SELECT establishment_id FROM users WHERE id = auth.uid()
    )
  )
  WITH CHECK (
    establishment_id IN (
      SELECT establishment_id FROM users WHERE id = auth.uid()
    )
  );