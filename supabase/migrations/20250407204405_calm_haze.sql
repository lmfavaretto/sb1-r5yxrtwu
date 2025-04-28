/*
  # Add order items and payments tables

  1. New Tables
    - `order_items`
      - `id` (uuid, primary key)
      - `order_id` (uuid, references orders.id)
      - `name` (text)
      - `quantity` (int)
      - `price` (numeric)
      - `total_price` (numeric)
      - `discount` (numeric)
      - `addition` (numeric)
      - `external_code` (text)
      - `observations` (text)
      - `created_at` (timestamptz)
    
    - `order_payments`
      - `id` (uuid, primary key)
      - `order_id` (uuid, references orders.id)
      - `name` (text)
      - `value` (numeric)
      - `prepaid` (boolean)
      - `issuer` (text)
      - `created_at` (timestamptz)

  2. Security
    - Enable RLS on both tables
    - Add policies for authenticated users to manage their own data
*/

-- Create order_items table
CREATE TABLE IF NOT EXISTS order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid REFERENCES orders(id) ON DELETE CASCADE NOT NULL,
  name text NOT NULL,
  quantity int NOT NULL,
  price numeric NOT NULL,
  total_price numeric NOT NULL,
  discount numeric DEFAULT 0,
  addition numeric DEFAULT 0,
  external_code text,
  observations text,
  created_at timestamptz DEFAULT now()
);

-- Create order_payments table
CREATE TABLE IF NOT EXISTS order_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid REFERENCES orders(id) ON DELETE CASCADE NOT NULL,
  name text NOT NULL,
  value numeric NOT NULL,
  prepaid boolean DEFAULT false,
  issuer text,
  created_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_payments ENABLE ROW LEVEL SECURITY;

-- Create policies for order_items
CREATE POLICY "Users can manage order items through orders"
  ON order_items
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM orders
      JOIN customers ON customers.id = orders.customer_id
      WHERE orders.id = order_items.order_id
      AND customers.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM orders
      JOIN customers ON customers.id = orders.customer_id
      WHERE orders.id = order_items.order_id
      AND customers.user_id = auth.uid()
    )
  );

-- Create policies for order_payments
CREATE POLICY "Users can manage order payments through orders"
  ON order_payments
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM orders
      JOIN customers ON customers.id = orders.customer_id
      WHERE orders.id = order_payments.order_id
      AND customers.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM orders
      JOIN customers ON customers.id = orders.customer_id
      WHERE orders.id = order_payments.order_id
      AND customers.user_id = auth.uid()
    )
  );

-- Create indexes for better performance
CREATE INDEX order_items_order_id_idx ON order_items(order_id);
CREATE INDEX order_payments_order_id_idx ON order_payments(order_id);