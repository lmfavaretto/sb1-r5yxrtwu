/*
  # Add execute_query function with unique signature
  
  1. Changes
    - Drop existing function first to avoid conflicts
    - Create function with explicit parameter types
    - Add proper security and permissions
*/

-- Drop existing function if it exists
DROP FUNCTION IF EXISTS public.execute_query(text, json);

CREATE OR REPLACE FUNCTION public.execute_query(query_text text, params json)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  result jsonb;
  param_values text[];
  dynamic_query text;
  i integer;
BEGIN
  -- Convert JSON array to text array
  SELECT ARRAY(
    SELECT json_array_elements_text(params)
  ) INTO param_values;
  
  -- Replace parameter placeholders ($1, $2, etc.) with actual values
  dynamic_query := query_text;
  FOR i IN 1..array_length(param_values, 1) LOOP
    dynamic_query := replace(dynamic_query, format('$%s', i), quote_literal(param_values[i]));
  END LOOP;
  
  -- Execute the query and get results as JSON
  EXECUTE format('SELECT jsonb_agg(row_to_json(t)) FROM (%s) t', dynamic_query)
  INTO result;
  
  -- Return empty array if null
  RETURN COALESCE(result, '[]'::jsonb);
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION public.execute_query(text, json) TO authenticated;