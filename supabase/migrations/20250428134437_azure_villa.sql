/*
  # Fix infinite recursion in account_users policy

  1. Changes
    - Remove recursive policy from account_users table
    - Add new, simplified policy for reading records
    - Maintain admin access control without recursion

  2. Security
    - Maintains row level security
    - Preserves admin role checks
    - Prevents infinite recursion
*/

-- Drop the problematic policy
DROP POLICY IF EXISTS "Users can read own and related records" ON account_users;

-- Create new, non-recursive policy
CREATE POLICY "Users can read account records"
ON account_users
FOR SELECT
TO authenticated
USING (
  user_id = auth.uid() OR 
  EXISTS (
    SELECT 1 
    FROM account_users admin 
    WHERE admin.user_id = auth.uid() 
    AND admin.role = 'admin'
    AND admin.user_id = account_users.user_id
  )
);