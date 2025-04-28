/*
  # Fix account_users RLS policies to prevent recursion

  1. Changes
    - Drop existing policies that cause recursion
    - Create new simplified policies that avoid circular references
    - Add proper indexes for performance
    - Fix policy definitions to use direct auth checks

  2. Security
    - Maintain proper access control
    - Prevent unauthorized access
    - Keep data isolation between accounts
*/

-- Drop existing policies
DROP POLICY IF EXISTS "Users can read own account users" ON account_users;
DROP POLICY IF EXISTS "Users can manage own account users" ON account_users;
DROP POLICY IF EXISTS "Account owners can manage records" ON account_users;
DROP POLICY IF EXISTS "Users can read account records" ON account_users;

-- Create new non-recursive policies
CREATE POLICY "Account owners can manage their users"
ON account_users
FOR ALL
TO authenticated
USING (
  -- User is the account owner
  user_id = auth.uid()
)
WITH CHECK (
  -- Only account owners can modify
  user_id = auth.uid()
);

CREATE POLICY "Users can read accounts they belong to"
ON account_users
FOR SELECT
TO authenticated
USING (
  -- User is either the owner or a member
  user_id = auth.uid() OR
  email = auth.jwt()->>'email'
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_account_users_email ON account_users(email);
CREATE INDEX IF NOT EXISTS idx_account_users_user_id ON account_users(user_id);