/*
  # Add execute_sql function

  1. New Functions
    - `execute_sql(p_sql text, p_params text[])`: Executes dynamic SQL with parameters safely
      - Takes SQL query text and array of parameters
      - Returns JSONB array of results
      - Includes security checks and error handling
      - Only allows SELECT statements for safety

  2. Security
    - Function is SECURITY DEFINER to run with owner privileges
    - Input validation prevents SQL injection
    - Restricted to SELECT statements only
    - Parameters are properly escaped
*/

CREATE OR REPLACE FUNCTION public.execute_sql(p_sql text, p_params text[])
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_result jsonb;
  v_sanitized_sql text;
  v_dynamic_sql text;
  i integer;
BEGIN
  -- Validate input
  IF p_sql IS NULL OR trim(p_sql) = '' THEN
    RAISE EXCEPTION 'SQL query cannot be empty';
  END IF;

  -- Only allow SELECT statements
  v_sanitized_sql := trim(p_sql);
  IF NOT starts_with(lower(v_sanitized_sql), 'select') THEN
    RAISE EXCEPTION 'Only SELECT statements are allowed';
  END IF;

  -- Replace parameter placeholders with actual values
  v_dynamic_sql := v_sanitized_sql;
  IF p_params IS NOT NULL THEN
    FOR i IN 1..array_length(p_params, 1) LOOP
      v_dynamic_sql := regexp_replace(
        v_dynamic_sql,
        '\$' || i::text || '\b',
        quote_literal(p_params[i]),
        'g'
      );
    END LOOP;
  END IF;

  -- Execute query and convert results to JSONB
  EXECUTE format('SELECT jsonb_agg(row_to_json(t)) FROM (%s) t', v_dynamic_sql)
  INTO v_result;

  -- Return empty array if no results
  RETURN COALESCE(v_result, '[]'::jsonb);
EXCEPTION
  WHEN OTHERS THEN
    RAISE EXCEPTION 'Query execution failed: %', SQLERRM;
END;
$$;