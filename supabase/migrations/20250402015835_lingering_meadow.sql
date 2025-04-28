/*
  # Create insights table for storing AI-generated insights

  1. New Tables
    - `insights`
      - `id` (uuid, primary key)
      - `user_id` (uuid, references users.id)
      - `insights` (jsonb)
      - `metrics` (jsonb)
      - `created_at` (timestamp)

  2. Security
    - Enable RLS
    - Add policy for authenticated users to manage their own insights
*/

CREATE TABLE IF NOT EXISTS insights (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES users(id) ON DELETE CASCADE,
  insights jsonb NOT NULL,
  metrics jsonb NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE insights ENABLE ROW LEVEL SECURITY;

-- Create policy
CREATE POLICY "Users can manage own insights"
  ON insights
  FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Create index for faster queries
CREATE INDEX insights_user_id_created_at_idx ON insights (user_id, created_at DESC);