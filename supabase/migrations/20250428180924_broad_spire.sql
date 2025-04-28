-- Create or replace the check_same_account function
CREATE OR REPLACE FUNCTION check_same_account(target_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_role text;
  v_user_parent_id uuid;
BEGIN
  -- Direct match (user is accessing their own data)
  IF target_user_id = auth.uid() THEN
    RETURN true;
  END IF;

  -- Get current user's role and parent_user_id from account_users
  SELECT role, user_id INTO v_user_role, v_user_parent_id
  FROM account_users
  WHERE email = (SELECT email FROM auth.users WHERE id = auth.uid())
  LIMIT 1;

  -- If user is accessing their parent's data (they were created by this user)
  IF v_user_parent_id = target_user_id THEN
    RETURN true;
  END IF;

  -- If user is admin, they can access data from the same account
  IF v_user_role = 'admin' THEN
    RETURN EXISTS (
      SELECT 1
      FROM account_users au1
      WHERE au1.user_id = target_user_id
      AND au1.user_id = v_user_parent_id
    );
  END IF;

  RETURN false;
END;
$$;

-- Update users table policies
DROP POLICY IF EXISTS "Users can read own data" ON users;
DROP POLICY IF EXISTS "Users can update own data" ON users;

CREATE POLICY "Users can read account data"
ON users
FOR SELECT
TO authenticated
USING (
  id = auth.uid() OR
  id IN (
    SELECT user_id FROM account_users 
    WHERE email = (SELECT email FROM auth.users WHERE id = auth.uid())
  )
);

CREATE POLICY "Users can update own data"
ON users
FOR UPDATE
TO authenticated
USING (id = auth.uid())
WITH CHECK (id = auth.uid());

-- Update account_users policies
DROP POLICY IF EXISTS "Users can manage own account users" ON account_users;
DROP POLICY IF EXISTS "Users can read own account users" ON account_users;

CREATE POLICY "Users can read account users"
ON account_users
FOR SELECT
TO authenticated
USING (
  -- Can read if you're the owner
  user_id = auth.uid() OR
  -- Or if you belong to this account
  user_id = (
    SELECT user_id FROM account_users 
    WHERE email = (SELECT email FROM auth.users WHERE id = auth.uid())
  )
);

CREATE POLICY "Admins can manage account users"
ON account_users
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM account_users
    WHERE email = (SELECT email FROM auth.users WHERE id = auth.uid())
    AND role = 'admin'
    AND user_id = account_users.user_id
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM account_users
    WHERE email = (SELECT email FROM auth.users WHERE id = auth.uid())
    AND role = 'admin'
    AND user_id = account_users.user_id
  )
);

-- Create function to copy user data to new users
CREATE OR REPLACE FUNCTION copy_user_data()
RETURNS trigger AS $$
DECLARE
  v_parent_user_data users%ROWTYPE;
BEGIN
  -- Get parent user data
  SELECT * INTO v_parent_user_data
  FROM users
  WHERE id = NEW.user_id;

  -- Update the new user's data
  UPDATE users
  SET
    business_name = v_parent_user_data.business_name,
    logo_url = v_parent_user_data.logo_url
  WHERE id = (
    SELECT id FROM auth.users WHERE email = NEW.email
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to copy user data
DROP TRIGGER IF EXISTS copy_user_data_trigger ON account_users;
CREATE TRIGGER copy_user_data_trigger
  AFTER INSERT ON account_users
  FOR EACH ROW
  EXECUTE FUNCTION copy_user_data();