/*
  # Fix RLS policies for shared account access

  1. Changes
    - Add RLS policies to allow users to access data within the same account
    - Use auth.users metadata to check parent_user_id relationship
    - Update policies for customers, orders, and other tables
    - Add helper function to check account relationship

  2. Security
    - Maintain proper data isolation between different accounts
    - Allow access only to users within the same account
    - Preserve admin/user role distinctions
*/

-- Create helper function to check if users are in the same account
CREATE OR REPLACE FUNCTION check_same_account(target_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN (
    -- User is the account owner
    target_user_id = auth.uid()
    OR
    -- User belongs to the account (check parent_user_id in metadata)
    (
      SELECT COALESCE(
        (raw_user_meta_data->>'parent_user_id')::uuid = target_user_id,
        false
      )
      FROM auth.users
      WHERE id = auth.uid()
    )
  );
END;
$$;

-- Update customers table policies
DROP POLICY IF EXISTS "Users can manage own customers" ON customers;
CREATE POLICY "Users can access account customers"
ON customers
FOR ALL
TO authenticated
USING (check_same_account(user_id))
WITH CHECK (check_same_account(user_id));

-- Update orders table policies
DROP POLICY IF EXISTS "Users can manage orders for their customers" ON orders;
CREATE POLICY "Users can access account orders"
ON orders
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM customers
    WHERE customers.id = orders.customer_id
    AND check_same_account(customers.user_id)
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM customers
    WHERE customers.id = orders.customer_id
    AND check_same_account(customers.user_id)
  )
);

-- Update order_items table policies
DROP POLICY IF EXISTS "Users can manage order items through orders" ON order_items;
CREATE POLICY "Users can access account order items"
ON order_items
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM orders
    JOIN customers ON customers.id = orders.customer_id
    WHERE orders.id = order_items.order_id
    AND check_same_account(customers.user_id)
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM orders
    JOIN customers ON customers.id = orders.customer_id
    WHERE orders.id = order_items.order_id
    AND check_same_account(customers.user_id)
  )
);

-- Update order_payments table policies
DROP POLICY IF EXISTS "Users can manage order payments through orders" ON order_payments;
CREATE POLICY "Users can access account order payments"
ON order_payments
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM orders
    JOIN customers ON customers.id = orders.customer_id
    WHERE orders.id = order_payments.order_id
    AND check_same_account(customers.user_id)
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM orders
    JOIN customers ON customers.id = orders.customer_id
    WHERE orders.id = order_payments.order_id
    AND check_same_account(customers.user_id)
  )
);

-- Update settings table policies
DROP POLICY IF EXISTS "Users can manage own settings" ON settings;
CREATE POLICY "Users can access account settings"
ON settings
FOR ALL
TO authenticated
USING (check_same_account(user_id))
WITH CHECK (check_same_account(user_id));

-- Update api_integrations table policies
DROP POLICY IF EXISTS "Users can manage own integrations" ON api_integrations;
CREATE POLICY "Users can access account integrations"
ON api_integrations
FOR ALL
TO authenticated
USING (check_same_account(user_id))
WITH CHECK (check_same_account(user_id));

-- Update insights table policies
DROP POLICY IF EXISTS "Users can manage own insights" ON insights;
CREATE POLICY "Users can access account insights"
ON insights
FOR ALL
TO authenticated
USING (check_same_account(user_id))
WITH CHECK (check_same_account(user_id));

-- Update whatsapp_campaigns table policies
DROP POLICY IF EXISTS "Users can manage own campaigns" ON whatsapp_campaigns;
CREATE POLICY "Users can access account campaigns"
ON whatsapp_campaigns
FOR ALL
TO authenticated
USING (check_same_account(user_id))
WITH CHECK (check_same_account(user_id));

-- Update whatsapp_campaign_logs table policies
DROP POLICY IF EXISTS "Users can view campaign logs" ON whatsapp_campaign_logs;
CREATE POLICY "Users can access account campaign logs"
ON whatsapp_campaign_logs
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM whatsapp_campaigns
    WHERE whatsapp_campaigns.id = whatsapp_campaign_logs.campaign_id
    AND check_same_account(whatsapp_campaigns.user_id)
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM whatsapp_campaigns
    WHERE whatsapp_campaigns.id = whatsapp_campaign_logs.campaign_id
    AND check_same_account(whatsapp_campaigns.user_id)
  )
);