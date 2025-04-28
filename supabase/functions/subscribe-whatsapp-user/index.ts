import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Validate request method
    if (req.method !== 'POST') {
      throw new Error('Method not allowed');
    }

    // Parse request body
    const { access_token, waba_id } = await req.json();

    // Validate required fields
    if (!access_token || !waba_id) {
      throw new Error('Missing required fields: access_token and waba_id are required');
    }

    // Make request to WhatsApp Business API
    const response = await fetch(
      `https://graph.facebook.com/v19.0/${waba_id}/subscribed_apps`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${access_token}`,
          'Content-Type': 'application/json',
        }
      }
    );

    // Parse response
    const data = await response.json();

    // Check for errors
    if (!response.ok) {
      console.error('WhatsApp API error:', data);
      throw new Error(data.error?.message || 'Failed to subscribe to WhatsApp webhook');
    }

    // Return success response
    return new Response(
      JSON.stringify({
        success: true,
        result: data
      }),
      { 
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
        }
      }
    );

  } catch (error) {
    // Log error
    console.error('Error subscribing to WhatsApp webhook:', error);
    
    // Return error response
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred'
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