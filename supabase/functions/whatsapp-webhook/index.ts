import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'npm:@supabase/supabase-js@2.39.7';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
};

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // Handle webhook verification (GET request)
  if (req.method === 'GET') {
    const url = new URL(req.url);
    const mode = url.searchParams.get('hub.mode');
    const token = url.searchParams.get('hub.verify_token');
    const challenge = url.searchParams.get('hub.challenge');

    // Verify token (should match your configured webhook verification token)
    if (mode === 'subscribe' && token === Deno.env.get('WHATSAPP_VERIFY_TOKEN')) {
      return new Response(challenge, { 
        headers: {
          ...corsHeaders,
          'Content-Type': 'text/plain',
        }
      });
    }

    return new Response('Invalid verification token', { 
      status: 403,
      headers: corsHeaders,
    });
  }

  // Handle incoming messages (POST request)
  if (req.method === 'POST') {
    try {
      const payload = await req.json();
      console.log('Received webhook:', JSON.stringify(payload, null, 2));

      // Validate payload structure
      if (!payload.entry?.[0]?.changes?.[0]?.value?.messages?.[0]) {
        return new Response('Invalid payload structure', { 
          status: 400,
          headers: corsHeaders,
        });
      }

      const message = payload.entry[0].changes[0].value.messages[0];
      const phoneNumberId = payload.entry[0].changes[0].value.metadata.phone_number_id;

      // Initialize Supabase client
      const supabase = createClient(
        Deno.env.get('SUPABASE_URL') ?? '',
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
        {
          auth: {
            persistSession: false,
          }
        }
      );

      // Get user_id from whatsapp_connections
      const { data: connection, error: connectionError } = await supabase
        .from('whatsapp_connections')
        .select('user_id')
        .eq('phone_number_id', phoneNumberId)
        .single();

      if (connectionError || !connection) {
        console.error('Connection not found:', connectionError);
        throw new Error('WhatsApp connection not found');
      }

      const userId = connection.user_id;
      const customerPhone = message.from;
      const messageBody = message.text?.body;
      const timestamp = new Date(parseInt(message.timestamp) * 1000).toISOString();

      // Get or create conversation
      let conversationId: string;
      const { data: existingConversation } = await supabase
        .from('conversations')
        .select('id')
        .eq('user_id', userId)
        .eq('whatsapp_number', customerPhone)
        .maybeSingle();

      if (existingConversation) {
        conversationId = existingConversation.id;
        
        // Update last_message_at
        await supabase
          .from('conversations')
          .update({ 
            last_message_at: timestamp,
            status: 'open'
          })
          .eq('id', conversationId);
      } else {
        // Try to find customer by phone
        const { data: customer } = await supabase
          .from('customers')
          .select('id')
          .eq('user_id', userId)
          .eq('phone', customerPhone)
          .maybeSingle();

        // Create new conversation
        const { data: newConversation, error: conversationError } = await supabase
          .from('conversations')
          .insert({
            user_id: userId,
            customer_id: customer?.id,
            whatsapp_number: customerPhone,
            last_message_at: timestamp,
            status: 'open'
          })
          .select()
          .single();

        if (conversationError || !newConversation) {
          throw new Error('Failed to create conversation');
        }

        conversationId = newConversation.id;
      }

      // Store the message
      const { error: messageError } = await supabase
        .from('messages')
        .insert({
          conversation_id: conversationId,
          from_me: false,
          type: 'text',
          body: messageBody,
          status: 'received',
          timestamp
        });

      if (messageError) {
        throw messageError;
      }

      // Log successful processing
      console.log('Message processed successfully:', {
        user_id: userId,
        conversation_id: conversationId,
        customer_phone: customerPhone,
        timestamp
      });

      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      });

    } catch (error) {
      console.error('Error processing webhook:', error);
      
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: error instanceof Error ? error.message : 'Unknown error'
        }),
        {
          status: 500,
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json'
          }
        }
      );
    }
  }

  // Handle unsupported methods
  return new Response('Method not allowed', { 
    status: 405,
    headers: corsHeaders
  });
});