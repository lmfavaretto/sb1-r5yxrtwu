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
    // Get code from request body
    const { code } = await req.json();
    if (!code) {
      throw new Error('Authorization code is required');
    }

    // Get user ID from JWT
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('Missing authorization header');
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      {
        auth: {
          persistSession: false,
        }
      }
    );

    // Verify JWT and get user
    const { data: { user }, error: authError } = await supabase.auth.getUser(
      authHeader.replace('Bearer ', '')
    );

    if (authError || !user) {
      throw new Error('Invalid authorization token');
    }

    // Exchange code for access token
    const tokenResponse = await fetch(
      `https://graph.facebook.com/v19.0/oauth/access_token?` +
      `client_id=${Deno.env.get('FB_APP_ID')}` +
      `&redirect_uri=${Deno.env.get('FB_REDIRECT_URI')}` +
      `&client_secret=${Deno.env.get('FB_APP_SECRET')}` +
      `&code=${code}`,
      {
        method: 'GET',
      }
    );

    if (!tokenResponse.ok) {
      const error = await tokenResponse.json();
      throw new Error(`Failed to get access token: ${error.error?.message || tokenResponse.statusText}`);
    }

    const { access_token } = await tokenResponse.json();

    // Get business accounts
    const businessResponse = await fetch(
      'https://graph.facebook.com/v19.0/me/businesses',
      {
        headers: {
          'Authorization': `Bearer ${access_token}`
        }
      }
    );

    if (!businessResponse.ok) {
      const error = await businessResponse.json();
      throw new Error(`Failed to get business accounts: ${error.error?.message || businessResponse.statusText}`);
    }

    const businessData = await businessResponse.json();
    if (!businessData?.data || businessData.data.length === 0) {
      throw new Error('No business accounts found');
    }

    const businessId = businessData.data[0].id;

    // Get WhatsApp Business accounts
    const wabaResponse = await fetch(
      `https://graph.facebook.com/v19.0/${businessId}/owned_whatsapp_business_accounts`,
      {
        headers: {
          'Authorization': `Bearer ${access_token}`
        }
      }
    );

    if (!wabaResponse.ok) {
      const error = await wabaResponse.json();
      throw new Error(`Failed to get WhatsApp Business accounts: ${error.error?.message || wabaResponse.statusText}`);
    }

    const wabaData = await wabaResponse.json();
    if (!wabaData?.data || wabaData.data.length === 0) {
      throw new Error('No WhatsApp Business accounts found');
    }

    const wabaId = wabaData.data[0].id;

    // Get phone numbers
    const phoneResponse = await fetch(
      `https://graph.facebook.com/v19.0/${wabaId}/phone_numbers`,
      {
        headers: {
          'Authorization': `Bearer ${access_token}`
        }
      }
    );

    if (!phoneResponse.ok) {
      const error = await phoneResponse.json();
      throw new Error(`Failed to get phone numbers: ${error.error?.message || phoneResponse.statusText}`);
    }

    const phoneData = await phoneResponse.json();
    if (!phoneData?.data || phoneData.data.length === 0) {
      throw new Error('No phone numbers found');
    }

    const phoneNumber = phoneData.data[0];

    // Save connection in Supabase
    const { error: insertError } = await supabase
      .from('whatsapp_connections')
      .upsert({
        user_id: user.id,
        phone_number_id: phoneNumber.id,
        phone_display: phoneNumber.display_phone_number,
        business_id: businessId,
        access_token,
        connected_at: new Date().toISOString(),
      });

    if (insertError) {
      throw insertError;
    }

    // Return success response
    return new Response(
      JSON.stringify({
        success: true,
        phone_number_id: phoneNumber.id,
        phone_display: phoneNumber.display_phone_number,
      }),
      { 
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
        }
      }
    );

  } catch (error) {
    console.error('WhatsApp connection error:', error);
    
    return new Response(
      JSON.stringify({ 
        success: false,
        error: error instanceof Error ? error.message : 'Failed to connect WhatsApp'
      }),
      { 
        status: 500,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
        }
      }
    );
  }
});