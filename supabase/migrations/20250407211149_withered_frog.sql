/*
  # Add constraints for order details

  1. Changes
    - Add check constraints for numeric values in order_items and order_payments
    - Ensure non-negative values for prices, quantities, and amounts

  2. Notes
    - Prevents invalid numeric values
    - Maintains data consistency
*/

-- Add check constraints for numeric values
ALTER TABLE order_items
ADD CONSTRAINT order_items_quantity_check CHECK (quantity > 0),
ADD CONSTRAINT order_items_price_check CHECK (price >= 0),
ADD CONSTRAINT order_items_total_price_check CHECK (total_price >= 0),
ADD CONSTRAINT order_items_discount_check CHECK (discount >= 0),
ADD CONSTRAINT order_items_addition_check CHECK (addition >= 0);

ALTER TABLE order_payments
ADD CONSTRAINT order_payments_value_check CHECK (value >= 0);