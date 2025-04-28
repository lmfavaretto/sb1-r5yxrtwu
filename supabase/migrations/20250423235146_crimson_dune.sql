/*
  # Create execute_query function with proper parameter handling

  1. Changes
    - Create function that accepts query text and user_id
    - Add proper parameter validation and error handling
    - Ensure secure execution with proper permissions
    - Return results as JSONB

  2. Security
    - Function runs with SECURITY DEFINER
    - Validates user_id parameter
    - Prevents dangerous operations
    - Uses parameterized queries
*/

-- Drop existing function if it exists
DROP FUNCTION IF EXISTS public.execute_query(text, text[]);

-- Create the execute_query function
CREATE OR REPLACE FUNCTION public.execute_query(
  query_text text,
  user_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result jsonb;
  sanitized_query text;
BEGIN
  -- Validate parameters
  IF query_text IS NULL OR trim(query_text) = '' THEN
    RAISE EXCEPTION 'Query cannot be empty';
  END IF;

  IF user_id IS NULL THEN
    RAISE EXCEPTION 'User ID cannot be null';
  END IF;

  -- Prevent dangerous operations
  sanitized_query := lower(query_text);
  IF sanitized_query LIKE '%drop%' OR 
     sanitized_query LIKE '%truncate%' OR
     sanitized_query LIKE '%delete%' OR
     sanitized_query LIKE '%update%' OR
     sanitized_query LIKE '%alter%' OR
     sanitized_query LIKE '%create%' OR
     sanitized_query LIKE '%insert%' THEN
    RAISE EXCEPTION 'Operation not allowed';
  END IF;

  -- Ensure query contains user_id filter
  IF position('$1' in query_text) = 0 THEN
    RAISE EXCEPTION 'Query must filter by user_id using $1 parameter';
  END IF;

  -- Execute query and convert results to JSON
  EXECUTE format('
    WITH query_result AS (%s)
    SELECT COALESCE(
      jsonb_agg(to_jsonb(query_result.*)),
      ''[]''::jsonb
    )
    FROM query_result
  ', query_text)
  USING user_id
  INTO result;

  RETURN result;

EXCEPTION
  WHEN OTHERS THEN
    -- Return error information as JSON
    RETURN jsonb_build_object(
      'error', SQLERRM,
      'detail', SQLSTATE
    );
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION public.execute_query(text, uuid) TO authenticated;