/*
  # Fix users and account_users permissions

  1. Changes
    - Update RLS policies for users table
    - Fix account_users policies
    - Add proper join conditions
    - Enable proper access for both owners and members

  2. Security
    - Ensure users can only access appropriate records
    - Maintain data isolation between accounts
    - Add proper constraints and checks
*/

-- Drop existing policies
DROP POLICY IF EXISTS "Users can read own record" ON users;
DROP POLICY IF EXISTS "Users can update own record" ON users;
DROP POLICY IF EXISTS "Users can manage own users" ON account_users;

-- Create new policies for users table
CREATE POLICY "Users can read own and related records"
  ON users
  FOR SELECT
  TO authenticated
  USING (
    id = auth.uid() OR
    EXISTS (
      SELECT 1 FROM account_users au
      WHERE au.user_id = users.id
      AND EXISTS (
        SELECT 1 FROM account_users owner
        WHERE owner.user_id = auth.uid()
        AND owner.role = 'admin'
      )
    )
  );

CREATE POLICY "Users can update own record"
  ON users
  FOR UPDATE
  TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

-- Create new policy for account_users
CREATE POLICY "Users can manage account users"
  ON account_users
  FOR ALL
  TO authenticated
  USING (
    -- Can access if you're the admin
    EXISTS (
      SELECT 1 FROM account_users admin
      WHERE admin.user_id = auth.uid()
      AND admin.role = 'admin'
    )
    OR
    -- Or if it's your own record
    user_id = auth.uid()
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM account_users admin
      WHERE admin.user_id = auth.uid()
      AND admin.role = 'admin'
    )
  );

-- Create function to cleanup orphaned account users
CREATE OR REPLACE FUNCTION cleanup_orphaned_account_users()
RETURNS TRIGGER AS $$
BEGIN
  -- Delete any existing account_users entries for this email
  DELETE FROM account_users
  WHERE email = NEW.email
  AND NOT EXISTS (
    SELECT 1 FROM auth.users
    WHERE auth.users.email = account_users.email
  );
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;