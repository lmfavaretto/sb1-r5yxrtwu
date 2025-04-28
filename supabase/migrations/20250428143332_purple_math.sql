-- Drop existing policies
DROP POLICY IF EXISTS "Users can manage own account users" ON account_users;
DROP POLICY IF EXISTS "Users can read own account users" ON account_users;

-- Remove password column if it exists
ALTER TABLE account_users DROP COLUMN IF EXISTS password;

-- Create new policies
CREATE POLICY "Users can manage own account users"
ON account_users
FOR ALL
TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can read own account users"
ON account_users
FOR SELECT
TO authenticated
USING (user_id = auth.uid());

-- Create index for better performance
CREATE INDEX IF NOT EXISTS account_users_user_id_idx ON account_users(user_id);