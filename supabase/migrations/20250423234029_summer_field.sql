-- Create the execute_query function
CREATE OR REPLACE FUNCTION public.execute_query(query text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  result jsonb;
  sanitized_query text;
BEGIN
  -- Basic input validation
  IF query IS NULL OR trim(query) = '' THEN
    RAISE EXCEPTION 'Query cannot be empty';
  END IF;

  -- Prevent dangerous operations
  sanitized_query := lower(query);
  IF sanitized_query LIKE '%drop%' OR 
     sanitized_query LIKE '%truncate%' OR
     sanitized_query LIKE '%delete%' OR
     sanitized_query LIKE '%update%' OR
     sanitized_query LIKE '%alter%' OR
     sanitized_query LIKE '%create%' OR
     sanitized_query LIKE '%insert%' THEN
    RAISE EXCEPTION 'Operation not allowed';
  END IF;

  -- Execute query and convert results to JSON
  EXECUTE format('
    WITH query_result AS (%s)
    SELECT jsonb_agg(to_jsonb(query_result.*))
    FROM query_result;
  ', query) INTO result;

  -- Handle null result
  IF result IS NULL THEN
    result := '[]'::jsonb;
  END IF;

  RETURN result;
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION public.execute_query(text) TO authenticated;