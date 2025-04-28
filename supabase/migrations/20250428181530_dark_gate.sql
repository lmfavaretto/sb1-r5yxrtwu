-- Drop existing policies
DROP POLICY IF EXISTS "Users can read own data" ON users;
DROP POLICY IF EXISTS "Users can read account users" ON account_users;
DROP POLICY IF EXISTS "Users can manage account users" ON account_users;

-- Create policy for users table
CREATE POLICY "Users can read own and related records"
ON users
FOR SELECT
TO authenticated
USING (
  id = auth.uid() OR
  EXISTS (
    SELECT 1 FROM account_users
    WHERE account_users.email = (SELECT email FROM auth.users WHERE id = auth.uid())
    AND account_users.user_id = users.id
  )
);

-- Create policies for account_users table
CREATE POLICY "Users can read account users"
ON account_users
FOR SELECT
TO authenticated
USING (
  -- Can read if you're the owner
  user_id = auth.uid() OR
  -- Can read if you're a member of this account
  email = (SELECT email FROM auth.users WHERE id = auth.uid())
);

CREATE POLICY "Users can manage account users"
ON account_users
FOR ALL
TO authenticated
USING (
  -- Only account owners can manage users
  user_id = auth.uid()
)
WITH CHECK (
  -- Only account owners can manage users
  user_id = auth.uid()
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_account_users_email ON account_users(email);
CREATE INDEX IF NOT EXISTS idx_account_users_user_id ON account_users(user_id);