-- Drop existing policies that are causing recursion
DROP POLICY IF EXISTS "Account owners can manage their users" ON account_users;
DROP POLICY IF EXISTS "Users can read accounts they belong to" ON account_users;
DROP POLICY IF EXISTS "Admins can manage account records" ON account_users;

-- Create new simplified policies
CREATE POLICY "Users can read own data"
ON account_users
FOR SELECT
TO authenticated
USING (
  -- User can read their own record
  email = auth.jwt()->>'email'
  OR
  -- User can read records where they are the owner
  user_id = auth.uid()
);

CREATE POLICY "Users can insert own data"
ON account_users
FOR INSERT
TO authenticated
WITH CHECK (
  -- Only account owners can insert new users
  user_id = auth.uid()
);

CREATE POLICY "Users can update own data"
ON account_users
FOR UPDATE
TO authenticated
USING (
  -- Only account owners can update users
  user_id = auth.uid()
)
WITH CHECK (
  user_id = auth.uid()
);

CREATE POLICY "Users can delete own data"
ON account_users
FOR DELETE
TO authenticated
USING (
  -- Only account owners can delete users
  user_id = auth.uid()
);

-- Create indexes for better performance if they don't exist
CREATE INDEX IF NOT EXISTS idx_account_users_email ON account_users(email);
CREATE INDEX IF NOT EXISTS idx_account_users_user_id ON account_users(user_id);

-- Update users table policies
DROP POLICY IF EXISTS "Users can read own and related records" ON users;

CREATE POLICY "Users can read own data"
ON users
FOR SELECT
TO authenticated
USING (
  -- User can read their own data
  id = auth.uid()
  OR
  -- User can read data of the account owner
  id IN (
    SELECT user_id 
    FROM account_users 
    WHERE email = auth.jwt()->>'email'
  )
);