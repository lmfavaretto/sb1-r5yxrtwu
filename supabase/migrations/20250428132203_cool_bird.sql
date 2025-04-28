/*
  # Create account_users table

  1. New Tables
    - `account_users`
      - `id` (uuid, primary key)
      - `user_id` (uuid, references users.id)
      - `name` (text)
      - `email` (text)
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)
      - `role` (text)

  2. Security
    - Enable RLS
    - Add policies for authenticated users
    - Add constraints for max users per account
*/

CREATE TABLE IF NOT EXISTS account_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES users(id) ON DELETE CASCADE NOT NULL,
  name text NOT NULL,
  email text NOT NULL UNIQUE,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  role text DEFAULT 'user' CHECK (role IN ('admin', 'user')),
  CONSTRAINT unique_email_per_user UNIQUE (user_id, email)
);

-- Enable RLS
ALTER TABLE account_users ENABLE ROW LEVEL SECURITY;

-- Create policy for account owners
CREATE POLICY "Account owners can manage their users"
  ON account_users
  FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Create function to check user limit
CREATE OR REPLACE FUNCTION check_account_users_limit()
RETURNS TRIGGER AS $$
BEGIN
  IF (
    SELECT COUNT(*)
    FROM account_users
    WHERE user_id = NEW.user_id
  ) >= 2 THEN
    RAISE EXCEPTION 'Limite máximo de 2 usuários atingido.';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for user limit
CREATE TRIGGER enforce_users_limit
  BEFORE INSERT ON account_users
  FOR EACH ROW
  EXECUTE FUNCTION check_account_users_limit();

-- Create function to update updated_at
CREATE OR REPLACE FUNCTION update_account_users_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for updated_at
CREATE TRIGGER update_account_users_timestamp
  BEFORE UPDATE ON account_users
  FOR EACH ROW
  EXECUTE FUNCTION update_account_users_updated_at();