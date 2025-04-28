import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'npm:@supabase/supabase-js@2.39.7';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { name, email, password, role, user_id } = await req.json();

    // Validate required fields
    if (!name || !email || !password || !role || !user_id) {
      throw new Error('Missing required fields');
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      throw new Error('Invalid email format');
    }

    // Validate password length
    if (password.length < 6) {
      throw new Error('Password must be at least 6 characters long');
    }

    // Validate role
    if (!['admin', 'user'].includes(role)) {
      throw new Error('Invalid role specified');
    }

    // Initialize Supabase client with service role key
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error('Missing Supabase configuration');
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    });

    // Check if email already exists in account_users
    const { data: existingUser, error: existingUserError } = await supabase
      .from('account_users')
      .select('id')
      .eq('email', email)
      .maybeSingle();

    if (existingUserError) {
      console.error('Existing user check error:', existingUserError);
      throw new Error(`Database query failed: ${existingUserError.message}`);
    }
    
    if (existingUser) {
      throw new Error('User already has an account');
    }

    // Create auth user with admin API
    const { data: { user }, error: createError } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        name,
        role,
        parent_user_id: user_id
      }
    });

    if (createError) {
      console.error('User creation error:', createError);
      throw new Error(`Failed to create user: ${createError.message}`);
    }

    if (!user) {
      throw new Error('Failed to create user: No user returned');
    }

    try {
      // Create account_users record using RPC to bypass RLS
      const { data: accountUser, error: accountError } = await supabase
        .rpc('create_account_user', {
          p_user_id: user_id,
          p_name: name,
          p_email: email,
          p_role: role
        });

      if (accountError) {
        // If account_users creation fails, delete the auth user
        await supabase.auth.admin.deleteUser(user.id);
        console.error('Account user creation error:', accountError);
        throw new Error(`Failed to create account user: ${accountError.message}`);
      }

      // Log the operation
      await supabase
        .from('operation_logs')
        .insert({
          operation: 'create_account_user',
          entity_type: 'account_user',
          entity_id: accountUser.id,
          details: {
            name,
            email,
            role,
            auth_uid: user.id,
            parent_user_id: user_id,
            timestamp: new Date().toISOString()
          }
        });

      return new Response(
        JSON.stringify({
          success: true,
          data: accountUser
        }),
        { 
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json',
          }
        }
      );

    } catch (dbError) {
      console.error('Database operation error:', dbError);
      throw new Error(`Database operation failed: ${dbError instanceof Error ? dbError.message : 'Unknown error'}`);
    }

  } catch (error) {
    console.error('Error in create-account-user function:', error);
    
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    let statusCode = 500;

    if (errorMessage.includes('already has an account')) {
      statusCode = 409;
    } else if (
      errorMessage.includes('Missing required fields') || 
      errorMessage.includes('Invalid email format') ||
      errorMessage.includes('Password must be') ||
      errorMessage.includes('Invalid role')
    ) {
      statusCode = 400;
    }
    
    return new Response(
      JSON.stringify({ 
        success: false,
        error: errorMessage
      }),
      { 
        status: statusCode,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
        }
      }
    );
  }
});