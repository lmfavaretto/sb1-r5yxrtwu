-- Drop existing policies
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

-- Create function to cleanup orphaned account users
CREATE OR REPLACE FUNCTION cleanup_orphaned_account_users()
RETURNS TRIGGER AS $$
BEGIN
  -- Delete any orphaned account_users entries
  DELETE FROM account_users
  WHERE email = NEW.email
  AND created_at < NOW() - interval '5 minutes'
  AND NOT EXISTS (
    SELECT 1 FROM auth.users
    WHERE auth.users.email = account_users.email
  );
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for cleanup
DROP TRIGGER IF EXISTS cleanup_orphaned_account_users_trigger ON account_users;
CREATE TRIGGER cleanup_orphaned_account_users_trigger
  BEFORE INSERT ON account_users
  FOR EACH ROW
  EXECUTE FUNCTION cleanup_orphaned_account_users();

-- Create index for better performance
CREATE INDEX IF NOT EXISTS account_users_user_id_idx ON account_users(user_id);