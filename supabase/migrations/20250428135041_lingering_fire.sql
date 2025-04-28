DO $$ 
BEGIN
  -- Drop existing policies if they exist
  IF EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can read own record' AND tablename = 'account_users') THEN
    DROP POLICY "Users can read own record" ON account_users;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can read account records' AND tablename = 'account_users') THEN
    DROP POLICY "Users can read account records" ON account_users;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Admins can manage records' AND tablename = 'account_users') THEN
    DROP POLICY "Admins can manage records" ON account_users;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can read own and related records' AND tablename = 'users') THEN
    DROP POLICY "Users can read own and related records" ON users;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can update own record' AND tablename = 'users') THEN
    DROP POLICY "Users can update own record" ON users;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can read own data' AND tablename = 'users') THEN
    DROP POLICY "Users can read own data" ON users;
  END IF;

  -- Create new policies for users table
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can read own data' AND tablename = 'users') THEN
    CREATE POLICY "Users can read own data"
    ON users
    FOR SELECT
    TO authenticated
    USING (auth.uid() = id);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can update own data' AND tablename = 'users') THEN
    CREATE POLICY "Users can update own data"
    ON users
    FOR UPDATE
    TO authenticated
    USING (auth.uid() = id)
    WITH CHECK (auth.uid() = id);
  END IF;

  -- Create new policies for account_users table
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can read own account users' AND tablename = 'account_users') THEN
    CREATE POLICY "Users can read own account users"
    ON account_users
    FOR SELECT
    TO authenticated
    USING (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can manage own account users' AND tablename = 'account_users') THEN
    CREATE POLICY "Users can manage own account users"
    ON account_users
    FOR ALL
    TO authenticated
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);
  END IF;

  -- Create index if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes 
    WHERE indexname = 'account_users_user_id_idx'
  ) THEN
    CREATE INDEX account_users_user_id_idx ON account_users(user_id);
  END IF;
END $$;