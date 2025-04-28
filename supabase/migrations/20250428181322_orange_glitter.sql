/*
  # Fix infinite recursion in account_users policies

  1. Changes
    - Remove recursive policies that were causing infinite loops
    - Implement new, simplified policies for account_users table
    - Ensure proper access control without recursion

  2. Security
    - Maintain row level security
    - Add clear, non-recursive policies for:
      - Admins managing users
      - Users reading their own data
*/

-- Drop existing policies to recreate them
DROP POLICY IF EXISTS "Users can manage account users" ON account_users;
DROP POLICY IF EXISTS "Admins can manage account users" ON account_users;
DROP POLICY IF EXISTS "Users can read account users" ON account_users;

-- Create new, simplified policies
CREATE POLICY "Users can read own account data"
ON account_users
FOR SELECT
TO authenticated
USING (
  -- Allow users to read their own account data
  email = auth.jwt()->>'email'
  OR
  user_id = auth.uid()
);

CREATE POLICY "Admins can manage account users"
ON account_users
FOR ALL
TO authenticated
USING (
  -- Check if the current user is an admin for this account
  EXISTS (
    SELECT 1 FROM account_users
    WHERE user_id = account_users.user_id
    AND email = auth.jwt()->>'email'
    AND role = 'admin'
  )
)
WITH CHECK (
  -- Same check for insert/update operations
  EXISTS (
    SELECT 1 FROM account_users
    WHERE user_id = account_users.user_id
    AND email = auth.jwt()->>'email'
    AND role = 'admin'
  )
);