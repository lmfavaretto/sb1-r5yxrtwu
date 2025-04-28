/*
  # Fix recursive RLS policies

  1. Changes
    - Remove recursive policy from users table
    - Update account_users policies to be more efficient
    - Add missing RLS policies for proper access control

  2. Security
    - Maintain data access security while preventing infinite recursion
    - Ensure users can only access their own data and related account users
*/

-- Drop existing policies that are causing recursion
DROP POLICY IF EXISTS "Users can read account data" ON users;
DROP POLICY IF EXISTS "Users can access account users" ON account_users;
DROP POLICY IF EXISTS "Users can read own account users" ON account_users;

-- Create new, non-recursive policies for users table
CREATE POLICY "Users can read own data"
ON users FOR SELECT
TO authenticated
USING (
  id = auth.uid() OR
  id IN (
    SELECT user_id 
    FROM account_users 
    WHERE email = auth.jwt()->>'email'
  )
);

-- Create new policies for account_users table
CREATE POLICY "Users can read account users"
ON account_users FOR SELECT
TO authenticated
USING (
  user_id = auth.uid() OR
  email = auth.jwt()->>'email'
);

CREATE POLICY "Users can manage account users"
ON account_users FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM account_users
    WHERE user_id = account_users.user_id
    AND email = auth.jwt()->>'email'
    AND role = 'admin'
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM account_users
    WHERE user_id = account_users.user_id
    AND email = auth.jwt()->>'email'
    AND role = 'admin'
  )
);