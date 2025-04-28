import { useState, useEffect } from 'react';
import { Search, Users, Crown, Clock, DollarSign, Trash2, AlertTriangle, Download, Eye } from 'lucide-react';
import { utils, writeFile } from 'xlsx';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { PageLayout } from '../components/layout/PageLayout';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Modal } from '../components/ui/Modal';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { formatDate } from '../utils/date';

interface Customer {
  id: string;
  name: string;
  phone: string;
  orders?: Array<{
    id: string;
    order_date: string;
    order_value: number;
    items?: Array<{
      name: string;
      quantity: number;
      price: number;
      totalPrice: number;
      observations?: string;
    }>;
    payment_method?: string;
    delivery_fee?: number;
  }>;
  last_order_date: string;
  total_orders: number;
  total_spent: number;
  segment: 'VIP' | 'Frequente' | 'Ocasional' | 'Desengajado' | 'Em risco' | 'Inativo';
  customer_since: string;
  city?: string;
  neighborhood?: string;
  address?: string;
  number?: string;
  complement?: string;
  email?: string;
  deliveryAddress?: {
    city?: string;
    neighborhood?: string;
    streetName?: string;
    streetNumber?: string;
    complement?: string;
    reference?: string;
    coordinates?: {
      latitude: number;
      longitude: number;
    };
  };
  preferences?: {
    paymentMethods?: string[];
    favoriteItems?: Array<{
      name: string;
      orderCount: number;
      lastOrdered: string;
    }>;
    allergies?: string[];
    notes?: string;
  };
  orderHistory?: Array<{
    id: string;
    date: string;
    total: number;
    items: Array<{
      name: string;
      quantity: number;
      price: number;
      notes?: string;
    }>;
    paymentMethod: string;
    deliveryFee?: number;
    status: string;
  }>;
  metrics?: {
    averageOrderValue: number;
    orderFrequency: number;
    lastVisitDays: number;
    totalCancellations: number;
    favoritePaymentMethod: string;
    preferredOrderTime?: string;
    deliveryPreference: 'delivery' | 'pickup';
  };
  tags?: string[];
}

interface ImportWarnings {
  invalidPhones: number;
  invalidNames: number;
  invalidDates: number;
  invalidTickets: number;
  invalidTotals: number;
  skippedRows: number;
}

interface ImportStatus {
  status: 'idle' | 'processing' | 'success' | 'error';
  message?: string;
  customers?: number;
  orders?: number;
  warnings?: ImportWarnings;
}

const SEGMENT_ORDER = [
  ['VIP', 'Frequente', 'Em risco'],
  ['Ocasional', 'Desengajado', 'Inativo']
] as const;

const SEGMENTS = {
  VIP: {
    color: 'bg-purple-100 text-purple-800',
    icon: Crown,
    description: 'Alta recência, frequência e valor',
  },
  Frequente: {
    color: 'bg-green-100 text-green-800',
    icon: Users,
    description: 'Compras regulares com bom valor',
  },
  'Em risco': {
    color: 'bg-yellow-100 text-yellow-800',
    icon: AlertTriangle,
    description: 'Sem compras entre 30-40 dias',
  },
  Ocasional: {
    color: 'bg-blue-100 text-blue-800',
    icon: Clock,
    description: 'Compras esporádicas',
  },
  Desengajado: {
    color: 'bg-orange-100 text-orange-800',
    icon: Clock,
    description: 'Baixo engajamento nos últimos 40 dias',
  },
  Inativo: {
    color: 'bg-gray-100 text-gray-800',
    icon: DollarSign,
    description: 'Sem compras há mais de 40 dias',
  },
} as const;

