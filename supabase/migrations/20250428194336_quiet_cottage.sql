-- Drop existing policies
DROP POLICY IF EXISTS "Users can read own data" ON account_users;
DROP POLICY IF EXISTS "Users can insert own data" ON account_users;
DROP POLICY IF EXISTS "Users can update own data" ON account_users;
DROP POLICY IF EXISTS "Users can delete own data" ON account_users;
DROP POLICY IF EXISTS "Users can read own data" ON users;
DROP POLICY IF EXISTS "Users can read own records" ON users;
DROP POLICY IF EXISTS "Users can update own record" ON users;
DROP POLICY IF EXISTS "Users can select account users" ON account_users;
DROP POLICY IF EXISTS "Users can manage account users" ON account_users;

-- Create new policies for users table
CREATE POLICY "Users can read own records"
ON users
FOR SELECT
TO authenticated
USING (
  id = auth.uid() OR
  id IN (
    SELECT user_id 
    FROM account_users 
    WHERE email = auth.jwt()->>'email'
  )
);

-- Create new policies for account_users table
CREATE POLICY "Users can select account users"
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
  -- Get parent user data
  UPDATE users
  SET
    business_name = (SELECT business_name FROM users WHERE id = NEW.user_id),
    logo_url = (SELECT logo_url FROM users WHERE id = NEW.user_id)
  WHERE email = NEW.email;
  
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