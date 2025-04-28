-- Drop existing policies first to avoid conflicts
DROP POLICY IF EXISTS "Users can read own and parent data" ON users;
DROP POLICY IF EXISTS "Users can read account users" ON account_users;
DROP POLICY IF EXISTS "Users can manage account users" ON account_users;

-- Create new policies for users table
CREATE POLICY "Users can read own and parent data"
ON users
FOR SELECT
TO authenticated
USING (
  id = auth.uid() OR
  EXISTS (
    SELECT 1 FROM account_users
    WHERE account_users.email = auth.jwt()->>'email'
    AND account_users.user_id = users.id
  )
);

-- Create new policies for account_users table
CREATE POLICY "Users can read account users"
ON account_users
FOR SELECT
TO authenticated
USING (
  user_id = auth.uid() OR
  email = auth.jwt()->>'email'
);

CREATE POLICY "Users can manage account users"
ON account_users
FOR ALL
TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

-- Create function to copy user data
CREATE OR REPLACE FUNCTION copy_user_data()
RETURNS TRIGGER AS $$
BEGIN
  -- Get parent user data and update the auth user metadata
  PERFORM auth.set_user_metadata(
    (SELECT id FROM auth.users WHERE email = NEW.email),
    jsonb_build_object(
      'name', NEW.name,
      'parent_user_id', NEW.user_id
    )
  );
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for copying user data
DROP TRIGGER IF EXISTS copy_user_data_trigger ON account_users;
CREATE TRIGGER copy_user_data_trigger
  AFTER INSERT ON account_users
  FOR EACH ROW
  EXECUTE FUNCTION copy_user_data();

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_account_users_email ON account_users(email);
CREATE INDEX IF NOT EXISTS idx_account_users_user_id ON account_users(user_id);