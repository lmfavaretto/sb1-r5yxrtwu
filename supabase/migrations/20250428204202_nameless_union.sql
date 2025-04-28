-- Drop existing policies with safety checks
DO $$ 
BEGIN
  -- Drop policies if they exist
  IF EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can read own and parent data' AND tablename = 'users') THEN
    DROP POLICY "Users can read own and parent data" ON users;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can read account users' AND tablename = 'account_users') THEN
    DROP POLICY "Users can read account users" ON account_users;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can manage account users' AND tablename = 'account_users') THEN
    DROP POLICY "Users can manage account users" ON account_users;
  END IF;
END $$;

-- Create improved policies for users table
CREATE POLICY "Users can read own and parent data"
ON users
FOR SELECT
TO authenticated
USING (
  id = auth.uid() OR 
  EXISTS (
    SELECT 1 FROM account_users
    WHERE account_users.email = (SELECT email FROM auth.users WHERE id = auth.uid())
    AND account_users.user_id = users.id
  )
);

-- Create improved policies for account_users table
CREATE POLICY "Users can read account users"
ON account_users
FOR SELECT
TO authenticated
USING (
  user_id = auth.uid() OR
  email = (SELECT email FROM auth.users WHERE id = auth.uid())
);

CREATE POLICY "Users can manage account users"
ON account_users
FOR ALL
TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

-- Create function to update user metadata
CREATE OR REPLACE FUNCTION update_user_metadata()
RETURNS TRIGGER AS $$
BEGIN
  -- Update auth.users raw_user_meta_data directly
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

-- Create trigger for updating user metadata
DROP TRIGGER IF EXISTS update_user_metadata_trigger ON account_users;
CREATE TRIGGER update_user_metadata_trigger
  AFTER INSERT ON account_users
  FOR EACH ROW
  EXECUTE FUNCTION update_user_metadata();

-- Create function to check if users belong to same account
CREATE OR REPLACE FUNCTION check_same_account(target_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN (
    target_user_id = auth.uid() OR
    EXISTS (
      SELECT 1 FROM account_users
      WHERE user_id = target_user_id
      AND email = (
        SELECT email FROM auth.users WHERE id = auth.uid()
      )
    )
  );
END;
$$;

-- Update RLS policies with safety checks
DO $$ 
BEGIN
  -- Drop existing policies if they exist
  IF EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can access account customers' AND tablename = 'customers') THEN
    DROP POLICY "Users can access account customers" ON customers;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can access account orders' AND tablename = 'orders') THEN
    DROP POLICY "Users can access account orders" ON orders;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can access account order items' AND tablename = 'order_items') THEN
    DROP POLICY "Users can access account order items" ON order_items;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can access account order payments' AND tablename = 'order_payments') THEN
    DROP POLICY "Users can access account order payments" ON order_payments;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can access account settings' AND tablename = 'settings') THEN
    DROP POLICY "Users can access account settings" ON settings;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can access account integrations' AND tablename = 'api_integrations') THEN
    DROP POLICY "Users can access account integrations" ON api_integrations;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can access account insights' AND tablename = 'insights') THEN
    DROP POLICY "Users can access account insights" ON insights;
  END IF;
END $$;

-- Enable RLS and create new policies
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can access account customers"
ON customers
FOR ALL
TO authenticated
USING (check_same_account(user_id))
WITH CHECK (check_same_account(user_id));

ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
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
);

ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;
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
);

ALTER TABLE order_payments ENABLE ROW LEVEL SECURITY;
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
);

ALTER TABLE settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can access account settings"
ON settings
FOR ALL
TO authenticated
USING (check_same_account(user_id))
WITH CHECK (check_same_account(user_id));

ALTER TABLE api_integrations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can access account integrations"
ON api_integrations
FOR ALL
TO authenticated
USING (check_same_account(user_id))
WITH CHECK (check_same_account(user_id));

ALTER TABLE insights ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can access account insights"
ON insights
FOR ALL
TO authenticated
USING (check_same_account(user_id))
WITH CHECK (check_same_account(user_id));

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_account_users_email ON account_users(email);
CREATE INDEX IF NOT EXISTS idx_account_users_user_id ON account_users(user_id);
CREATE INDEX IF NOT EXISTS idx_customers_user_id ON customers(user_id);
CREATE INDEX IF NOT EXISTS idx_orders_customer_id ON orders(customer_id);
CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_order_payments_order_id ON order_payments(order_id);