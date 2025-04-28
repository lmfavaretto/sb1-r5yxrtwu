import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'npm:@supabase/supabase-js@2.39.7';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

interface DelMatchOrder {
  id: number;
  reference: string;
  createdAt: string;
  totalPrice: number;
  deliveryFee: number;
  payments: Array<{
    name: string;
    code: string;
    value: number;
    prepaid: boolean;
    issuer: string;
  }>;
  customer: {
    id?: string;
    name: string;
    phone: string;
    email: string;
    total_orders: number;
  };
  items: Array<{
    id: number;
    name: string;
    quantity: number;
    price: number;
    totalPrice: number;
    discount: number;
    addition: number;
    observations: string;
    subItems?: Array<{
      id: number;
      name: string;
      quantity: number;
      price: number;
      totalPrice: string;
      group: string;
    }>;
  }>;
  deliveryAddress?: {
    city?: string;
    neighboardhood?: string;
    streetName?: string;
    streetNumber?: string;
    complement?: string;
  };
}

interface SyncResult {
  newCustomers: number;
  updatedCustomers: number;
  newOrders: number;
  skippedOrders: number;
  errors: string[];
}

function logError(context: string, error: unknown, order?: DelMatchOrder) {
  const errorMessage = error instanceof Error ? error.message : JSON.stringify(error);
  const errorDetails = {
    context,
    error: errorMessage,
    timestamp: new Date().toISOString(),
    order: order ? {
      reference: order.reference,
      customer: {
        id: order.customer.id,
        phone: order.customer.phone,
        name: order.customer.name
      },
      totalPrice: order.totalPrice,
      items: order.items?.length,
      payments: order.payments?.length
    } : undefined
  };
  console.error('Del Match Sync Error:', JSON.stringify(errorDetails, null, 2));
  return `${context}: ${errorMessage}`;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { user_id } = await req.json();

    if (!user_id) {
      throw new Error('User ID is required');
    }

    console.log(`[Del Match] Starting sync for user ${user_id}`);

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      {
        auth: {
          persistSession: false,
        }
      }
    );

    // Get integration credentials
    console.log(`[Del Match] Fetching integration details for user ${user_id}`);
    const { data: integration, error: integrationError } = await supabase
      .from('api_integrations')
      .select('*')
      .eq('user_id', user_id)
      .single();

    if (integrationError) {
      console.error(`[Del Match] Failed to fetch integration:`, integrationError);
      throw integrationError;
    }
    if (!integration) {
      throw new Error('Integration not found');
    }

    const now = new Date();
    const tokenExpired = !integration.expires_at || new Date(integration.expires_at) <= now;

    if (tokenExpired) {
      console.log(`[Del Match] Token expired for ${integration.api_base_url}, refreshing...`);
      
      const authResponse = await fetch(`https://${integration.api_base_url}/api/oauth/token.json`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify({
          grant_type: 'password',
          username: integration.email,
          password: integration.password,
        }),
      });

      if (!authResponse.ok) {
        const errorData = await authResponse.json().catch(() => ({}));
        throw new Error(`Authentication failed: ${authResponse.statusText} - ${JSON.stringify(errorData)}`);
      }

      const authData = await authResponse.json();
      
      if (!authData.token) {
        throw new Error('Authentication failed: No token received');
      }

      console.log(`[Del Match] New token generated, updating integration record...`);
      const { error: updateError } = await supabase
        .from('api_integrations')
        .update({
          token: authData.token,
          expires_at: new Date(authData.expires * 1000).toISOString(),
          updated_at: now.toISOString(),
        })
        .eq('id', integration.id);

      if (updateError) throw updateError;
      
      integration.token = authData.token;
      console.log(`[Del Match] Integration record updated successfully`);
    }

    console.log(`[Del Match] Fetching orders from ${integration.api_base_url}...`);
    const ordersResponse = await fetch(
      `https://${integration.api_base_url}/api/orders.json`,
      {
        headers: {
          'Authorization': `Bearer ${integration.token}`,
          'Accept': 'application/json',
        }
      }
    );

    if (!ordersResponse.ok) {
      const errorData = await ordersResponse.json().catch(() => ({}));
      throw new Error(`Failed to fetch orders: ${ordersResponse.statusText} - ${JSON.stringify(errorData)}`);
    }

    const orders: DelMatchOrder[] = await ordersResponse.json();
    console.log(`[Del Match] Fetched ${orders.length} orders from ${integration.api_base_url}`);

    const result: SyncResult = {
      newCustomers: 0,
      updatedCustomers: 0,
      newOrders: 0,
      skippedOrders: 0,
      errors: [],
    };

    for (const order of orders) {
      try {
        console.log(`[Del Match] Processing order ${order.reference}...`);

        // Skip if we've already processed this order
        if (integration.last_order_reference && order.reference <= integration.last_order_reference) {
          console.log(`[Del Match] Order ${order.reference} already processed, skipping...`);
          result.skippedOrders++;
          continue;
        }

        // Clean and validate phone number
        const phone = order.customer.id || order.customer.phone?.replace(/\D/g, '');
        if (!phone) {
          const errorMsg = `Invalid phone number for order ${order.reference}: "${order.customer.phone}"`;
          console.error(errorMsg);
          result.errors.push(errorMsg);
          continue;
        }

        // Check if customer exists
        console.log(`[Del Match] Looking up customer with phone ${phone}...`);
        const { data: existingCustomer, error: lookupError } = await supabase
          .from('customers')
          .select('*')  // Select all fields to ensure schema cache is updated
          .eq('user_id', user_id)
          .eq('phone', phone)
          .maybeSingle();

        if (lookupError) {
          console.error(`[Del Match] Error looking up customer:`, lookupError);
          result.errors.push(logError('Customer lookup failed', lookupError, order));
          continue;
        }

        let customerId: string;

        if (existingCustomer) {
          console.log(`[Del Match] Found existing customer:`, {
            id: existingCustomer.id,
            current_orders: existingCustomer.total_orders,
            current_spent: existingCustomer.total_spent
          });

          // Update existing customer
          const updateData = {
            name: order.customer.name,
            total_orders: (existingCustomer.total_orders || 0) + 1,
            total_spent: (existingCustomer.total_spent || 0) + order.totalPrice,
            last_order_date: new Date(order.createdAt).toISOString(),
            neighborhood: order.deliveryAddress?.neighboardhood || existingCustomer.neighborhood,
            city: order.deliveryAddress?.city || existingCustomer.city,
            sistema_origem: existingCustomer.sistema_origem === 'csv_import' ? 'mixed' : 'delmatch'
          };

          console.log(`[Del Match] Updating customer with data:`, updateData);

          const { error: updateError } = await supabase
            .from('customers')
            .update(updateData)
            .eq('id', existingCustomer.id);

          if (updateError) {
            console.error(`[Del Match] Error updating customer:`, updateError);
            result.errors.push(logError('Failed to update customer', updateError, order));
            continue;
          }

          customerId = existingCustomer.id;
          result.updatedCustomers++;

          console.log(`[Del Match] Customer updated successfully`);

          // Log customer update
          await supabase.from('operation_logs').insert({
            operation: 'update_customer',
            entity_type: 'customer',
            entity_id: customerId,
            details: {
              source: 'delmatch',
              previous_total_orders: existingCustomer.total_orders,
              new_total_orders: (existingCustomer.total_orders || 0) + 1,
              previous_total_spent: existingCustomer.total_spent,
              new_total_spent: (existingCustomer.total_spent || 0) + order.totalPrice,
              previous_sistema_origem: existingCustomer.sistema_origem,
              new_sistema_origem: existingCustomer.sistema_origem === 'csv_import' ? 'mixed' : 'delmatch'
            }
          });
        } else {
          console.log(`[Del Match] Creating new customer for phone ${phone}...`);

          // Create new customer
          const { data: newCustomer, error: createError } = await supabase
            .from('customers')
            .insert({
              user_id,
              name: order.customer.name,
              phone,
              email: order.customer.email,
              neighborhood: order.deliveryAddress?.neighboardhood,
              city: order.deliveryAddress?.city,
              created_at: new Date(order.createdAt).toISOString(),
              last_order_date: new Date(order.createdAt).toISOString(),
              total_orders: 1,
              total_spent: order.totalPrice,
              sistema_origem: 'delmatch'
            })
            .select()
            .single();

          if (createError || !newCustomer) {
            console.error(`[Del Match] Error creating customer:`, createError);
            result.errors.push(logError('Failed to create customer', createError || new Error('Empty newCustomer'), order));
            continue;
          }

          customerId = newCustomer.id;
          result.newCustomers++;

          console.log(`[Del Match] New customer created with ID ${customerId}`);

          // Log new customer creation
          await supabase.from('operation_logs').insert({
            operation: 'create_customer',
            entity_type: 'customer',
            entity_id: customerId,
            details: {
              source: 'delmatch',
              initial_total_orders: 1,
              initial_total_spent: order.totalPrice
            }
          });
        }

        if (!customerId) {
          const errorMsg = `Customer ID is undefined after insert/update for order ${order.reference}`;
          console.error(errorMsg);
          result.errors.push(errorMsg);
          continue;
        }

        console.log(`[Del Match] Creating order for customer ${customerId}...`);

        // Create order record
        const { data: createdOrder, error: orderError } = await supabase
          .from('orders')
          .insert({
            customer_id: customerId,
            reference: order.reference.toString(),
            order_date: new Date(order.createdAt).toISOString(),
            order_value: order.totalPrice,
            delivery_fee: order.deliveryFee ?? 0,
          })
          .select()
          .single();

        if (orderError || !createdOrder) {
          console.error(`[Del Match] Error creating order:`, orderError);
          result.errors.push(logError('Failed to create order', orderError || new Error('Empty order response'), order));
          continue;
        }

        console.log(`[Del Match] Order created successfully, processing items...`);

        // Process order items
        if (order.items && order.items.length > 0) {
          const allItems = order.items.flatMap(item => {
            const mainItem = {
              order_id: createdOrder.id,
              name: item.name,
              quantity: item.quantity,
              price: item.price,
              total_price: item.totalPrice,
              discount: item.discount || 0,
              addition: item.addition || 0,
              external_code: item.id?.toString(),
              observations: item.observations || null,
            };

            const subItems = (item.subItems || []).map(subItem => ({
              order_id: createdOrder.id,
              name: `${subItem.name} (${subItem.group})`,
              quantity: subItem.quantity,
              price: parseFloat(subItem.totalPrice) || subItem.price || 0,
              total_price: parseFloat(subItem.totalPrice) || (subItem.price * subItem.quantity) || 0,
              discount: 0,
              addition: 0,
              external_code: subItem.id?.toString(),
              observations: null,
            }));

            return [mainItem, ...subItems];
          });

          console.log(`[Del Match] Inserting ${allItems.length} order items...`);

          const { error: itemsError } = await supabase
            .from('order_items')
            .insert(allItems);

          if (itemsError) {
            console.error(`[Del Match] Error inserting order items:`, itemsError);
            result.errors.push(logError('Failed to insert order items', itemsError, order));
            continue;
          }
        }

        // Process payments
        if (order.payments && order.payments.length > 0) {
          console.log(`[Del Match] Processing ${order.payments.length} payments...`);

          const orderPayments = order.payments.map(payment => ({
            order_id: createdOrder.id,
            name: payment.name,
            value: payment.value,
            prepaid: payment.prepaid,
            issuer: payment.issuer || payment.code,
          }));

          const { error: paymentsError } = await supabase
            .from('order_payments')
            .insert(orderPayments);

          if (paymentsError) {
            console.error(`[Del Match] Error inserting payments:`, paymentsError);
            result.errors.push(logError('Failed to insert payments', paymentsError, order));
            continue;
          }
        }

        // Log order creation
        await supabase.from('operation_logs').insert({
          operation: 'create_order',
          entity_type: 'order',
          entity_id: createdOrder.id,
          details: {
            source: 'delmatch',
            customer_id: customerId,
            reference: order.reference,
            total_price: order.totalPrice,
            items_count: order.items?.length || 0,
            payments_count: order.payments?.length || 0
          }
        });

        result.newOrders++;
        console.log(`[Del Match] Order ${order.reference} processed successfully`);

      } catch (error) {
        console.error(`[Del Match] Unexpected error processing order ${order.reference}:`, error);
        result.errors.push(logError('Unexpected error', error, order));
      }
    }

    // Update last processed order reference
    if (orders.length > 0) {
      const lastReference = Math.max(...orders.map(o => parseInt(o.reference)));
      console.log(`[Del Match] Updating last_order_reference to ${lastReference}`);
      const { error: updateRefError } = await supabase
        .from('api_integrations')
        .update({
          last_order_reference: lastReference.toString(),
          updated_at: now.toISOString(),
        })
        .eq('id', integration.id);

      if (updateRefError) {
        console.error(`[Del Match] Error updating last_order_reference:`, updateRefError);
        result.errors.push(logError('Failed to update last_order_reference', updateRefError));
      }
    }

    console.log(`[Del Match] Sync completed:`, {
      newCustomers: result.newCustomers,
      updatedCustomers: result.updatedCustomers,
      newOrders: result.newOrders,
      skippedOrders: result.skippedOrders,
      errors: result.errors.length
    });

    return new Response(
      JSON.stringify({
        success: true,
        ...result,
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