export function RFMMatrix() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedSegment, setSelectedSegment] = useState<string | null>(null);
  const [selectedCustomers, setSelectedCustomers] = useState<string[]>([]);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showResetModal, setShowResetModal] = useState(false);
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [deleteType, setDeleteType] = useState<'single' | 'multiple' | 'all'>('single');
  const [customerToDelete, setCustomerToDelete] = useState<Customer | null>(null);
  const [orderDetails, setOrderDetails] = useState<{
    items: Record<string, any[]>;
    payments: Record<string, any[]>;
  }>({
    items: {},
    payments: {}
  });
  const { user } = useAuth();

  useEffect(() => {
    if (user) {
      fetchCustomers();
    }
  }, [user]);

  const fetchCustomers = async () => {
    if (!user) return;

    try {
      const { data: customersData, error: customersError } = await supabase
        .from('customers')
        .select(`
          id,
          name,
          phone,
          city,
          neighborhood,
          created_at,
          last_order_date,
          total_orders,
          total_spent,
          orders (
            order_date,
            order_value
          )
        `)
        .eq('user_id', user.id);

      if (customersError) throw customersError;

      const totalSpent = customersData.reduce((sum, c) => sum + (c.total_spent || 0), 0);
      const totalOrders = customersData.reduce((sum, c) => sum + (c.total_orders || 0), 0);
      const baseTicket = totalOrders > 0 ? totalSpent / totalOrders : 0;

      const processedCustomers = customersData.map(customer => {
        const customerData = {
          id: customer.id,
          name: customer.name,
          phone: customer.phone,
          city: customer.city,
          neighborhood: customer.neighborhood,
          customer_since: customer.created_at,
          last_order_date: customer.last_order_date || new Date(0).toISOString(),
          total_orders: customer.total_orders || 0,
          total_spent: customer.total_spent || 0,
          segment: 'Ocasional' as Customer['segment'],
        };

        const scores = calculateRFMScores(customerData, baseTicket);
        return {
          ...customerData,
          segment: determineSegment(scores),
        };
      });

      setCustomers(processedCustomers);
    } catch (error) {
      console.error('Error fetching customers:', error);
    } finally {
      setLoading(false);
    }
  };

  const calculateRFMScores = (customer: Customer, baseTicket: number) => {
    const now = new Date();
    const lastOrderDate = new Date(customer.last_order_date);
    const daysSinceLastOrder = Math.floor((now.getTime() - lastOrderDate.getTime()) / (1000 * 60 * 60 * 24));

    if (daysSinceLastOrder > 40) {
      return { recency: 0, frequency: 0, monetary: 0, total: 0 };
    }

    if (daysSinceLastOrder >= 30 && daysSinceLastOrder <= 40) {
      return { recency: -1, frequency: 0, monetary: 0, total: -1 };
    }

    const recency = daysSinceLastOrder <= 7 ? 5 :
                   daysSinceLastOrder <= 14 ? 4 :
                   daysSinceLastOrder <= 21 ? 3 :
                   daysSinceLastOrder <= 29 ? 2 : 1;

    const frequency = customer.total_orders >= 10 ? 5 :
                     customer.total_orders >= 7 ? 4 :
                     customer.total_orders >= 4 ? 3 :
                     customer.total_orders >= 2 ? 2 : 1;

    const customerTicket = customer.total_spent / customer.total_orders;
    const monetary = customerTicket >= (baseTicket * 2) ? 5 :
                    customerTicket >= (baseTicket * 1.5) ? 4 :
                    customerTicket >= baseTicket ? 3 :
                    customerTicket >= (baseTicket * 0.5) ? 2 : 1;

    const total = recency + frequency + monetary;

    return { recency, frequency, monetary, total };
  };

  const determineSegment = (scores: { recency: number; frequency: number; monetary: number; total: number }): Customer['segment'] => {
    if (scores.recency === 0) return 'Inativo';
    if (scores.recency === -1) return 'Em risco';

    const total = scores.total;
    
    if (total >= 13) return 'VIP';
    if (total >= 10) return 'Frequente';
    if (total >= 6) return 'Ocasional';
    return 'Desengajado';
  };

  const handleDeleteCustomer = async () => {
    try {
      if (deleteType === 'single' && customerToDelete) {
        await supabase
          .from('customers')
          .delete()
          .eq('id', customerToDelete.id);
      } else if (deleteType === 'multiple') {
        await supabase
          .from('customers')
          .delete()
          .in('id', selectedCustomers);
      } else if (deleteType === 'all') {
        await supabase
          .from('customers')
          .delete()
          .eq('user_id', user?.id);
      }

      setSelectedCustomers([]);
      setCustomerToDelete(null);
      setShowDeleteModal(false);
      setShowResetModal(false);

      await fetchCustomers();
    } catch (error) {
      console.error('Error deleting customers:', error);
    }
  };

  const handleExportToExcel = () => {
    if (selectedCustomers.length === 0) return;

    const selectedCustomerData = customers
      .filter(customer => selectedCustomers.includes(customer.id))
      .map(customer => ({
        'Nome': customer.name,
        'Telefone': customer.phone,
        'Segmento': customer.segment,
        'Cliente Desde': formatDate(customer.customer_since),
        'Último Pedido': formatDate(customer.last_order_date),
        'Total de Pedidos': customer.total_orders,
        'Total Gasto': new Intl.NumberFormat('pt-BR', {
          style: 'currency',
          currency: 'BRL'
        }).format(customer.total_spent),
        'Cidade': customer.city || '',
        'Bairro': customer.neighborhood || '',
      }));

    const worksheet = utils.json_to_sheet(selectedCustomerData);
    const workbook = utils.book_new();
    utils.book_append_sheet(workbook, worksheet, 'Clientes');

    const maxWidth = 50;
    const columnsWidth = Object.keys(selectedCustomerData[0]).map(key => {
      const maxContentLength = Math.max(
        key.length,
        ...selectedCustomerData.map(row => String(row[key as keyof typeof row]).length)
      );
      return Math.min(maxContentLength + 2, maxWidth);
    });

    worksheet['!cols'] = columnsWidth.map(width => ({ width }));

    writeFile(workbook, `clientes_${format(new Date(), 'dd-MM-yyyy')}.xlsx`);
  };

  const handleViewDetails = async (customer: Customer) => {
    setSelectedCustomer(customer);
    setOrderDetails({ items: {}, payments: {} });
    setShowDetailsModal(true);

    if (customer.orders && customer.orders.length > 0) {
      try {
        // Fetch order items
        const { data: items, error: itemsError } = await supabase
          .from('order_items')
          .select('*')
          .in('order_id', customer.orders.map(o => o.id));

        if (itemsError) throw itemsError;

        // Fetch order payments
        const { data: payments, error: paymentsError } = await supabase
          .from('order_payments')
          .select('*')
          .in('order_id', customer.orders.map(o => o.id));

        if (paymentsError) throw paymentsError;

        // Group items and payments by order_id
        const itemsByOrder = items?.reduce((acc, item) => {
          acc[item.order_id] = acc[item.order_id] || [];
          acc[item.order_id].push(item);
          return acc;
        }, {} as Record<string, any[]>) || {};

        const paymentsByOrder = payments?.reduce((acc, payment) => {
          acc[payment.order_id] = acc[payment.order_id] || [];
          acc[payment.order_id].push(payment);
          return acc;
        }, {} as Record<string, any[]>) || {};

        setOrderDetails({
          items: itemsByOrder,
          payments: paymentsByOrder
        });
      } catch (error) {
        console.error('Error fetching order details:', error);
      }
    }
  };

  const filteredCustomers = customers.filter(customer => {
    const matchesSearch = searchTerm === '' || 
      customer.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      customer.phone.includes(searchTerm);
    
    const matchesSegment = !selectedSegment || customer.segment === selectedSegment;
    
    return matchesSearch && matchesSegment;
  });

  const segmentCounts = customers.reduce((acc, customer) => {
    acc[customer.segment] = (acc[customer.segment] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const handleSelectAll = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.checked) {
      setSelectedCustomers(filteredCustomers.map(c => c.id));
    } else {
      setSelectedCustomers([]);
    }
  };

  const handleSelectCustomer = (customerId: string) => {
    setSelectedCustomers(prev => 
      prev.includes(customerId)
        ? prev.filter(id => id !== customerId)
        : [...prev, customerId]
    );
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

  return (
    <PageLayout>
      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {SEGMENT_ORDER.flat().map((segment) => {
            const { icon: Icon, color, description } = SEGMENTS[segment];
            const count = segmentCounts[segment] || 0;

            return (
              <button
                key={segment}
                onClick={() => setSelectedSegment(selectedSegment === segment ? null : segment)}
                className={`relative w-full text-left transition-all duration-200 ${
                  selectedSegment === segment ? 'scale-[1.02]' : ''
                }`}
              >
                <Card className={`h-full p-6 border-2 transition-colors ${
                  selectedSegment === segment 
                    ? 'border-blue-500 ring-2 ring-blue-500 ring-opacity-50'
                    : 'border-transparent hover:border-blue-500'
                }`}>
                  <div className="flex flex-col h-full">
                    <div className="flex items-start justify-between mb-4">
                      <span className={`px-3 py-1 rounded-full text-sm font-semibold ${color}`}>
                        {segment}
                      </span>
                      <Icon className={`h-5 w-5 ${
                        color.includes('purple') ? 'text-purple-600' :
                        color.includes('green') ? 'text-green-600' :
                        color.includes('yellow') ? 'text-yellow-600' :
                        color.includes('blue') ? 'text-blue-600' :
                        color.includes('orange') ? 'text-orange-600' :
                        'text-gray-600'
                      }`} />
                    </div>
                    
                    <div className="flex-1">
                      <p className="text-4xl font-bold text-gray-900">
                        {count}
                      </p>
                      <p className="mt-1 text-sm text-gray-500">
                        {count === 1 ? 'cliente' : 'clientes'}
                      </p>
                    </div>

                    <p className="mt-4 text-sm text-gray-600 line-clamp-2">
                      {description}
                    </p>
                  </div>
                </Card>
              </button>
            );
          })}
        </div>

        <Card>
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900">
                Customers {selectedSegment ? `- ${selectedSegment}` : ''}
              </h2>
              <div className="flex items-center space-x-4">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
                  <input
                    type="text"
                    placeholder="Search customers..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10 pr-4 py-2 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
                <div className="flex space-x-2">
                  {selectedCustomers.length > 0 && (
                    <>
                      <Button
                        variant="secondary"
                        onClick={() => {
                          setDeleteType('multiple');
                          setShowDeleteModal(true);
                        }}
                      >
                        <Trash2 className="h-4 w-4 mr-2" />
                        Delete Selected ({selectedCustomers.length})
                      </Button>
                      <Button
                        variant="secondary"
                        onClick={handleExportToExcel}
                      >
                        <Download className="h-4 w-4 mr-2" />
                        Export Selected
                      </Button>
                    </>
                  )}
                  <Button
                    variant="secondary"
                    onClick={() => {
                      setDeleteType('all');
                      setShowResetModal(true);
                    }}
                  >
                    Reset Database
                  </Button>
                </div>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-200">
                    <th className="px-6 py-3 text-left">
                      <input
                        type="checkbox"
                        checked={selectedCustomers.length === filteredCustomers.length}
                        onChange={handleSelectAll}
                        className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                      />
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Customer
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Segment
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Cliente Desde
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Last Order
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Total Orders
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Total Spent
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {filteredCustomers.map((customer) => (
                    <tr key={customer.id}>
                      <td className="px-6 py-4">
                        <input
                          type="checkbox"
                          checked={selectedCustomers.includes(customer.id)}
                          onChange={() => handleSelectCustomer(customer.id)}
                          className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                        />
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center">
                          <Button
                            variant="secondary"
                            className="p-1 mr-2"
                            onClick={() => handleViewDetails(customer)}
                          >
                            <Eye className="h-4 w-4 text-gray-500" />
                          </Button>
                          <div>
                            <div className="text-sm font-medium text-gray-900">{customer.name}</div>
                            <div className="text-sm text-gray-500">{customer.phone}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${SEGMENTS[customer.segment].color}`}>
                          {customer.segment}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {formatDate(customer.customer_since)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {formatDate(customer.last_order_date)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {customer.total_orders}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {new Intl.NumberFormat('pt-BR', {
                          style: 'currency',
                          currency: 'BRL'
                        }).format(customer.total_spent)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        <Button
                          variant="secondary"
                          onClick={() => {
                            setCustomerToDelete(customer);
                            setDeleteType('single');
                            setShowDeleteModal(true);
                          }}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </Card>
      </div>

      <Modal
        isOpen={showDeleteModal}
        onClose={() => {
          setShowDeleteModal(false);
          setCustomerToDelete(null);
        }}
        title={
          deleteType === 'single'
            ? 'Delete Customer'
            : 'Delete Selected Customers'
        }
      >
        <div className="space-y-4">
          <div className="flex items-start space-x-2 text-yellow-700">
            <AlertTriangle className="h-5 w-5 mt-0.5 flex-shrink-0" />
            <div>
              <p className="font-medium">
                {deleteType === 'single'
                  ? 'Are you sure you want to delete this customer?'
                  : `Are you sure you want to delete ${selectedCustomers.length} customers?`}
              </p>
              <p className="mt-1 text-sm text-yellow-600">
                This action cannot be undone. All associated orders will also be deleted.
              </p>
            </div>
          </div>

          <div className="flex justify-end space-x-2 mt-6">
            <Button
              variant="secondary"
              onClick={() => {
                setShowDeleteModal(false);
                setCustomerToDelete(null);
              }}
            >
              Cancel
            </Button>
            <Button onClick={handleDeleteCustomer}>
              Delete
            </Button>
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={showResetModal}
        onClose={() => setShowResetModal(false)}
        title="Reset Customer Database"
      >
        <div className="space-y-4">
          <div className="flex items-start space-x-2 text-red-700">
            <AlertTriangle className="h-5 w-5 mt-0.5 flex-shrink-0" />
            <div>
              <p className="font-medium">
                Are you sure you want to reset the entire customer database?
              </p>
              <p className="mt-1 text-sm text-red-600">
                This will permanently delete all customers and their associated orders.
                This action cannot be undone.
              </p>
            </div>
          </div>

          <div className="flex justify-end space-x-2 mt-6">
            <Button
              variant="secondary"
              onClick={() => setShowResetModal(false)}
            >
              Cancel
            </Button>
            <Button onClick={handleDeleteCustomer}>
              Reset Database
            </Button>
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={showDetailsModal}
        onClose={() => {
          setShowDetailsModal(false);
          setSelectedCustomer(null);
        }}
        title="Customer Details"
      >
        {selectedCustomer && (
          <div className="space-y-6">
            <div>
              <h3 className="text-sm font-medium text-gray-900 mb-3">Basic Information</h3>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700">Name</label>
                  <p className="mt-1 text-sm text-gray-900">{selectedCustomer.name}</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Phone</label>
                  <p className="mt-1 text-sm text-gray-900">{selectedCustomer.phone}</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Email</label>
                  <p className="mt-1 text-sm text-gray-900">{selectedCustomer.email || '-'}</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Segment</label>
                  <span className={`mt-1 inline-flex px-2 text-xs leading-5 font-semibold rounded-full ${SEGMENTS[selectedCustomer.segment].color}`}>
                    {selectedCustomer.segment}
                  </span>
                </div>
              </div>
            </div>

            <div className="border-t border-gray-200 pt-4">
              <h3 className="text-sm font-medium text-gray-900 mb-3">Customer Metrics</h3>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700">Customer Since</label>
                  <p className="mt-1 text-sm text-gray-900">
                    {formatDate(selectedCustomer.customer_since)}
                  </p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Last Order</label>
                  <p className="mt-1 text-sm text-gray-900">
                    {formatDate(selectedCustomer.last_order_date)}
                  </p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Total Orders</label>
                  <p className="mt-1 text-sm text-gray-900">{selectedCustomer.total_orders}</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Total Spent</label>
                  <p className="mt-1 text-sm text-gray-900">
                    {new Intl.NumberFormat('pt-BR', {
                      style: 'currency',
                      currency: 'BRL'
                    }).format(selectedCustomer.total_spent)}
                  </p>
                </div>
                {selectedCustomer.metrics && (
                  <>
                    <div>
                      <label className="block text-sm font-medium text-gray-700">Average Order Value</label>
                      <p className="mt-1 text-sm text-gray-900">
                        {new Intl.NumberFormat('pt-BR', {
                          style: 'currency',
                          currency: 'BRL'
                        }).format(selectedCustomer.metrics.averageOrderValue)}
                      </p>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700">Order Frequency</label>
                      <p className="mt-1 text-sm text-gray-900">
                        {selectedCustomer.metrics.orderFrequency} orders/month
                      </p>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        )}
      </Modal>
    </PageLayout>
  );
}