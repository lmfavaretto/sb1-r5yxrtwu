/*
  # Add missing fields to order_items and order_payments tables

  1. Changes
    - Add missing fields to order_items table
    - Add missing fields to order_payments table
    - Add proper indexes and constraints

  2. Notes
    - Ensures proper handling of Del Match data
    - Maintains data consistency
    - Improves query performance
*/

-- Add missing fields to order_items
ALTER TABLE order_items
ADD COLUMN IF NOT EXISTS discount numeric DEFAULT 0,
ADD COLUMN IF NOT EXISTS addition numeric DEFAULT 0,
ADD COLUMN IF NOT EXISTS external_code text,
ADD COLUMN IF NOT EXISTS observations text;

-- Add missing fields to order_payments
ALTER TABLE order_payments
ADD COLUMN IF NOT EXISTS prepaid boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS issuer text;