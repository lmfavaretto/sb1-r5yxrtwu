/*
  # Create api_integrations table

  1. New Table
    - `api_integrations`
      - `id` (uuid, primary key)
      - `user_id` (uuid, references users.id)
      - `api_base_url` (text)
      - `email` (text)
      - `password` (text)
      - `token` (text)
      - `expires_at` (timestamp)
      - `last_order_reference` (text)
      - `created_at` (timestamp)
      - `updated_at` (timestamp)

  2. Security
    - Enable RLS
    - Add policy for authenticated users
    - Add trigger for updated_at
*/

-- Create table if it doesn't exist
CREATE TABLE IF NOT EXISTS api_integrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES users(id) ON DELETE CASCADE NOT NULL,
  api_base_url text NOT NULL,
  email text NOT NULL,
  password text NOT NULL,
  token text,
  expires_at timestamptz,
  last_order_reference text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(user_id, api_base_url)
);

-- Enable RLS
ALTER TABLE api_integrations ENABLE ROW LEVEL SECURITY;

-- Create policy if it doesn't exist
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'api_integrations' 
    AND policyname = 'Users can manage own integrations'
  ) THEN
    CREATE POLICY "Users can manage own integrations"
      ON api_integrations
      FOR ALL
      TO authenticated
      USING (auth.uid() = user_id)
      WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_api_integrations_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ language 'plpgsql';

-- Create trigger if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger 
    WHERE tgname = 'update_api_integrations_updated_at'
  ) THEN
    CREATE TRIGGER update_api_integrations_updated_at
      BEFORE UPDATE ON api_integrations
      FOR EACH ROW
      EXECUTE FUNCTION update_api_integrations_updated_at();
  END IF;
END $$;