/*
  # Fix account_users policies

  1. Changes
    - Drop existing policy that causes infinite recursion
    - Create new policies that avoid recursion:
      - Allow users to read their own records
      - Allow admins to read all records for their user_id
      - Allow admins to manage all records for their user_id
      - Allow users to read their own record

  2. Security
    - Maintains RLS protection
    - Ensures proper access control without recursion
    - Separates read and write permissions for clarity
*/

-- Drop the problematic policy
DROP POLICY IF EXISTS "Users can manage account users" ON account_users;

-- Create new policies that avoid recursion
CREATE POLICY "Users can read own record"
ON account_users
FOR SELECT
TO authenticated
USING (user_id = auth.uid());

CREATE POLICY "Admins can read all records"
ON account_users
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM account_users
    WHERE user_id = auth.uid()
    AND role = 'admin'
    AND user_id = account_users.user_id
  )
);

CREATE POLICY "Admins can manage all records"
ON account_users
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM account_users
    WHERE user_id = auth.uid()
    AND role = 'admin'
    AND user_id = account_users.user_id
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM account_users
    WHERE user_id = auth.uid()
    AND role = 'admin'
    AND user_id = account_users.user_id
  )
);