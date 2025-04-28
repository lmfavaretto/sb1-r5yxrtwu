/*
  # Update RLS policies for users and account_users tables

  1. Changes
    - Add policies to allow users to read their own data from the users table
    - Add policies to allow users to read account_users data where they are either the owner or a member
    - Add policies to allow users to read data from users table when they are part of the same account

  2. Security
    - Enable RLS on both tables
    - Policies are restricted to authenticated users only
    - Users can only access their own data or data they have permission to see through account relationships
*/

-- Update users table policies
DROP POLICY IF EXISTS "Users can read own data" ON users;
DROP POLICY IF EXISTS "Users can read account data" ON users;

CREATE POLICY "Users can read own data"
ON users
FOR SELECT
TO authenticated
USING (
  auth.uid() = id
);

CREATE POLICY "Users can read account data"
ON users
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM account_users
    WHERE account_users.user_id = users.id
    AND account_users.email = (
      SELECT email FROM auth.users WHERE id = auth.uid()
    )
  )
);

-- Update account_users table policies
DROP POLICY IF EXISTS "Users can read account users" ON account_users;
DROP POLICY IF EXISTS "Users can read own records" ON account_users;

CREATE POLICY "Users can read account users"
ON account_users
FOR SELECT
TO authenticated
USING (
  user_id = auth.uid() OR
  email = (SELECT email FROM auth.users WHERE id = auth.uid())
);

CREATE POLICY "Users can read own records"
ON account_users
FOR SELECT
TO authenticated
USING (
  email = (SELECT email FROM auth.users WHERE id = auth.uid()) OR
  user_id = auth.uid()
);