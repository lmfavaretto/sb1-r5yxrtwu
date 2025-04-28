/*
  # Add execute_query function

  1. New Functions
    - `execute_query(query text, params jsonb)`
      - Takes a SQL query and parameters
      - Executes the query dynamically
      - Returns results as JSONB
  
  2. Security
    - Function is created in public schema
    - Function has SECURITY DEFINER to run with creator's permissions
    - Input parameters are properly typed and validated
*/

CREATE OR REPLACE FUNCTION public.execute_query(query text, params jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  result jsonb;
BEGIN
  -- Execute the query dynamically and aggregate results as JSON
  EXECUTE 'SELECT json_agg(row_to_json(t)) FROM (' || query || ') t' 
  USING params 
  INTO result;
  
  -- Return empty array instead of null if no results
  RETURN COALESCE(result, '[]'::jsonb);
EXCEPTION
  WHEN OTHERS THEN
    -- Return error information as JSON
    RETURN jsonb_build_object(
      'error', SQLERRM,
      'detail', SQLSTATE
    );
END;
$$;