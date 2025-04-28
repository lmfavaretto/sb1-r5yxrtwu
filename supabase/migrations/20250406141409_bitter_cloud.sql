/*
  # Create API Integrations Table

  1. New Tables
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
    - Add policy for authenticated users to manage their own integrations
*/

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

-- Create policy
CREATE POLICY "Users can manage own integrations"
  ON api_integrations
  FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_api_integrations_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ language 'plpgsql';

-- Create trigger for updated_at
CREATE TRIGGER update_api_integrations_updated_at
  BEFORE UPDATE ON api_integrations
  FOR EACH ROW
  EXECUTE FUNCTION update_api_integrations_updated_at();