-- Drop existing policies
DROP POLICY IF EXISTS "Users can read own and related records" ON users;
DROP POLICY IF EXISTS "Users can read account users" ON account_users;
DROP POLICY IF EXISTS "Users can manage account users" ON account_users;

-- Create simplified policy for users table
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'users' 
    AND policyname = 'Users can read own and related records'
  ) THEN
    CREATE POLICY "Users can read own and related records"
    ON users
    FOR SELECT
    TO authenticated
    USING (
      id = auth.uid() OR
      id IN (
        SELECT user_id FROM account_users
        WHERE email = (
          SELECT email FROM auth.users WHERE id = auth.uid()
        )
      )
    );
  END IF;
END $$;

-- Create policies for account_users table
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'account_users' 
    AND policyname = 'Users can read account users'
  ) THEN
    CREATE POLICY "Users can read account users"
    ON account_users
    FOR SELECT
    TO authenticated
    USING (
      user_id = auth.uid() OR
      email = (
        SELECT email FROM auth.users WHERE id = auth.uid()
      )
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'account_users' 
    AND policyname = 'Users can manage account users'
  ) THEN
    CREATE POLICY "Users can manage account users"
    ON account_users
    FOR ALL
    TO authenticated
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());
  END IF;
END $$;

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_account_users_email ON account_users(email);
CREATE INDEX IF NOT EXISTS idx_account_users_user_id ON account_users(user_id);