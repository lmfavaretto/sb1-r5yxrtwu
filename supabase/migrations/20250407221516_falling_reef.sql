/*
  # Update order reference handling

  1. Changes
    - Add index on orders.reference to improve lookup performance
    - Add function to check if reference is from CSV import
    - Add trigger to validate reference format

  2. Notes
    - CSV references start with 'csv_'
    - API references are numeric strings
    - Ensures data consistency across import methods
*/

-- Create function to check if reference is from CSV
CREATE OR REPLACE FUNCTION is_csv_reference(ref text)
RETURNS boolean AS $$
BEGIN
  RETURN ref LIKE 'csv_%';
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Create index on orders.reference for better performance
CREATE INDEX IF NOT EXISTS orders_reference_idx ON orders(reference);

-- Create index specifically for non-CSV references
CREATE INDEX IF NOT EXISTS orders_api_reference_idx ON orders(reference) 
WHERE NOT is_csv_reference(reference);

-- Add trigger function to validate reference format
CREATE OR REPLACE FUNCTION validate_order_reference()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.reference IS NOT NULL THEN
    -- CSV references must start with csv_
    IF NEW.reference LIKE 'csv_%' THEN
      RETURN NEW;
    END IF;
    
    -- API references must be numeric
    IF NEW.reference ~ '^[0-9]+$' THEN
      RETURN NEW;
    END IF;
    
    RAISE EXCEPTION 'Invalid order reference format: %', NEW.reference;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for reference validation
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger 
    WHERE tgname = 'validate_order_reference_trigger'
  ) THEN
    CREATE TRIGGER validate_order_reference_trigger
      BEFORE INSERT OR UPDATE ON orders
      FOR EACH ROW
      EXECUTE FUNCTION validate_order_reference();
  END IF;
END $$;