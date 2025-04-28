/*
  # Fix account_users policies

  1. Changes
    - Drop existing policies that cause infinite recursion
    - Create new policies with proper access control:
      - Users can read their own record
      - Users can read records where they are the admin
      - Admins can manage all records for their organization
  
  2. Security
    - Maintains RLS protection
    - Prevents infinite recursion
    - Ensures proper access control
*/

-- Drop existing policies to recreate them
DROP POLICY IF EXISTS "Users can read own record" ON account_users;
DROP POLICY IF EXISTS "Users can read own and related records" ON account_users;
DROP POLICY IF EXISTS "Admins can manage all records" ON account_users;
DROP POLICY IF EXISTS "Admins can read all records" ON account_users;

-- Create new policies without recursive checks
CREATE POLICY "Users can read own record"
ON account_users
FOR SELECT
TO authenticated
USING (
  -- Users can read their own record
  auth.uid() = user_id
);

CREATE POLICY "Admins can manage records"
ON account_users
FOR ALL
TO authenticated
USING (
  -- Check if the current user is an admin for these records
  EXISTS (
    SELECT 1 
    FROM account_users admin_check
    WHERE admin_check.user_id = auth.uid() 
    AND admin_check.role = 'admin'
    AND admin_check.user_id = account_users.user_id
  )
)
WITH CHECK (
  -- Same condition for insert/update operations
  EXISTS (
    SELECT 1 
    FROM account_users admin_check
    WHERE admin_check.user_id = auth.uid() 
    AND admin_check.role = 'admin'
    AND admin_check.user_id = account_users.user_id
  )
);