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
  newOrders: number;
  newCustomers: number;
  skippedOrders: number;
  errors: string[];
}

function logError(context: string, error: unknown, order?: DelMatchOrder) {
  const errorMessage = error instanceof Error ? error.message : 'Unknown error';
  const errorDetails = {
    context,
    error: errorMessage,
    timestamp: new Date().toISOString(),
    order: order ? {
      reference: order.reference,
      customer: order.customer,
      totalPrice: order.totalPrice,
      items: order.items?.length,
      payments: order.payments?.length
    } : undefined
  };
  console.error('Del Match Historical Sync Error:', JSON.stringify(errorDetails, null, 2));
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
    const { data: integration, error: integrationError } = await supabase
      .from('api_integrations')
      .select('*')
      .eq('user_id', user_id)
      .single();

    if (integrationError) throw integrationError;
    if (!integration) throw new Error('Integration not found');
    if (!integration.historical_orders_url) throw new Error('Historical orders URL not configured');

    // Check if token is expired and refresh if needed
    const now = new Date();
    const tokenExpired = !integration.expires_at || new Date(integration.expires_at) <= now;

    if (tokenExpired) {
      console.log(`[Del Match] Token expired for ${integration.api_base_url}, generating new token...`);
      
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
    }

    // Fetch historical orders
    console.log(`[Del Match] Fetching historical orders from ${integration.historical_orders_url}...`);
    const ordersResponse = await fetch(integration.historical_orders_url, {
      headers: {
        'Authorization': `Bearer ${integration.token}`,
        'Accept': 'application/json',
      }
    });

    if (!ordersResponse.ok) {
      const errorData = await ordersResponse.json().catch(() => ({}));
      throw new Error(`Failed to fetch orders: ${ordersResponse.statusText} - ${JSON.stringify(errorData)}`);
    }

    const orders: DelMatchOrder[] = await ordersResponse.json();
    console.log(`[Del Match] Fetched ${orders.length} historical orders`);

    const result: SyncResult = {
      newOrders: 0,
      newCustomers: 0,
      skippedOrders: 0,
      errors: [],
    };

    for (const order of orders) {
      try {
        // Check if order already exists
        const { data: existingOrder } = await supabase
          .from('orders')
          .select('id')
          .eq('reference', order.reference)
          .maybeSingle();

        if (existingOrder) {
          result.skippedOrders++;
          continue;
        }

        // Clean and validate phone number
        const phone = order.customer.phone.replace(/\D/g, '');
        if (!phone) {
          result.errors.push(logError('Invalid phone number', new Error('Phone number is empty or invalid'), order));
          continue;
        }

        // Check if customer exists
        let customerId: string;
        const { data: existingCustomer } = await supabase
          .from('customers')
          .select('id, total_orders, total_spent, last_order_date, neighborhood, city, sistema_origem')
          .eq('user_id', user_id)
          .eq('phone', phone)
          .maybeSingle();

        if (existingCustomer) {
          // Update existing customer
          const { error: updateError } = await supabase
            .from('customers')
            .update({
              name: order.customer.name,
              total_orders: (existingCustomer.total_orders || 0) + 1,
              total_spent: (existingCustomer.total_spent || 0) + order.totalPrice,
              last_order_date: new Date(order.createdAt).toISOString(),
              neighborhood: order.deliveryAddress?.neighboardhood || existingCustomer.neighborhood,
              city: order.deliveryAddress?.city || existingCustomer.city,
              sistema_origem: existingCustomer.sistema_origem === 'csv_import' ? 'mixed' : 'delmatch',
              updated_at: now.toISOString(),
            })
            .eq('id', existingCustomer.id);

          if (updateError) throw updateError;
          
          customerId = existingCustomer.id;

          // Log customer update
          await supabase.from('operation_logs').insert({
            operation: 'update_customer_historical',
            entity_type: 'customer',
            entity_id: customerId,
            details: {
              source: 'delmatch_historical',
              previous_total_orders: existingCustomer.total_orders,
              new_total_orders: (existingCustomer.total_orders || 0) + 1,
              previous_total_spent: existingCustomer.total_spent,
              new_total_spent: (existingCustomer.total_spent || 0) + order.totalPrice,
              previous_sistema_origem: existingCustomer.sistema_origem,
              new_sistema_origem: existingCustomer.sistema_origem === 'csv_import' ? 'mixed' : 'delmatch'
            }
          });
        } else {
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
              sistema_origem: 'delmatch',
            })
            .select()
            .single();

          if (createError) throw createError;
          
          customerId = newCustomer.id;
          result.newCustomers++;

          // Log new customer creation
          await supabase.from('operation_logs').insert({
            operation: 'create_customer_historical',
            entity_type: 'customer',
            entity_id: customerId,
            details: {
              source: 'delmatch_historical',
              initial_total_orders: 1,
              initial_total_spent: order.totalPrice
            }
          });
        }

        // Create order record
        const { data: createdOrder, error: orderError } = await supabase
          .from('orders')
          .insert({
            customer_id: customerId,
            reference: order.reference.toString(),
            order_date: new Date(order.createdAt).toISOString(),
            order_value: order.totalPrice,
            delivery_fee: order.deliveryFee,
          })
          .select()
          .single();

        if (orderError) throw orderError;

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

          const { error: itemsError } = await supabase
            .from('order_items')
            .insert(allItems);

          if (itemsError) {
            throw new Error(`Failed to insert items: ${itemsError.message}`);
          }
        }

        // Process payments
        if (order.payments && order.payments.length > 0) {
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
            throw new Error(`Failed to insert payments: ${paymentsError.message}`);
          }
        }

        // Log order creation
        await supabase.from('operation_logs').insert({
          operation: 'create_order_historical',
          entity_type: 'order',
          entity_id: createdOrder.id,
          details: {
            source: 'delmatch_historical',
            customer_id: customerId,
            reference: order.reference,
            total_price: order.totalPrice,
            items_count: order.items?.length || 0,
            payments_count: order.payments?.length || 0
          }
        });

        result.newOrders++;
      } catch (error) {
        result.errors.push(logError('Error processing historical order', error, order));
      }
    }

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
    console.error('[Del Match] Historical sync error:', error);
    
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