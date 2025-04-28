-- Create account_users table if it doesn't exist
CREATE TABLE IF NOT EXISTS account_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES users(id) ON DELETE CASCADE NOT NULL,
  name text NOT NULL,
  email text NOT NULL,
  role text DEFAULT 'user' CHECK (role IN ('admin', 'user')),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE account_users ENABLE ROW LEVEL SECURITY;

-- Create unique constraint on email per user
CREATE UNIQUE INDEX IF NOT EXISTS unique_email_per_user ON account_users (user_id, email);
CREATE UNIQUE INDEX IF NOT EXISTS account_users_email_key ON account_users (email);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS account_users_user_id_idx ON account_users (user_id);
CREATE INDEX IF NOT EXISTS account_users_user_id_email_idx ON account_users (user_id, email);

-- Create updated_at trigger function
CREATE OR REPLACE FUNCTION update_account_users_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for updated_at with safety check
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger 
    WHERE tgname = 'update_account_users_timestamp'
  ) THEN
    CREATE TRIGGER update_account_users_timestamp
      BEFORE UPDATE ON account_users
      FOR EACH ROW
      EXECUTE FUNCTION update_account_users_updated_at();
  END IF;
END $$;

-- Create function to enforce users limit
CREATE OR REPLACE FUNCTION check_account_users_limit()
RETURNS TRIGGER AS $$
BEGIN
  IF (
    SELECT COUNT(*)
    FROM account_users
    WHERE user_id = NEW.user_id
  ) >= 2 THEN
    RAISE EXCEPTION 'Maximum number of users (2) reached';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to enforce users limit with safety check
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger 
    WHERE tgname = 'enforce_users_limit'
  ) THEN
    CREATE TRIGGER enforce_users_limit
      BEFORE INSERT ON account_users
      FOR EACH ROW
      EXECUTE FUNCTION check_account_users_limit();
  END IF;
END $$;

-- Create function to cleanup orphaned users
CREATE OR REPLACE FUNCTION cleanup_orphaned_account_users()
RETURNS TRIGGER AS $$
BEGIN
  DELETE FROM account_users a
  WHERE a.email = NEW.email
  AND a.user_id != NEW.user_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for cleanup with safety check
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger 
    WHERE tgname = 'cleanup_orphaned_account_users_trigger'
  ) THEN
    CREATE TRIGGER cleanup_orphaned_account_users_trigger
      BEFORE INSERT ON account_users
      FOR EACH ROW
      EXECUTE FUNCTION cleanup_orphaned_account_users();
  END IF;
END $$;

-- Create policies with safety checks
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE policyname = 'Users can manage own account users'
  ) THEN
    CREATE POLICY "Users can manage own account users"
      ON account_users
      FOR ALL
      TO authenticated
      USING (user_id = auth.uid())
      WITH CHECK (user_id = auth.uid());
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE policyname = 'Users can read own account users'
  ) THEN
    CREATE POLICY "Users can read own account users"
      ON account_users
      FOR SELECT
      TO authenticated
      USING (user_id = auth.uid());
  END IF;
END $$;