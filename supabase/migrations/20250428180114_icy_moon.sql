-- First drop all dependent policies
DROP POLICY IF EXISTS "Users can access account customers" ON customers;
DROP POLICY IF EXISTS "Users can access account orders" ON orders;
DROP POLICY IF EXISTS "Users can access account order items" ON order_items;
DROP POLICY IF EXISTS "Users can access account order payments" ON order_payments;
DROP POLICY IF EXISTS "Users can access account settings" ON settings;
DROP POLICY IF EXISTS "Users can access account integrations" ON api_integrations;
DROP POLICY IF EXISTS "Users can access account insights" ON insights;
DROP POLICY IF EXISTS "Users can access account campaigns" ON whatsapp_campaigns;
DROP POLICY IF EXISTS "Users can access account campaign logs" ON whatsapp_campaign_logs;

-- Now we can safely drop and recreate the function
DROP FUNCTION IF EXISTS check_same_account;

-- Create improved version of check_same_account function
CREATE OR REPLACE FUNCTION check_same_account(target_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
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

-- Create index to optimize the join
CREATE INDEX IF NOT EXISTS idx_account_users_email ON account_users(email);
CREATE INDEX IF NOT EXISTS idx_account_users_user_id ON account_users(user_id);

-- Recreate all the policies
CREATE POLICY "Users can access account customers"
ON customers
FOR ALL
TO authenticated
USING (check_same_account(user_id))
WITH CHECK (check_same_account(user_id));

CREATE POLICY "Users can access account orders"
ON orders
FOR ALL
TO authenticated
USING (EXISTS (
  SELECT 1 FROM customers
  WHERE customers.id = orders.customer_id
  AND check_same_account(customers.user_id)
));

CREATE POLICY "Users can access account order items"
ON order_items
FOR ALL
TO authenticated
USING (EXISTS (
  SELECT 1 FROM orders
  JOIN customers ON customers.id = orders.customer_id
  WHERE orders.id = order_items.order_id
  AND check_same_account(customers.user_id)
));

CREATE POLICY "Users can access account order payments"
ON order_payments
FOR ALL
TO authenticated
USING (EXISTS (
  SELECT 1 FROM orders
  JOIN customers ON customers.id = orders.customer_id
  WHERE orders.id = order_payments.order_id
  AND check_same_account(customers.user_id)
));

CREATE POLICY "Users can access account settings"
ON settings
FOR ALL
TO authenticated
USING (check_same_account(user_id))
WITH CHECK (check_same_account(user_id));

CREATE POLICY "Users can access account integrations"
ON api_integrations
FOR ALL
TO authenticated
USING (check_same_account(user_id))
WITH CHECK (check_same_account(user_id));

CREATE POLICY "Users can access account insights"
ON insights
FOR ALL
TO authenticated
USING (check_same_account(user_id))
WITH CHECK (check_same_account(user_id));

CREATE POLICY "Users can access account campaigns"
ON whatsapp_campaigns
FOR ALL
TO authenticated
USING (check_same_account(user_id))
WITH CHECK (check_same_account(user_id));

CREATE POLICY "Users can access account campaign logs"
ON whatsapp_campaign_logs
FOR ALL
TO authenticated
USING (EXISTS (
  SELECT 1 FROM whatsapp_campaigns
  WHERE whatsapp_campaigns.id = whatsapp_campaign_logs.campaign_id
  AND check_same_account(whatsapp_campaigns.user_id)
));