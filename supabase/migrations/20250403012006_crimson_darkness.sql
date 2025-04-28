-- First, add reference column if it doesn't exist
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'orders' AND column_name = 'reference'
  ) THEN
    ALTER TABLE orders ADD COLUMN reference text;
    CREATE UNIQUE INDEX orders_reference_key ON orders (reference) WHERE reference IS NOT NULL;
  END IF;
END $$;

-- Create function to update customer totals
CREATE OR REPLACE FUNCTION update_customer_totals()
RETURNS TRIGGER AS $$
BEGIN
  -- Update customer totals
  WITH customer_totals AS (
    SELECT 
      customer_id,
      COUNT(*) as total_orders,
      COALESCE(SUM(order_value), 0) as total_spent,
      MAX(order_date) as last_order_date,
      MIN(order_date) as first_order_date
    FROM orders
    WHERE customer_id = COALESCE(OLD.customer_id, NEW.customer_id)
    GROUP BY customer_id
  )
  UPDATE customers c
  SET 
    total_orders = ct.total_orders,
    total_spent = ct.total_spent,
    last_order_date = ct.last_order_date,
    created_at = LEAST(ct.first_order_date, c.created_at) -- Update created_at if first order is earlier
  FROM customer_totals ct
  WHERE c.id = ct.customer_id;
  
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Create or replace the trigger
DROP TRIGGER IF EXISTS update_customer_totals_trigger ON orders;
CREATE TRIGGER update_customer_totals_trigger
AFTER INSERT OR UPDATE OR DELETE ON orders
FOR EACH ROW EXECUTE FUNCTION update_customer_totals();

-- Reset all customer totals based on actual orders
WITH customer_totals AS (
  SELECT 
    customer_id,
    COUNT(*) as total_orders,
    COALESCE(SUM(order_value), 0) as total_spent,
    MAX(order_date) as last_order_date,
    MIN(order_date) as first_order_date
  FROM orders
  GROUP BY customer_id
)
UPDATE customers c
SET 
  total_orders = ct.total_orders,
  total_spent = ct.total_spent,
  last_order_date = ct.last_order_date,
  created_at = LEAST(ct.first_order_date, c.created_at) -- Update created_at if first order is earlier
FROM customer_totals ct
WHERE c.id = ct.customer_id;

-- Set default values for customers with no orders
UPDATE customers
SET 
  total_orders = 0,
  total_spent = 0,
  last_order_date = created_at
WHERE id NOT IN (SELECT DISTINCT customer_id FROM orders);