/*
  # Create integrations and messages tables

  1. New Tables
    - `integrations`
      - `id` (uuid, primary key)
      - `user_id` (uuid, references users.id)
      - `type` (text)
      - `config` (jsonb)
      - `status` (text)
      - `created_at` (timestamp)
    
    - `messages`
      - `id` (uuid, primary key)
      - `user_id` (uuid, references users.id)
      - `content` (text)
      - `role` (text)
      - `created_at` (timestamp)

  2. Security
    - Enable RLS on both tables
    - Add policies for authenticated users to manage their own data
    - Check for existing policies before creating new ones
*/

-- Create integrations table
CREATE TABLE IF NOT EXISTS integrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES users(id) ON DELETE CASCADE,
  type text NOT NULL,
  config jsonb DEFAULT '{}'::jsonb,
  status text DEFAULT 'inactive',
  created_at timestamptz DEFAULT now()
);

-- Create messages table
CREATE TABLE IF NOT EXISTS messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES users(id) ON DELETE CASCADE,
  content text NOT NULL,
  role text NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE integrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

-- Create policies with safety checks
DO $$ 
BEGIN
  -- Check and create policy for integrations
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'integrations' 
    AND policyname = 'Users can manage own integrations'
  ) THEN
    CREATE POLICY "Users can manage own integrations"
      ON integrations
      FOR ALL
      TO authenticated
      USING (auth.uid() = user_id);
  END IF;

  -- Check and create policy for messages
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'messages' 
    AND policyname = 'Users can manage own messages'
  ) THEN
    CREATE POLICY "Users can manage own messages"
      ON messages
      FOR ALL
      TO authenticated
      USING (auth.uid() = user_id);
  END IF;
END $$;