/*
  # Add RLS policies for users table

  1. Security Changes
    - Enable RLS on users table
    - Add policy for authenticated users to insert their own record
    - Add policy for authenticated users to read their own record
    - Add policy for authenticated users to update their own record

  2. Notes
    - Policies ensure users can only manage their own records
    - Insert policy validates that new records match the authenticated user's ID
*/

-- Enable RLS
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Users can insert their own record"
  ON users
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can read own record"
  ON users
  FOR SELECT
  TO authenticated
  USING (auth.uid() = id);

CREATE POLICY "Users can update own record"
  ON users
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);