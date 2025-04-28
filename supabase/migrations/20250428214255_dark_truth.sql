-- Drop existing policies
DROP POLICY IF EXISTS "Users can read own data" ON users;
DROP POLICY IF EXISTS "Users can read account data" ON users;
DROP POLICY IF EXISTS "Users can read account users" ON account_users;
DROP POLICY IF EXISTS "Users can read own records" ON account_users;
DROP POLICY IF EXISTS "Users can manage account users" ON account_users;

-- Create simplified policy for users table
CREATE POLICY "Users can read own data"
ON users
FOR SELECT
TO authenticated
USING (
  -- User can read their own data
  id = auth.uid()
);

-- Create simplified policy for account_users table
CREATE POLICY "Users can read account users"
ON account_users
FOR SELECT
TO authenticated
USING (
  -- User can read their own account users
  user_id = auth.uid()
);

-- Create policy for managing account users
CREATE POLICY "Users can manage account users v2"
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

-- Grant necessary permissions
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT ALL ON public.users TO authenticated;
GRANT ALL ON public.account_users TO authenticated;