/*
  # Add create_account_user function

  1. New Function
    - `create_account_user`: Creates a new account user with the provided details
      - Parameters:
        - p_user_id (uuid): The ID of the parent user
        - p_name (text): The name of the account user
        - p_email (text): The email of the account user
        - p_role (text): The role of the account user ('admin' or 'user')
      - Returns: jsonb containing the created user's details

  2. Security
    - Function is marked as SECURITY DEFINER to run with elevated privileges
    - Input validation ensures role is either 'admin' or 'user'
    - Checks for existing email to prevent duplicates
*/

CREATE OR REPLACE FUNCTION public.create_account_user(
    p_user_id uuid,
    p_name text,
    p_email text,
    p_role text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    new_user jsonb;
BEGIN
    -- Validate role
    IF p_role NOT IN ('admin', 'user') THEN
        RAISE EXCEPTION 'Invalid role. Must be either ''admin'' or ''user''';
    END IF;

    -- Check if email already exists for this user
    IF EXISTS (
        SELECT 1 
        FROM public.account_users 
        WHERE user_id = p_user_id AND email = p_email
    ) THEN
        RAISE EXCEPTION 'Email already exists for this account';
    END IF;

    -- Insert new account user
    INSERT INTO public.account_users (
        user_id,
        name,
        email,
        role
    )
    VALUES (
        p_user_id,
        p_name,
        p_email,
        p_role
    )
    RETURNING jsonb_build_object(
        'id', id,
        'user_id', user_id,
        'name', name,
        'email', email,
        'role', role,
        'created_at', created_at,
        'updated_at', updated_at
    ) INTO new_user;

    RETURN new_user;
END;
$$;