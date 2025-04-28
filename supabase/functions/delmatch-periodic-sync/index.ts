import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'npm:@supabase/supabase-js@2.39.7';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

// Add cron trigger to run every hour
Deno.cron("Hourly Del Match Sync", "0 * * * *", async () => {
  try {
    console.log('[Del Match] Starting scheduled sync...');

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      {
        auth: {
          persistSession: false,
        }
      }
    );

    // Get all active integrations with sync enabled
    const { data: integrations, error: integrationError } = await supabase
      .from('api_integrations')
      .select('user_id, updated_at')
      .eq('sync_enabled', true)
      .not('token', 'is', null);

    if (integrationError) throw integrationError;

    console.log(`[Del Match] Found ${integrations?.length || 0} active integrations`);

    const now = new Date();
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000); // 1 hour ago

    const syncPromises = integrations?.map(async (integration) => {
      try {
        const lastUpdate = new Date(integration.updated_at);

        // Skip if last update was less than 1 hour ago
        if (lastUpdate > oneHourAgo) {
          console.log(`[Del Match] Skipping sync for user ${integration.user_id} - last update was ${lastUpdate.toISOString()}`);
          return;
        }

        console.log(`[Del Match] Syncing data for user ${integration.user_id}...`);

        // Call the sync endpoint
        const response = await fetch(
          `${Deno.env.get('SUPABASE_URL')}/functions/v1/fetch-delmatch-orders`,
          {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${Deno.env.get('SUPABASE_ANON_KEY')}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ user_id: integration.user_id }),
          }
        );

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(`Sync failed: ${response.statusText} - ${JSON.stringify(errorData)}`);
        }

        const result = await response.json();
        console.log(`[Del Match] Sync completed for user ${integration.user_id}:`, result);

        // Update last_sync_at timestamp
        const { error: updateError } = await supabase
          .from('api_integrations')
          .update({ 
            last_sync_at: now.toISOString() 
          })
          .eq('user_id', integration.user_id);

        if (updateError) {
          console.error(`[Del Match] Error updating last_sync_at:`, updateError);
        }

        // Log the sync operation
        await supabase.from('operation_logs').insert({
          operation: 'periodic_sync',
          entity_type: 'integration',
          entity_id: integration.user_id,
          details: {
            result,
            sync_time: now.toISOString()
          }
        });

      } catch (error) {
        console.error(`[Del Match] Error syncing user ${integration.user_id}:`, error);
        
        // Log the error
        await supabase.from('operation_logs').insert({
          operation: 'periodic_sync_error',
          entity_type: 'integration',
          entity_id: integration.user_id,
          details: {
            error: error instanceof Error ? error.message : 'Unknown error',
            sync_time: now.toISOString()
          }
        });
      }
    }) || [];

    // Wait for all syncs to complete
    await Promise.all(syncPromises);

    console.log('[Del Match] Scheduled sync completed successfully');

  } catch (error) {
    console.error('[Del Match] Scheduled sync error:', error);
  }
});

// Keep the HTTP endpoint for manual triggers
serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('[Del Match] Starting periodic sync...');

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      {
        auth: {
          persistSession: false,
        }
      }
    );

    // Get all active integrations
    const { data: integrations, error: integrationError } = await supabase
      .from('api_integrations')
      .select('user_id, updated_at')
      .not('token', 'is', null);

    if (integrationError) throw integrationError;

    console.log(`[Del Match] Found ${integrations?.length || 0} active integrations`);

    const now = new Date();
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000); // 1 hour ago

    const syncPromises = integrations?.map(async (integration) => {
      try {
        const lastUpdate = new Date(integration.updated_at);

        // Skip if last update was less than 1 hour ago
        if (lastUpdate > oneHourAgo) {
          console.log(`[Del Match] Skipping sync for user ${integration.user_id} - last update was ${lastUpdate.toISOString()}`);
          return;
        }

        console.log(`[Del Match] Syncing data for user ${integration.user_id}...`);

        // Call the sync endpoint
        const response = await fetch(
          `${Deno.env.get('SUPABASE_URL')}/functions/v1/fetch-delmatch-orders`,
          {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${Deno.env.get('SUPABASE_ANON_KEY')}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ user_id: integration.user_id }),
          }
        );

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(`Sync failed: ${response.statusText} - ${JSON.stringify(errorData)}`);
        }

        const result = await response.json();
        console.log(`[Del Match] Sync completed for user ${integration.user_id}:`, result);

        // Log the sync operation
        await supabase.from('operation_logs').insert({
          operation: 'periodic_sync',
          entity_type: 'integration',
          entity_id: integration.user_id,
          details: {
            result,
            sync_time: now.toISOString()
          }
        });

      } catch (error) {
        console.error(`[Del Match] Error syncing user ${integration.user_id}:`, error);
        
        // Log the error
        await supabase.from('operation_logs').insert({
          operation: 'periodic_sync_error',
          entity_type: 'integration',
          entity_id: integration.user_id,
          details: {
            error: error instanceof Error ? error.message : 'Unknown error',
            sync_time: now.toISOString()
          }
        });
      }
    }) || [];

    // Wait for all syncs to complete
    await Promise.all(syncPromises);

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Periodic sync completed',
        synced_integrations: integrations?.length || 0,
        sync_time: now.toISOString()
      }),
      { 
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
        }
      }
    );

  } catch (error) {
    console.error('[Del Match] Fatal error:', error);
    
    return new Response(
      JSON.stringify({ 
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
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