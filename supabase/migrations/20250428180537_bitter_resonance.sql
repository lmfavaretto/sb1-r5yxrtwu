/*
  # Update check_same_account function

  1. Changes
    - Update check_same_account function to use account_users table
    - Add proper indexes for performance
    - Fix access control for shared accounts
    - Maintain existing function dependencies

  2. Notes
    - Does not drop function to preserve policy dependencies
    - Uses CREATE OR REPLACE to update function safely
    - Adds performance optimizations
*/

-- Update the function without dropping it
CREATE OR REPLACE FUNCTION check_same_account(target_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Direct match (user is accessing their own data)
  IF target_user_id = auth.uid() THEN
    RETURN true;
  END IF;

  -- Check if current user is in the same account through account_users table
  RETURN EXISTS (
    SELECT 1
    FROM account_users au1
    JOIN account_users au2 ON au1.user_id = au2.user_id
    WHERE au1.email = (
      SELECT email 
      FROM auth.users 
      WHERE id = auth.uid()
    )
    AND au2.user_id = target_user_id
  );
END;
$$;

-- Revoke execute from public and grant only to authenticated users
REVOKE EXECUTE ON FUNCTION check_same_account(uuid) FROM public;
GRANT EXECUTE ON FUNCTION check_same_account(uuid) TO authenticated;

-- Create indexes to optimize the join if they don't exist
CREATE INDEX IF NOT EXISTS idx_account_users_email ON account_users(email);
CREATE INDEX IF NOT EXISTS idx_account_users_user_id ON account_users(user_id);