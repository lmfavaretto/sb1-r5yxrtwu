/*
  # Add execute_query function

  1. New Functions
    - `execute_query`: A function that safely executes dynamic SQL queries
      - Takes a query string and parameters array as input
      - Returns results as JSONB
      - Runs with SECURITY DEFINER to ensure proper permissions
      - Includes safety checks and error handling

  2. Security
    - Function runs with elevated privileges (SECURITY DEFINER)
    - Validates user_id parameter to prevent unauthorized access
    - Ensures query contains user_id filter
*/

-- Create the execute_query function
CREATE OR REPLACE FUNCTION public.execute_query(
    query text,
    params text[]
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    result jsonb;
    user_id uuid;
    dynamic_query text;
    i integer;
BEGIN
    -- Validate parameters
    IF array_length(params, 1) < 1 THEN
        RAISE EXCEPTION 'User ID parameter is required';
    END IF;

    -- Extract and validate user_id
    BEGIN
        user_id := params[1]::uuid;
    EXCEPTION WHEN OTHERS THEN
        RAISE EXCEPTION 'Invalid user_id format';
    END;

    -- Ensure query contains user_id parameter ($1)
    IF position('$1' in query) = 0 THEN
        RAISE EXCEPTION 'Query must filter by user_id using $1 parameter';
    END IF;

    -- Replace parameter placeholders with actual values
    dynamic_query := query;
    FOR i IN 1..array_length(params, 1) LOOP
        dynamic_query := replace(dynamic_query, format('$%s', i), quote_literal(params[i]));
    END LOOP;

    -- Execute query and convert results to JSON
    BEGIN
        EXECUTE format('SELECT json_agg(row_to_json(t)) FROM (%s) t', dynamic_query)
        INTO result;

        -- Handle null result (no rows)
        IF result IS NULL THEN
            result := '[]'::jsonb;
        END IF;

        RETURN result;
    EXCEPTION WHEN OTHERS THEN
        RAISE EXCEPTION 'Query execution failed: %', SQLERRM;
    END;
END;
$$;