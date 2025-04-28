-- Drop existing policies and triggers
DROP POLICY IF EXISTS "Account owners can manage their users" ON account_users;
DROP TRIGGER IF EXISTS enforce_users_limit ON account_users;
DROP FUNCTION IF EXISTS check_account_users_limit();

-- Create improved function to check user limit
CREATE OR REPLACE FUNCTION check_account_users_limit()
RETURNS TRIGGER AS $$
DECLARE
  current_count INTEGER;
BEGIN
  -- Get current count of users for this account (excluding the owner)
  SELECT COUNT(*)
  INTO current_count
  FROM account_users
  WHERE user_id = NEW.user_id;

  -- Check if adding this user would exceed the limit
  IF current_count >= 2 THEN
    RAISE EXCEPTION 'Limite máximo de 2 usuários atingido.';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for user limit
CREATE TRIGGER enforce_users_limit
  BEFORE INSERT ON account_users
  FOR EACH ROW
  EXECUTE FUNCTION check_account_users_limit();

-- Create new policy with proper checks
CREATE POLICY "Account owners can manage their users"
ON account_users
FOR ALL
TO authenticated
USING (
  -- For SELECT/DELETE: User can access rows where they are the owner
  auth.uid() = user_id OR 
  auth.uid() IN (
    SELECT au.email::uuid 
    FROM account_users au 
    WHERE au.user_id = account_users.user_id
  )
)
WITH CHECK (
  -- For INSERT/UPDATE: User can only insert/update rows where they are the owner
  auth.uid() = user_id
);

-- Create unique email constraint
ALTER TABLE account_users
DROP CONSTRAINT IF EXISTS account_users_email_key,
ADD CONSTRAINT account_users_email_key UNIQUE (email);

-- Create index for better performance
CREATE INDEX IF NOT EXISTS account_users_user_id_email_idx ON account_users(user_id, email);