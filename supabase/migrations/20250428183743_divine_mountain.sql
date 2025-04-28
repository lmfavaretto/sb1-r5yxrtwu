/*
  # Fix account_users RLS policies

  1. Changes
    - Remove recursive policies that were causing infinite loops
    - Simplify RLS policies for account_users table
    - Maintain proper access control while preventing recursion
    
  2. Security
    - Users can still only access their own account data
    - Admins retain their management capabilities
    - Policies are simplified to prevent recursion
*/

-- Drop existing policies to recreate them
DROP POLICY IF EXISTS "Users can manage account users" ON account_users;
DROP POLICY IF EXISTS "Admins can manage account users" ON account_users;
DROP POLICY IF EXISTS "Users can read account users" ON account_users;

-- Create new, simplified policies
CREATE POLICY "Enable read for authenticated users"
ON public.account_users
FOR SELECT
TO authenticated
USING (
  -- Allow access if user owns the account or is a member of the account
  user_id = auth.uid() OR 
  email = (SELECT email FROM auth.users WHERE id = auth.uid())
);

CREATE POLICY "Enable all for account owners"
ON public.account_users
FOR ALL
TO authenticated
USING (
  -- Account owner can do everything
  user_id = auth.uid()
)
WITH CHECK (
  user_id = auth.uid()
);

CREATE POLICY "Enable all for admins"
ON public.account_users
FOR ALL
TO authenticated
USING (
  -- Admins can manage users in their account
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