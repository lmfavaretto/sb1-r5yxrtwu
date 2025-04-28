-- Add password field to account_users table
ALTER TABLE account_users
ADD COLUMN IF NOT EXISTS password text;

-- Update existing policies
DROP POLICY IF EXISTS "Users can manage own account users" ON account_users;
DROP POLICY IF EXISTS "Users can read own account users" ON account_users;

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