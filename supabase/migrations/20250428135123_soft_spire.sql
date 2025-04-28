/*
  # Fix RLS policies to prevent infinite recursion

  1. Changes
    - Drop existing policies that cause recursion
    - Create new policies with proper checks
    - Add performance optimizations
    - Fix circular dependencies in policy definitions

  2. Security
    - Maintain proper access control
    - Prevent unauthorized access
    - Keep data isolation between users
*/

-- Drop existing policies
DO $$ 
BEGIN
  -- Drop policies if they exist
  IF EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can read own data' AND tablename = 'users') THEN
    DROP POLICY "Users can read own data" ON users;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can update own data' AND tablename = 'users') THEN
    DROP POLICY "Users can update own data" ON users;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can read own account users' AND tablename = 'account_users') THEN
    DROP POLICY "Users can read own account users" ON account_users;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can manage own account users' AND tablename = 'account_users') THEN
    DROP POLICY "Users can manage own account users" ON account_users;
  END IF;
END $$;

-- Create policies for users table
CREATE POLICY "Users can read own data"
ON users
FOR SELECT
TO authenticated
USING (id = auth.uid());

CREATE POLICY "Users can update own data"
ON users
FOR UPDATE
TO authenticated
USING (id = auth.uid())
WITH CHECK (id = auth.uid());

-- Create non-recursive policies for account_users
CREATE POLICY "Users can read own account users"
ON account_users
FOR SELECT
TO authenticated
USING (user_id = auth.uid());

CREATE POLICY "Users can manage own account users"
ON account_users
FOR ALL
TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

-- Create index for better performance
CREATE INDEX IF NOT EXISTS account_users_user_id_idx ON account_users(user_id);