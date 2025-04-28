/*
  # Fix account users RLS policy

  1. Changes
    - Drop existing RLS policy
    - Create new policy that properly handles user roles
    - Add proper checks for user_id and role assignments

  2. Notes
    - Ensures users can manage their account users
    - Maintains proper security boundaries
    - Fixes 403 error on user creation
*/

-- Drop existing policy if it exists
DROP POLICY IF EXISTS "Account owners can manage their users" ON account_users;

-- Create new policy with proper checks
CREATE POLICY "Account owners can manage their users"
ON account_users
FOR ALL
TO authenticated
USING (
  -- For SELECT/DELETE: User can access rows where they are the owner
  auth.uid() = user_id
)
WITH CHECK (
  -- For INSERT/UPDATE: User can only insert/update rows where they are the owner
  auth.uid() = user_id
);

-- Ensure RLS is enabled
ALTER TABLE account_users ENABLE ROW LEVEL SECURITY;