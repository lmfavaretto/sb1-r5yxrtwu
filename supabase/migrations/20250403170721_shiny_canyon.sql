/*
  # Fix customer data handling and add Del Match integration

  1. New Columns
    - Add sistema_origem to customers table
    - Add total_orders and total_spent if not exists
    - Ensure proper data types and defaults

  2. Functions
    - Create parse_brazilian_date function for DD/MM/YYYY format
    - Create update_customer_data trigger function
    - Create validate_phone function

  3. Indexes & Constraints
    - Add phone number index
    - Add sistema_origem index
    - Add unique constraint on user_id + phone
*/

-- Add required columns if they don't exist
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'customers' AND column_name = 'sistema_origem'
  ) THEN
    ALTER TABLE customers ADD COLUMN sistema_origem text;
  END IF;

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

-- Create function to parse Brazilian date format (DD/MM/YYYY)
CREATE OR REPLACE FUNCTION parse_brazilian_date(input_date text)
RETURNS timestamptz AS $$
DECLARE
  day_val int;
  month_val int;
  year_val int;
BEGIN
  -- Extract day, month, year from DD/MM/YYYY format
  day_val := (string_to_array(input_date, '/'))[1]::int;
  month_val := (string_to_array(input_date, '/'))[2]::int;
  year_val := (string_to_array(input_date, '/'))[3]::int;
  
  -- Add century if year is two digits
  IF year_val < 100 THEN
    year_val := year_val + 2000;
  END IF;
  
  -- Return timestamp
  RETURN make_date(year_val, month_val, day_val)::timestamptz;
EXCEPTION
  WHEN OTHERS THEN
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Create function to handle customer data updates
CREATE OR REPLACE FUNCTION update_customer_data()
RETURNS trigger AS $$
BEGIN
  -- For new records, ensure created_at is set
  IF TG_OP = 'INSERT' THEN
    IF NEW.created_at IS NULL THEN
      NEW.created_at := COALESCE(NEW.last_order_date, now());
    END IF;
  END IF;

  -- For updates, preserve the earliest created_at date
  IF TG_OP = 'UPDATE' THEN
    -- Keep earliest created_at date
    IF OLD.created_at < NEW.created_at THEN
      NEW.created_at := OLD.created_at;
    END IF;

    -- Update last_order_date only if new date is more recent
    IF NEW.last_order_date < OLD.last_order_date THEN
      NEW.last_order_date := OLD.last_order_date;
    END IF;

    -- Handle total_orders update
    IF NEW.sistema_origem = 'delmatch' THEN
      -- For Del Match, use the value from import
      NULL;
    ELSE
      -- For other sources, calculate from orders table
      SELECT COUNT(*), COALESCE(SUM(order_value), 0)
      INTO NEW.total_orders, NEW.total_spent
      FROM orders
      WHERE customer_id = NEW.id;
    END IF;
  END IF;

  -- Validate phone number
  NEW.phone := validate_phone(NEW.phone);
  IF NEW.phone IS NULL THEN
    RAISE EXCEPTION 'Invalid phone number';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create or replace the trigger
DROP TRIGGER IF EXISTS customer_data_trigger ON customers;
CREATE TRIGGER customer_data_trigger
  BEFORE INSERT OR UPDATE ON customers
  FOR EACH ROW
  EXECUTE FUNCTION update_customer_data();

-- Create indexes if they don't exist
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes 
    WHERE indexname = 'customers_phone_idx'
  ) THEN
    CREATE INDEX customers_phone_idx ON customers (phone);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes 
    WHERE indexname = 'customers_sistema_origem_idx'
  ) THEN
    CREATE INDEX customers_sistema_origem_idx ON customers (sistema_origem);
  END IF;
END $$;

-- Add unique constraint for user_id and phone if it doesn't exist
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'customers_user_id_phone_key'
  ) THEN
    ALTER TABLE customers
    ADD CONSTRAINT customers_user_id_phone_key UNIQUE (user_id, phone);
  END IF;
END $$;