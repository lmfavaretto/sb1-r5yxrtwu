import { useState, useEffect } from 'react';
import { Users, DollarSign, TrendingUp, AlertTriangle, Coins, BarChart as ChartBar } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { PageLayout } from '../components/layout/PageLayout';
import { Card, KPICard } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';

interface DashboardData {
  totalCustomers: number;
  activeCustomers: number;
  averageTicket: number;
  retentionRate: number;
  averageLtv: number;
  segmentData: {
    name: string;
    size: number;
    value: number;
  }[];
}

const INITIAL_DATA: DashboardData = {
  totalCustomers: 0,
  activeCustomers: 0,
  averageTicket: 0,
  retentionRate: 0,
  averageLtv: 0,
  segmentData: [],
};

const SEGMENT_COLORS = {
  'VIP': '#9333EA',
  'Frequente': '#22C55E',
  'Ocasional': '#3B82F6',
  'Inativo': '#6B7280'
} as const;

export function Dashboard() {
  const [data, setData] = useState<DashboardData>(INITIAL_DATA);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { user } = useAuth();

  useEffect(() => {
    if (user) {
      fetchDashboardData();
    }
  }, [user]);

  const fetchDashboardData = async () => {
    try {
      setLoading(true);
      setError(null);

      const { data: customers, error: customersError } = await supabase
        .from('customers')
        .select(`
          id,
          name,
          created_at,
          last_order_date,
          total_orders,
          total_spent,
          orders (
            order_date,
            order_value
          )
        `)
        .eq('user_id', user?.id);

      if (customersError) throw customersError;

      const now = new Date();
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      const fortyDaysAgo = new Date(now.getTime() - 40 * 24 * 60 * 60 * 1000);

      const totalRevenue = customers?.reduce((sum, customer) => {
        return sum + (customer.total_spent || 0);
      }, 0) || 0;

      const totalOrders = customers?.reduce((sum, customer) => {
        return sum + (customer.total_orders || 0);
      }, 0) || 0;

      const averageOrderValue = totalOrders > 0 ? totalRevenue / totalOrders : 0;
      const averageLtv = customers?.length ? totalRevenue / customers.length : 0;

      const retainedCustomers = customers?.filter(customer => {
        return (
          (customer.total_orders || 0) >= 2 &&
          customer.last_order_date &&
          new Date(customer.last_order_date) >= thirtyDaysAgo
        );
      }).length || 0;

      const retentionRate = customers?.length 
        ? (retainedCustomers / customers.length) * 100 
        : 0;

      let reactivatedCustomers = 0;
      const segmentCounts: Record<string, number> = {};
      const segmentValues: Record<string, number> = {};

      customers?.forEach(customer => {
        const orders = customer.orders || [];
        if (orders.length >= 2) {
          const sortedOrders = orders
            .map(o => new Date(o.order_date))
            .sort((a, b) => b.getTime() - a.getTime());

          const lastOrder = sortedOrders[0];
          if (lastOrder && lastOrder >= thirtyDaysAgo) {
            const previousOrder = sortedOrders[1];
            if (previousOrder) {
              const daysBetweenOrders = Math.floor(
                (lastOrder.getTime() - previousOrder.getTime()) / (1000 * 60 * 60 * 24)
              );

              if (daysBetweenOrders >= 40) {
                reactivatedCustomers++;
              }
            }
          }
        }

        const totalSpent = customer.total_spent || 0;
        const totalCustomerOrders = customer.total_orders || 0;
        
        let segment = 'Ocasional';
        if (totalCustomerOrders >= 10 && totalSpent >= 5000) {
          segment = 'VIP';
        } else if (totalCustomerOrders >= 5 && totalSpent >= 2000) {
          segment = 'Frequente';
        } else if (!customer.last_order_date || new Date(customer.last_order_date) < fortyDaysAgo) {
          segment = 'Inativo';
        }

        segmentCounts[segment] = (segmentCounts[segment] || 0) + 1;
        segmentValues[segment] = (segmentValues[segment] || 0) + totalSpent;
      });

      const segmentData = Object.entries(segmentCounts)
        .map(([name, size]) => ({
          name,
          size,
          value: segmentValues[name] || 0,
        }))
        .sort((a, b) => b.value - a.value); // Sort by value descending

      setData({
        totalCustomers: customers?.length || 0,
        activeCustomers: reactivatedCustomers,
        averageTicket: averageOrderValue,
        retentionRate: Number(retentionRate.toFixed(2)),
        averageLtv,
        segmentData,
      });

    } catch (error) {
      console.error('Error fetching dashboard data:', error);
      setError(error instanceof Error ? error.message : 'Failed to fetch dashboard data');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <PageLayout>
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-2 border-blue-600 border-t-transparent" />
        </div>
      </PageLayout>
    );
  }

  if (error) {
    return (
      <PageLayout>
        <div className="max-w-2xl mx-auto">
          <Card>
            <div className="text-center p-6">
              <AlertTriangle className="mx-auto h-12 w-12 text-red-500" />
              <h2 className="mt-4 text-xl font-semibold text-gray-900">
                Error Loading Dashboard
              </h2>
              <p className="mt-2 text-gray-600">{error}</p>
              <Button
                className="mt-6"
                onClick={() => window.location.reload()}
              >
                Try Again
              </Button>
            </div>
          </Card>
        </div>
      </PageLayout>
    );
  }

  return (
    <PageLayout>
      <div className="space-y-8">
        {/* KPI Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <KPICard
            title="Total de Clientes"
            value={data.totalCustomers}
            icon={<Users className="h-6 w-6" />}
          />
          <KPICard
            title="Ticket Médio"
            value={new Intl.NumberFormat('pt-BR', {
              style: 'currency',
              currency: 'BRL'
            }).format(data.averageTicket)}
            icon={<DollarSign className="h-6 w-6" />}
          />
          <KPICard
            title="LTV Médio dos Clientes"
            value={new Intl.NumberFormat('pt-BR', {
              style: 'currency',
              currency: 'BRL'
            }).format(data.averageLtv)}
            icon={<Coins className="h-6 w-6" />}
            subtitle="Valor médio gerado por cliente"
          />
          <KPICard
            title="Taxa de Retenção"
            value={`${data.retentionRate}%`}
            icon={<Users className="h-6 w-6" />}
            subtitle={`de ${data.totalCustomers} clientes na base`}
          />
          <KPICard
            title="Clientes Reativados"
            value={data.activeCustomers}
            icon={<TrendingUp className="h-6 w-6" />}
            subtitle={`${data.activeCustomers} clientes voltaram a comprar nos últimos 30 dias`}
          />
        </div>

        {/* RFM Distribution Chart */}
        <Card className="p-6">
          <div className="space-y-6">
            <div className="flex items-center gap-2">
              <ChartBar className="h-6 w-6 text-gray-500" />
              <h2 className="text-lg font-semibold text-gray-900">
                Receita por Perfil de Cliente (RFM)
              </h2>
            </div>

            <div className="h-[400px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={data.segmentData}
                  layout="vertical"
                  margin={{ top: 20, right: 30, left: 40, bottom: 5 }}
                >
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                  <XAxis
                    type="number"
                    tickFormatter={(value) => 
                      new Intl.NumberFormat('pt-BR', {
                        style: 'currency',
                        currency: 'BRL',
                        notation: 'compact',
                        maximumFractionDigits: 1
                      }).format(value)
                    }
                  />
                  <YAxis
                    dataKey="name"
                    type="category"
                    width={100}
                    tick={{ fill: '#374151', fontSize: 12 }}
                  />
                  <Tooltip
                    formatter={(value) => 
                      new Intl.NumberFormat('pt-BR', {
                        style: 'currency',
                        currency: 'BRL'
                      }).format(value)
                    }
                    labelStyle={{ color: '#374151' }}
                    contentStyle={{
                      backgroundColor: 'white',
                      border: '1px solid #E5E7EB',
                      borderRadius: '0.5rem',
                      padding: '0.5rem'
                    }}
                  />
                  <Bar
                    dataKey="value"
                    fill="#3B82F6"
                    radius={[4, 4, 4, 4]}
                    barSize={32}
                  >
                    {data.segmentData.map((entry, index) => (
                      <Cell 
                        key={`cell-${index}`} 
                        fill={SEGMENT_COLORS[entry.name as keyof typeof SEGMENT_COLORS] || '#3B82F6'} 
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="flex flex-wrap gap-4">
              {Object.entries(SEGMENT_COLORS).map(([name, color]) => (
                <div key={name} className="flex items-center gap-2">
                  <div 
                    className="w-3 h-3 rounded-full" 
                    style={{ backgroundColor: color }}
                  />
                  <span className="text-sm text-gray-600">{name}</span>
                </div>
              ))}
            </div>
          </div>
        </Card>
      </div>
    </PageLayout>
  );
}