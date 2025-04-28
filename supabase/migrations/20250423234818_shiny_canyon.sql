-- Drop existing function if it exists
DROP FUNCTION IF EXISTS public.execute_query(text);
DROP FUNCTION IF EXISTS public.execute_query(text, json);
DROP FUNCTION IF EXISTS public.execute_query(text, jsonb);

-- Create the execute_query function with proper parameter handling
CREATE OR REPLACE FUNCTION public.execute_query(query_text text, params jsonb DEFAULT '[]'::jsonb)
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
  SELECT array_agg(value::text)
  FROM jsonb_array_elements(params)
  INTO param_values;

  -- Replace parameter placeholders ($1, $2, etc.) with actual values
  dynamic_query := query_text;
  IF param_values IS NOT NULL THEN
    FOR i IN 1..array_length(param_values, 1) LOOP
      dynamic_query := regexp_replace(
        dynamic_query,
        '\$' || i::text || '\b',
        quote_literal(param_values[i]),
        'g'
      );
    END LOOP;
  END IF;

  -- Execute the query and get results as JSON
  EXECUTE format('
    SELECT COALESCE(
      jsonb_agg(to_jsonb(t)),
      ''[]''::jsonb
    )
    FROM (%s) t
  ', dynamic_query) INTO result;

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
GRANT EXECUTE ON FUNCTION public.execute_query(text, jsonb) TO authenticated;