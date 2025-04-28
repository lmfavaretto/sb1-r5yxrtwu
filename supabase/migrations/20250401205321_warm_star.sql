/*
  # Add menu_url to integrations config

  1. Changes
    - No schema changes needed since config is JSONB
    - Just documenting the new field in the config column

  2. Notes
    - menu_url will be stored in the config JSONB column
    - Format: https://restaurant-name.delmatchcardapio.com
*/

-- No schema changes needed since we're using the existing JSONB column
-- This migration is for documentation purposes only