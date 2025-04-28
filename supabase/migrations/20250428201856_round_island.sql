-- Drop existing function and trigger
DROP TRIGGER IF EXISTS copy_user_data_trigger ON account_users;
DROP FUNCTION IF EXISTS copy_user_data();

-- Create new function that updates raw_user_meta_data directly
CREATE OR REPLACE FUNCTION copy_user_data()
RETURNS TRIGGER AS $$
BEGIN
  -- Update auth.users metadata directly
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

-- Recreate the trigger
CREATE TRIGGER copy_user_data_trigger
  AFTER INSERT ON account_users
  FOR EACH ROW
  EXECUTE FUNCTION copy_user_data();

-- Grant necessary permissions
GRANT UPDATE ON auth.users TO postgres;
GRANT USAGE ON SCHEMA auth TO postgres;