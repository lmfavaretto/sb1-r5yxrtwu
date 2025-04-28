-- Drop existing policies
DROP POLICY IF EXISTS "Users can read own and parent data" ON users;
DROP POLICY IF EXISTS "Users can read account users" ON account_users;
DROP POLICY IF EXISTS "Users can manage account users" ON account_users;

-- Create simplified policies for users table
CREATE POLICY "Users can read own and parent data"
ON users
FOR SELECT
TO authenticated
USING (
  id = auth.uid() OR
  id = (
    SELECT user_id FROM account_users
    WHERE email = (SELECT email FROM auth.users WHERE id = auth.uid())
  )
);

-- Create simplified policies for account_users table
CREATE POLICY "Users can read account users"
ON account_users
FOR SELECT
TO authenticated
USING (
  user_id = auth.uid() OR
  email = (SELECT email FROM auth.users WHERE id = auth.uid())
);

CREATE POLICY "Users can manage account users"
ON account_users
FOR ALL
TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

-- Create function to update user metadata
CREATE OR REPLACE FUNCTION update_user_metadata()
RETURNS TRIGGER AS $$
BEGIN
  -- Update auth.users raw_user_meta_data directly
  UPDATE auth.users
  SET raw_user_meta_data = jsonb_build_object(
    'name', NEW.name,
    'role', NEW.role,
    'parent_user_id', NEW.user_id
  )
  WHERE email = NEW.email;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger for updating user metadata
DROP TRIGGER IF EXISTS update_user_metadata_trigger ON account_users;
CREATE TRIGGER update_user_metadata_trigger
  AFTER INSERT ON account_users
  FOR EACH ROW
  EXECUTE FUNCTION update_user_metadata();

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_account_users_email ON account_users(email);
CREATE INDEX IF NOT EXISTS idx_account_users_user_id ON account_users(user_id);