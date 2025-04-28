-- Drop existing policies and constraints
DROP POLICY IF EXISTS "Account owners can manage own users" ON account_users;
DROP POLICY IF EXISTS "Account owners can manage their users" ON account_users;

-- Create new policies with proper access control
CREATE POLICY "Users can manage own users"
ON account_users
FOR ALL
TO authenticated
USING (
  -- For SELECT/DELETE: User can access if they are the owner or a member
  auth.uid() = user_id OR 
  EXISTS (
    SELECT 1 FROM auth.users 
    WHERE id = auth.uid() 
    AND raw_user_meta_data->>'parent_user_id' = user_id::text
  )
)
WITH CHECK (
  -- For INSERT/UPDATE: Only account owners can modify
  auth.uid() = user_id
);

-- Create unique index for email
CREATE UNIQUE INDEX IF NOT EXISTS account_users_user_id_email_idx 
ON account_users(user_id, email);

-- Create function to clean up orphaned entries
CREATE OR REPLACE FUNCTION cleanup_orphaned_account_users()
RETURNS trigger AS $$
BEGIN
  -- If insert fails, cleanup any orphaned entries
  DELETE FROM account_users
  WHERE email = NEW.email
  AND created_at < NOW() - interval '5 minutes';
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for cleanup
DROP TRIGGER IF EXISTS cleanup_orphaned_account_users_trigger ON account_users;
CREATE TRIGGER cleanup_orphaned_account_users_trigger
  BEFORE INSERT ON account_users
  FOR EACH ROW
  EXECUTE FUNCTION cleanup_orphaned_account_users();