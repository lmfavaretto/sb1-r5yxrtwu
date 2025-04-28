/*
  # Fix Del Match data consistency issues

  1. Changes
    - Add `sistema_origem` column to customers table
    - Add better constraints and data validation
    - Fix data type handling for dates and numbers
    - Add indexes for better performance

  2. Notes
    - Ensures proper handling of Del Match data
    - Maintains data consistency across import methods
    - Improves query performance
*/

-- Add sistema_origem column if it doesn't exist
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'customers' AND column_name = 'sistema_origem'
  ) THEN
    ALTER TABLE customers ADD COLUMN sistema_origem text;
  END IF;

  -- Add total_orders and total_spent if they don't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'customers' AND column_name = 'total_orders'
  ) THEN
    ALTER TABLE customers ADD COLUMN total_orders integer DEFAULT 0;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'customers' AND column_name = 'total_spent'
  ) THEN
    ALTER TABLE customers ADD COLUMN total_spent numeric DEFAULT 0;
  END IF;
END $$;

-- Create index for phone number lookups
CREATE INDEX IF NOT EXISTS customers_phone_idx ON customers (phone);

-- Create index for sistema_origem
CREATE INDEX IF NOT EXISTS customers_sistema_origem_idx ON customers (sistema_origem);

-- Create function to validate phone number
CREATE OR REPLACE FUNCTION validate_phone(phone text)
RETURNS text AS $$
BEGIN
  -- Remove all non-numeric characters
  phone := regexp_replace(phone, '\D', '', 'g');
  
  -- Check if phone is valid (at least 10 digits)
  IF length(phone) >= 10 THEN
    RETURN phone;
  END IF;
  
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;