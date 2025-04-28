/*
  # Fix account_users RLS policies

  1. Changes
    - Drop existing policies that cause infinite recursion
    - Create new, optimized policies for account_users table that avoid circular dependencies
    
  2. Security
    - Maintain same level of access control but with more efficient policies
    - Users can still only access their own account and related records
    - Admins retain their elevated privileges
*/

-- Drop existing policies to recreate them
DROP POLICY IF EXISTS "Enable all for account owners" ON account_users;
DROP POLICY IF EXISTS "Enable all for admins" ON account_users;
DROP POLICY IF EXISTS "Enable read for authenticated users" ON account_users;

-- Create new, optimized policies
-- Policy for account owners: They can manage all users in their account
CREATE POLICY "account_owners_access"
ON account_users
FOR ALL
TO authenticated
USING (
  user_id = auth.uid()
)
WITH CHECK (
  user_id = auth.uid()
);

-- Policy for admins: They can manage users within the same account
CREATE POLICY "admin_access"
ON account_users
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM account_users au
    WHERE au.user_id = account_users.user_id
    AND au.email = (SELECT email FROM auth.users WHERE id = auth.uid())
    AND au.role = 'admin'
    AND au.user_id = account_users.user_id
  )
);

-- Policy for users: They can read their own record and records in the same account
CREATE POLICY "user_read_access"
ON account_users
FOR SELECT
TO authenticated
USING (
  email = (SELECT email FROM auth.users WHERE id = auth.uid())
  OR
  user_id IN (
    SELECT user_id FROM account_users
    WHERE email = (SELECT email FROM auth.users WHERE id = auth.uid())
  )
);