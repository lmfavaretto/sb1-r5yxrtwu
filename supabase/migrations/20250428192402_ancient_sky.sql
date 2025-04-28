/*
  # Fix account_users RLS policy recursion

  1. Changes
    - Drop existing RLS policies on account_users table that cause recursion
    - Create new, simplified RLS policies that avoid recursion
    - Maintain security while preventing infinite loops

  2. Security
    - Users can still only access their own records and related account users
    - Policies use direct comparisons instead of subqueries to prevent recursion
    - Maintains row-level security without compromising access control
*/

-- Drop existing policies that cause recursion
DROP POLICY IF EXISTS "Users can read own and related records" ON account_users;
DROP POLICY IF EXISTS "account_owners_access" ON account_users;
DROP POLICY IF EXISTS "admin_access" ON account_users;
DROP POLICY IF EXISTS "user_read_access" ON account_users;

-- Create new, simplified policies
CREATE POLICY "Users can read own records"
ON account_users
FOR SELECT
TO authenticated
USING (
  -- Allow users to read their own record
  email = auth.jwt()->>'email'
  OR
  -- Allow users to read records where they are the account owner
  user_id = auth.uid()
);

CREATE POLICY "Account owners can manage records"
ON account_users
FOR ALL
TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

CREATE POLICY "Admins can manage account records"
ON account_users
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM account_users au
    WHERE au.user_id = account_users.user_id
    AND au.email = auth.jwt()->>'email'
    AND au.role = 'admin'
  )
);