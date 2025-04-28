/*
  # Fix infinite recursion in account_users policies

  1. Changes
    - Drop existing policies that cause recursion
    - Create new simplified policies
    - Add proper indexes for performance
    - Fix circular dependencies in policy definitions

  2. Security
    - Maintain proper access control
    - Prevent unauthorized access
    - Keep data isolation between accounts
*/

-- Drop existing policies
DROP POLICY IF EXISTS "Users can read own data" ON users;
DROP POLICY IF EXISTS "Users can read own account data" ON account_users;
DROP POLICY IF EXISTS "Users can manage own account users" ON account_users;
DROP POLICY IF EXISTS "Admins can manage records" ON account_users;
DROP POLICY IF EXISTS "Users can read account records" ON account_users;

-- Create new policy for users table
CREATE POLICY "Users can read own data"
ON users
FOR SELECT
TO authenticated
USING (
  id = auth.uid() OR
  id IN (
    SELECT user_id
    FROM account_users
    WHERE email = (SELECT email FROM auth.users WHERE id = auth.uid())
  )
);

-- Create new policies for account_users table
CREATE POLICY "Users can read account users"
ON account_users
FOR SELECT
TO authenticated
USING (
  -- User can read their own account users
  user_id = auth.uid() OR
  -- User can read account users where they are a member
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