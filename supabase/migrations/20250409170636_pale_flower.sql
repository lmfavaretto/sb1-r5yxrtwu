/*
  # Add historical_orders_url to api_integrations table

  1. Changes
    - Add historical_orders_url column to api_integrations table
    - Column is nullable text type
    - No changes to existing data or policies required

  2. Notes
    - Stores the URL for historical orders endpoint
    - Used by the sync function to fetch historical data
*/

DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'api_integrations' AND column_name = 'historical_orders_url'
  ) THEN
    ALTER TABLE api_integrations ADD COLUMN historical_orders_url text;
  END IF;
END $$;