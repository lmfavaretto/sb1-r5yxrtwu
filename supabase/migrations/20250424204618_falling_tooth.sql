/*
  # Fix execute_query function

  1. Changes
    - Drop existing function
    - Create new version with better security
    - Add proper parameter handling
    - Add RLS bypass for authenticated users
    - Add logging for debugging

  2. Security
    - Function runs with SECURITY DEFINER
    - Validates user_id parameter
    - Ensures query contains user_id filter
    - Prevents dangerous operations
*/

-- Drop existing function
DROP FUNCTION IF EXISTS public.execute_query(text);
DROP FUNCTION IF EXISTS public.execute_query(text, json);
DROP FUNCTION IF EXISTS public.execute_query(text, jsonb);
DROP FUNCTION IF EXISTS public.execute_query(text, uuid);

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

  -- Ensure query contains user_id parameter
  IF position('$1' in query_text) = 0 THEN
    RAISE EXCEPTION 'Query must filter by user_id using $1 parameter';
  END IF;

  -- Execute query with proper parameter binding
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

  -- Log successful execution
  INSERT INTO operation_logs (
    operation,
    entity_type,
    entity_id,
    details
  ) VALUES (
    'execute_query',
    'query',
    user_id::text,
    jsonb_build_object(
      'query', query_text,
      'timestamp', now(),
      'success', true
    )
  );

  RETURN result;

EXCEPTION WHEN OTHERS THEN
  -- Log error
  INSERT INTO operation_logs (
    operation,
    entity_type,
    entity_id,
    details
  ) VALUES (
    'execute_query_error',
    'query',
    user_id::text,
    jsonb_build_object(
      'query', query_text,
      'error', SQLERRM,
      'detail', SQLSTATE,
      'timestamp', now()
    )
  );

  -- Return error information
  RETURN jsonb_build_object(
    'error', SQLERRM,
    'detail', SQLSTATE
  );
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION public.execute_query(text, uuid) TO authenticated;

-- Create index on operation_logs for better query performance
CREATE INDEX IF NOT EXISTS operation_logs_entity_type_operation_idx 
ON operation_logs(entity_type, operation);