import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { PageLayout } from '../../components/layout/PageLayout';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { ArrowLeft, Calendar } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import toast from 'react-hot-toast';
import { format, parse } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface CampaignParams {
  template: string;
  segment: string;
  message: string;
  criteria: Record<string, any>;
}

type SendType = 'now' | 'schedule';

function parseDateToISO(dateStr: string) {
  try {
    const parsedDate = parse(dateStr, 'dd/MM/yyyy', new Date());
    return format(parsedDate, 'yyyy-MM-dd');
  } catch (error) {
    console.error('Error parsing date:', error);
    throw new Error('Data inválida');
  }
}

async function filterCustomers(supabase: any, userId: string, criteria: Record<string, any>) {
  // Start with base query
  let query = supabase
    .from('customers')
    .select('id')
    .eq('user_id', userId);

  // Add specific customer filter if provided
  if (criteria.customer_id) {
    query = query.eq('id', criteria.customer_id);
  }

  // Add total spent filter if provided
  if (criteria.total_spent) {
    query = query.gte('total_spent', parseFloat(criteria.total_spent));
  }

  // Add last order date filter if provided
  if (criteria.last_order) {
    const isoDate = parseDateToISO(criteria.last_order);
    query = query.eq('last_order_date', isoDate);
  }

  // Get filtered customers
  const { data: customers, error } = await query;

  if (error) throw error;
  return customers || [];
}

