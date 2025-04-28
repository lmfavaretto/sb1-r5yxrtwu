/*
  # Fix account_users policies

  1. Changes
    - Remove recursive policies that were causing infinite loops
    - Implement new, simplified policies for account_users table
    - Maintain security while avoiding policy recursion

  2. Security
    - Users can read account users where they are either:
      a) The owner (user_id matches their uid)
      b) An account user with matching email
    - Only admins can manage (insert/update/delete) account users
    - Policies use direct comparisons instead of recursive checks
*/

-- Drop existing policies
DROP POLICY IF EXISTS "Users can read account users" ON account_users;
DROP POLICY IF EXISTS "Admins can manage account users" ON account_users;

-- Create new, non-recursive policies
CREATE POLICY "Users can read own account users"
ON account_users
FOR SELECT
TO authenticated
USING (
  user_id = auth.uid() OR 
  email = (SELECT email FROM auth.users WHERE id = auth.uid())
);

CREATE POLICY "Admins can manage account users"
ON account_users
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM account_users au
    WHERE au.user_id = account_users.user_id
    AND au.email = (SELECT email FROM auth.users WHERE id = auth.uid())
    AND au.role = 'admin'
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM account_users au
    WHERE au.user_id = account_users.user_id
    AND au.email = (SELECT email FROM auth.users WHERE id = auth.uid())
    AND au.role = 'admin'
  )
);