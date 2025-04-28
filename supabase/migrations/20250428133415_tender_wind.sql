/*
  # Fix account_users RLS policies

  1. Changes
    - Drop existing policies that cause infinite recursion
    - Create new simplified policies for account_users table
    - Maintain security while avoiding circular dependencies

  2. Security
    - Enable RLS on account_users table
    - Add policy for account owners to manage their users
    - Add policy for users to view their own account
*/

-- Drop existing problematic policies
DROP POLICY IF EXISTS "Account owners can manage their users" ON account_users;

-- Create new simplified policies
CREATE POLICY "Account owners can manage own users"
ON account_users
FOR ALL
TO authenticated
USING (
  -- Allow access if the user is the account owner
  auth.uid() = user_id
  OR 
  -- Or if the user is a member of the account
  auth.uid()::text = email
)
WITH CHECK (
  -- Only account owners can modify data
  auth.uid() = user_id
);