/*
  # Fix data synchronization issues

  1. Changes
    - Add better customer data handling
    - Fix total calculation issues
    - Add proper validation and constraints
    - Add detailed logging functions

  2. Notes
    - Ensures proper handling of CSV and API data
    - Maintains data consistency across sources
    - Improves debugging capabilities
*/

-- Create function to log operations
CREATE OR REPLACE FUNCTION log_operation(
  operation text,
  entity_type text,
  entity_id text,
  details jsonb
) RETURNS void AS $$
BEGIN
  INSERT INTO operation_logs (
    operation,
    entity_type,
    entity_id,
    details,
    created_at
  ) VALUES (
    operation,
    entity_type,
    entity_id,
    details,
    now()
  );
END;
$$ LANGUAGE plpgsql;

-- Create operation_logs table if it doesn't exist
CREATE TABLE IF NOT EXISTS operation_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operation text NOT NULL,
  entity_type text NOT NULL,
  entity_id text NOT NULL,
  details jsonb NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- Create index on customer_id in orders table
CREATE INDEX IF NOT EXISTS orders_customer_id_idx ON orders(customer_id);

-- Drop existing trigger and function
DROP TRIGGER IF EXISTS update_customer_totals_trigger ON orders;
DROP FUNCTION IF EXISTS update_customer_totals();

-- Create improved function to update customer totals
CREATE OR REPLACE FUNCTION update_customer_totals()
RETURNS TRIGGER AS $$
DECLARE
  customer_record RECORD;
  new_total_orders INTEGER;
  new_total_spent NUMERIC;
  new_last_order_date TIMESTAMPTZ;
  earliest_order_date TIMESTAMPTZ;
BEGIN
  -- Get the customer ID based on the operation
  customer_record := CASE
    WHEN TG_OP = 'DELETE' THEN OLD
    ELSE NEW
  END;

  -- Calculate new totals
  SELECT
    COUNT(*) as total_orders,
    COALESCE(SUM(order_value), 0) as total_spent,
    MAX(order_date) as last_order_date,
    MIN(order_date) as first_order_date
  INTO
    new_total_orders,
    new_total_spent,
    new_last_order_date,
    earliest_order_date
  FROM orders
  WHERE customer_id = customer_record.customer_id;

  -- Update customer record
  UPDATE customers
  SET
    total_orders = new_total_orders,
    total_spent = new_total_spent,
    last_order_date = new_last_order_date,
    -- Update created_at only if the earliest order is before current created_at
    created_at = CASE
      WHEN earliest_order_date < created_at OR created_at IS NULL
      THEN earliest_order_date
      ELSE created_at
    END,
    -- Set sistema_origem to 'mixed' if orders come from multiple sources
    sistema_origem = CASE
      WHEN EXISTS (
        SELECT 1 FROM orders o1
        WHERE o1.customer_id = customer_record.customer_id
        AND o1.reference LIKE 'csv_%'
      ) AND EXISTS (
        SELECT 1 FROM orders o2
        WHERE o2.customer_id = customer_record.customer_id
        AND o2.reference ~ '^[0-9]+$'
      )
      THEN 'mixed'
      ELSE sistema_origem
    END
  WHERE id = customer_record.customer_id;

  -- Log the operation
  PERFORM log_operation(
    TG_OP,
    'customer_totals',
    customer_record.customer_id::text,
    jsonb_build_object(
      'total_orders', new_total_orders,
      'total_spent', new_total_spent,
      'last_order_date', new_last_order_date,
      'earliest_order_date', earliest_order_date
    )
  );

  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Create new trigger
CREATE TRIGGER update_customer_totals_trigger
AFTER INSERT OR UPDATE OR DELETE ON orders
FOR EACH ROW EXECUTE FUNCTION update_customer_totals();

-- Create function to validate and clean phone numbers
CREATE OR REPLACE FUNCTION clean_phone_number(phone text)
RETURNS text AS $$
DECLARE
  cleaned text;
BEGIN
  -- Remove all non-numeric characters
  cleaned := regexp_replace(phone, '\D', '', 'g');
  
  -- Ensure minimum length
  IF length(cleaned) < 10 THEN
    RETURN NULL;
  END IF;
  
  -- Return cleaned number
  RETURN cleaned;
END;
$$ LANGUAGE plpgsql;