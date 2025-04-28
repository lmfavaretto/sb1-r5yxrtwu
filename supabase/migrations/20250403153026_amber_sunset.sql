/*
  # Fix Orders RLS Policy

  1. Changes
    - Drop existing RLS policies on orders table
    - Create new policy that allows inserting orders for customers owned by the user
    - Ensure policy uses EXISTS clause to check customer ownership

  2. Notes
    - Policy allows users to manage orders for their own customers
    - Uses customer_id to verify ownership through customers table
*/

-- Drop existing policies on orders table
DROP POLICY IF EXISTS "Users can manage orders for their customers" ON orders;

-- Create new policy for orders table
CREATE POLICY "Users can manage orders for their customers"
ON orders
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM customers
    WHERE customers.id = orders.customer_id
    AND customers.user_id = auth.uid()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM customers
    WHERE customers.id = orders.customer_id
    AND customers.user_id = auth.uid()
  )
);