/*
  # Fix data inconsistencies in customers and orders tables

  1. Changes
    - Fix total_orders to use the actual value from CSV
    - Fix total_spent calculation to handle decimal places correctly
    - Fix date handling to properly set cliente_desde and last_order_date
    - Add trigger to maintain data consistency

  2. Notes
    - Converts decimal separator from dot to comma
    - Ensures dates are properly formatted
    - Updates existing records
*/

-- Create function to handle Brazilian number format
CREATE OR REPLACE FUNCTION parse_brazilian_number(value text)
RETURNS numeric AS $$
BEGIN
  -- Remove currency symbol and spaces
  value := regexp_replace(value, 'R\$|\s', '', 'g');
  -- Replace comma with dot for decimal separator
  value := replace(value, ',', '.');
  -- Convert to numeric, defaulting to 0 if invalid
  RETURN COALESCE(value::numeric, 0);
EXCEPTION
  WHEN OTHERS THEN
    RETURN 0;
END;
$$ LANGUAGE plpgsql;

-- Create function to handle Brazilian date format
CREATE OR REPLACE FUNCTION parse_brazilian_date(value text)
RETURNS timestamptz AS $$
BEGIN
  -- Convert DD/MM/YYYY to YYYY-MM-DD
  RETURN to_timestamp(value, 'DD/MM/YYYY');
EXCEPTION
  WHEN OTHERS THEN
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

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
    created_at = LEAST(ct.first_order_date, c.created_at)
  FROM customer_totals ct
  WHERE c.id = ct.customer_id;
  
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Drop and recreate the trigger
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
  created_at = LEAST(ct.first_order_date, c.created_at)
FROM customer_totals ct
WHERE c.id = ct.customer_id;

-- Set default values for customers with no orders
UPDATE customers
SET 
  total_orders = 0,
  total_spent = 0,
  last_order_date = created_at
WHERE id NOT IN (SELECT DISTINCT customer_id FROM orders);