export function AutoCampaign() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [params, setParams] = useState<CampaignParams | null>(null);
  const [sendType, setSendType] = useState<SendType>('schedule');
  const [scheduledAt, setScheduledAt] = useState<string>(
    new Date().toISOString().slice(0, 16)
  );
  const [loading, setLoading] = useState(false);
  const [customerCount, setCustomerCount] = useState<number | null>(null);
  const [message, setMessage] = useState('');

  useEffect(() => {
    const searchParams = new URLSearchParams(location.search);
    const template = searchParams.get('template');
    const segment = searchParams.get('segment');
    const message = searchParams.get('message');
    const criteriaStr = searchParams.get('criteria');

    if (!template || !segment || !message || !criteriaStr) {
      navigate('/whatsapp');
      return;
    }

    try {
      const criteria = JSON.parse(criteriaStr);
      setParams({ template, segment, message, criteria });
      setMessage(message);
      
      if (user) {
        checkCustomerCount(criteria);
      }
    } catch (error) {
      console.error('Error parsing criteria:', error);
      navigate('/whatsapp');
    }
  }, [location.search, navigate, user]);

  const checkCustomerCount = async (criteria: Record<string, any>) => {
    if (!user) return;

    try {
      const filteredCustomers = await filterCustomers(supabase, user.id, criteria);
      setCustomerCount(filteredCustomers.length);
    } catch (error) {
      console.error('Error checking customer count:', error);
      toast.error('Erro ao verificar quantidade de clientes');
    }
  };

  const handleCreateCampaign = async () => {
    if (!params || !user) return;

    try {
      setLoading(true);

      const filteredCustomers = await filterCustomers(supabase, user.id, params.criteria);

      if (filteredCustomers.length === 0) {
        throw new Error('Nenhum cliente encontrado com os critérios selecionados');
      }

      // Create campaign
      const { data: campaign, error: campaignError } = await supabase
        .from('whatsapp_campaigns')
        .insert({
          user_id: user.id,
          name: `Campanha ${params.segment} - ${format(new Date(), 'dd/MM/yyyy')}`,
          segment: params.segment,
          template_name: params.template,
          template_params: {
            message: message,
            criteria: params.criteria
          },
          scheduled_at: sendType === 'now' ? new Date().toISOString() : scheduledAt,
          status: sendType === 'now' ? 'sending' : 'scheduled'
        })
        .select()
        .single();

      if (campaignError) throw campaignError;

      // Create campaign logs
      const campaignLogs = filteredCustomers.map(customer => ({
        campaign_id: campaign.id,
        customer_id: customer.id,
        status: 'pending'
      }));

      const { error: logsError } = await supabase
        .from('whatsapp_campaign_logs')
        .insert(campaignLogs);

      if (logsError) throw logsError;

      toast.success(
        sendType === 'now'
          ? 'Campanha criada e iniciada com sucesso!'
          : `Campanha agendada para ${format(new Date(scheduledAt), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}`
      );

      navigate('/whatsapp');

    } catch (error) {
      console.error('Error creating campaign:', error);
      toast.error(
        error instanceof Error 
          ? error.message 
          : 'Erro ao criar campanha'
      );
    } finally {
      setLoading(false);
    }
  };

  if (!params) {
    return null;
  }

  return (
    <PageLayout>
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex items-center gap-4">
          <Button
            variant="secondary"
            onClick={() => navigate(-1)}
            className="p-2"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="text-2xl font-semibold text-gray-900">
            Detalhes da Campanha
          </h1>
        </div>

        <Card>
          <div className="space-y-6">
            <div>
              <h2 className="text-lg font-medium text-gray-900">
                Revise os detalhes da campanha sugerida antes de prosseguir.
              </h2>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">
                  Segmento
                </label>
                <p className="mt-1 text-gray-900">{params.segment}</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700">
                  Template
                </label>
                <p className="mt-1 text-gray-900">{params.template}</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700">
                  Mensagem
                </label>
                <textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  className="mt-1 block w-full rounded-xl border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                  rows={4}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700">
                  Critérios
                </label>
                <pre className="mt-1 p-4 bg-gray-50 rounded-xl overflow-auto text-sm">
                  {JSON.stringify(params.criteria, null, 2)}
                </pre>
              </div>

              {customerCount !== null && (
                <div className={`p-4 rounded-xl ${
                  customerCount === 0 ? 'bg-red-50 text-red-700' : 'bg-blue-50 text-blue-700'
                }`}>
                  <p className="text-sm">
                    {customerCount === 0 
                      ? 'Nenhum cliente encontrado com os critérios selecionados. Por favor, ajuste os critérios de segmentação.'
                      : `${customerCount} cliente${customerCount === 1 ? '' : 's'} receberão esta mensagem.`
                    }
                  </p>
                </div>
              )}

              <div className="border-t border-gray-200 pt-4">
                <label className="block text-sm font-medium text-gray-700">
                  Quando enviar?
                </label>
                <div className="mt-2 space-y-4">
                  <div className="flex gap-4">
                    <label className="flex items-center gap-2">
                      <input
                        type="radio"
                        name="sendType"
                        value="now"
                        checked={sendType === 'now'}
                        onChange={(e) => setSendType(e.target.value as SendType)}
                        className="text-blue-600 focus:ring-blue-500"
                      />
                      <span className="text-sm text-gray-900">Enviar agora</span>
                    </label>
                    <label className="flex items-center gap-2">
                      <input
                        type="radio"
                        name="sendType"
                        value="schedule"
                        checked={sendType === 'schedule'}
                        onChange={(e) => setSendType(e.target.value as SendType)}
                        className="text-blue-600 focus:ring-blue-500"
                      />
                      <span className="text-sm text-gray-900">Agendar envio</span>
                    </label>
                  </div>

                  {sendType === 'schedule' && (
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <Calendar className="h-5 w-5 text-gray-400" />
                      </div>
                      <input
                        type="datetime-local"
                        value={scheduledAt}
                        onChange={(e) => setScheduledAt(e.target.value)}
                        min={new Date().toISOString().slice(0, 16)}
                        className="pl-10 block w-full rounded-xl border-gray-300 focus:ring-blue-500 focus:border-blue-500"
                      />
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-4">
              <Button
                variant="secondary"
                onClick={() => navigate('/whatsapp')}
                disabled={loading}
              >
                Cancelar
              </Button>
              <Button
                onClick={handleCreateCampaign}
                disabled={loading || (sendType === 'schedule' && !scheduledAt) || customerCount === 0}
              >
                {loading ? 'Criando...' : 'Criar Campanha'}
              </Button>
            </div>
          </div>
        </Card>
      </div>
    </PageLayout>
  );
}