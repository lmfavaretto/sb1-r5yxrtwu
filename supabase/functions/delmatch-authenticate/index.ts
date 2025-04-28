import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

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
    const { api_base_url, email, password } = await req.json();

    if (!api_base_url || !email || !password) {
      throw new Error('Missing required fields');
    }

    // Normalize and validate URL
    const cleanUrl = api_base_url.replace(/^https?:\/\//, '').replace(/\/$/, '');
    const domainPattern = /^[a-zA-Z0-9-]+\.delmatchcardapio\.com$/;
    
    if (!domainPattern.test(cleanUrl)) {
      throw new Error('Invalid Del Match URL format');
    }

    // Make authentication request to Del Match
    const response = await fetch(`https://${cleanUrl}/api/oauth/token.json`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify({
        grant_type: 'password',
        username: email,
        password: password,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || `Authentication failed: ${response.statusText}`);
    }

    const data = await response.json();

    if (!data.token) {
      throw new Error('Invalid response from Del Match API');
    }

    return new Response(
      JSON.stringify({
        success: true,
        token: data.token,
        expires: data.expires,
      }),
      { 
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
        }
      }
    );

  } catch (error) {
    console.error('Authentication error:', error);
    
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Authentication failed',
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