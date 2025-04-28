import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Send, MessageSquare, Bot, Plug, Facebook, AlertTriangle, BarChart2, MessageCircle, Phone, Calendar, Search, ArrowLeft, Plus, Clock, CheckCircle, XCircle, Loader2, MoreVertical, Pencil, Trash } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import toast from 'react-hot-toast';
import { PageLayout } from '../components/layout/PageLayout';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Modal } from '../components/ui/Modal';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';

type TabType = 'inbox' | 'campaigns' | 'settings' | 'results';

interface WhatsAppConnection {
  phone_display: string;
  phone_number_id: string;
  connected_at: string;
}

interface Campaign {
  id: string;
  name: string;
  segment: string;
  template_name: string;
  template_params: Record<string, string>;
  scheduled_at: string;
  status: 'scheduled' | 'sending' | 'completed' | 'failed';
  created_at: string;
  updated_at: string;
  _count?: {
    logs_total: number;
    logs_sent: number;
    logs_failed: number;
  };
}

interface CampaignForm {
  name: string;
  segment: string;
  template_name: string;
  scheduled_at: string;
}

interface Conversation {
  id: string;
  whatsapp_number: string;
  last_message_at: string | null;
  status: 'open' | 'closed';
  customer?: {
    id: string;
    name: string;
    phone: string;
  };
  last_message?: {
    body: string;
    from_me: boolean;
    timestamp: string | null;
  };
}

interface Message {
  id: string;
  conversation_id: string;
  from_me: boolean;
  type: 'text' | 'image' | 'audio' | 'document';
  body: string;
  status: 'sent' | 'delivered' | 'read' | 'failed';
  timestamp: string | null;
}

interface CampaignReport {
  id: string;
  name: string;
  segment: string;
  total_messages: number;
  delivered_count: number;
  read_count: number;
  response_count: number;
  failed_count: number;
  created_at: string;
}

export function WhatsApp() {
  const [activeTab, setActiveTab] = useState<TabType>('campaigns');
  const [connection, setConnection] = useState<WhatsAppConnection | null>(null);
  const [loading, setLoading] = useState(true);
  const [disconnecting, setDisconnecting] = useState(false);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedConversation, setSelectedConversation] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [showNewCampaign, setShowNewCampaign] = useState(false);
  const [showEditCampaign, setShowEditCampaign] = useState(false);
  const [showDeleteCampaign, setShowDeleteCampaign] = useState(false);
  const [selectedCampaign, setSelectedCampaign] = useState<Campaign | null>(null);
  const [campaignForm, setCampaignForm] = useState<CampaignForm>({
    name: '',
    segment: '',
    template_name: '',
    scheduled_at: new Date().toISOString().slice(0, 16)
  });
  const [segments, setSegments] = useState<string[]>([]);
  const [templates, setTemplates] = useState<string[]>([
    'welcome_message',
    'order_confirmation',
    'delivery_status',
    'feedback_request'
  ]);
  const [campaignReports, setCampaignReports] = useState<CampaignReport[]>([]);
  const [reportLoading, setReportLoading] = useState(false);
  const { user } = useAuth();
  const navigate = useNavigate();

  const tabs = [
    { id: 'inbox', label: 'Inbox', icon: MessageSquare },
    { id: 'campaigns', label: 'Campanhas', icon: Send },
    { id: 'settings', label: 'Configurações', icon: Plug },
    { id: 'results', label: 'Resultados', icon: BarChart2 },
  ] as const;

  const fbLoginUrl = `https://www.facebook.com/v19.0/dialog/oauth?client_id=${import.meta.env.VITE_FB_APP_ID}&redirect_uri=${import.meta.env.VITE_FB_REDIRECT_URI}&scope=whatsapp_business_management,business_management,pages_show_list&response_type=code`;

  useEffect(() => {
    const fetchConnection = async () => {
      if (!user) return;

      try {
        const { data, error } = await supabase
          .from('whatsapp_connections')
          .select('phone_display, phone_number_id, connected_at')
          .eq('user_id', user.id)
          .maybeSingle();

        if (error) throw error;
        setConnection(data);
      } catch (error) {
        console.error('Error fetching WhatsApp connection:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchConnection();
  }, [user]);

  useEffect(() => {
    if (user && activeTab === 'campaigns') {
      fetchCampaigns();
      fetchSegments();
    }
  }, [user, activeTab]);

  useEffect(() => {
    if (user && activeTab === 'results') {
      fetchCampaignReports();
    }
  }, [user, activeTab]);

  const handleCreateCampaign = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    try {
      const { error } = await supabase
        .from('whatsapp_campaigns')
        .insert({
          user_id: user.id,
          name: campaignForm.name,
          segment: campaignForm.segment,
          template_name: campaignForm.template_name,
          scheduled_at: campaignForm.scheduled_at,
          status: 'scheduled',
          template_params: {}
        });

      if (error) throw error;

      toast.success('Campanha criada com sucesso');
      setShowNewCampaign(false);
      setCampaignForm({
        name: '',
        segment: '',
        template_name: '',
        scheduled_at: new Date().toISOString().slice(0, 16)
      });
      fetchCampaigns();

    } catch (error) {
      console.error('Error creating campaign:', error);
      toast.error('Erro ao criar campanha');
    }
  };

  const handleEditCampaign = async () => {
    if (!selectedCampaign || !user) return;

    try {
      const { error } = await supabase
        .from('whatsapp_campaigns')
        .update({
          name: campaignForm.name,
          segment: campaignForm.segment,
          template_name: campaignForm.template_name,
          scheduled_at: campaignForm.scheduled_at,
          updated_at: new Date().toISOString()
        })
        .eq('id', selectedCampaign.id)
        .eq('user_id', user.id);

      if (error) throw error;

      toast.success('Campanha atualizada com sucesso');
      setShowEditCampaign(false);
      fetchCampaigns();

    } catch (error) {
      console.error('Error updating campaign:', error);
      toast.error('Erro ao atualizar campanha');
    }
  };

  const handleDeleteCampaign = async () => {
    if (!selectedCampaign || !user) return;

    try {
      const { error } = await supabase
        .from('whatsapp_campaigns')
        .delete()
        .eq('id', selectedCampaign.id)
        .eq('user_id', user.id);

      if (error) throw error;

      toast.success('Campanha excluída com sucesso');
      setShowDeleteCampaign(false);
      fetchCampaigns();

    } catch (error) {
      console.error('Error deleting campaign:', error);
      toast.error('Erro ao excluir campanha');
    }
  };

  const handleDisconnect = async () => {
    if (!user) return;

    try {
      setDisconnecting(true);
      const { error } = await supabase
        .from('whatsapp_connections')
        .delete()
        .eq('user_id', user.id);

      if (error) throw error;

      setConnection(null);
      toast.success('WhatsApp desconectado com sucesso');
    } catch (error) {
      console.error('Error disconnecting WhatsApp:', error);
      toast.error('Erro ao desconectar WhatsApp');
    } finally {
      setDisconnecting(false);
    }
  };

  const fetchCampaigns = async () => {
    if (!user) return;

    try {
      const { data, error } = await supabase
        .from('whatsapp_campaigns')
        .select(`
          *,
          whatsapp_campaign_logs (
            id,
            status
          )
        `)
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (error) throw error;

      const processedCampaigns = data.map(campaign => ({
        ...campaign,
        _count: {
          logs_total: campaign.whatsapp_campaign_logs?.length || 0,
          logs_sent: campaign.whatsapp_campaign_logs?.filter(log => log.status === 'sent').length || 0,
          logs_failed: campaign.whatsapp_campaign_logs?.filter(log => log.status === 'failed').length || 0
        }
      }));

      setCampaigns(processedCampaigns);
    } catch (error) {
      console.error('Error fetching campaigns:', error);
      toast.error('Erro ao carregar campanhas');
    }
  };

  const fetchSegments = async () => {
    try {
      const { data, error } = await supabase
        .from('customers')
        .select('segment')
        .eq('user_id', user?.id)
        .not('segment', 'is', null);

      if (error) throw error;

      const uniqueSegments = [...new Set(data.map(d => d.segment))];
      setSegments(uniqueSegments);
    } catch (error) {
      console.error('Error fetching segments:', error);
    }
  };

  const fetchCampaignReports = async () => {
    if (!user) return;

    try {
      setReportLoading(true);

      const { data: campaigns, error: campaignsError } = await supabase
        .from('whatsapp_campaigns')
        .select(`
          id,
          name,
          segment,
          created_at,
          whatsapp_campaign_logs!inner (
            status
          )
        `)
        .eq('user_id', user.id)
        .eq('status', 'completed');

      if (campaignsError) throw campaignsError;

      const reports: CampaignReport[] = campaigns?.map(campaign => {
        const logs = campaign.whatsapp_campaign_logs || [];
        return {
          id: campaign.id,
          name: campaign.name,
          segment: campaign.segment,
          total_messages: logs.length,
          delivered_count: logs.filter(log => log.status === 'delivered').length,
          read_count: logs.filter(log => log.status === 'read').length,
          response_count: logs.filter(log => log.status === 'responded').length,
          failed_count: logs.filter(log => log.status === 'failed').length,
          created_at: campaign.created_at,
        };
      }) || [];

      setCampaignReports(reports);
    } catch (error) {
      console.error('Error fetching campaign reports:', error);
      toast.error('Erro ao carregar relatórios');
    } finally {
      setReportLoading(false);
    }
  };

  const renderCampaignStatus = (status: Campaign['status']) => {
    switch (status) {
      case 'scheduled':
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
            <Clock className="w-3 h-3 mr-1" />
            Agendada
          </span>
        );
      case 'sending':
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
            <Loader2 className="w-3 h-3 mr-1 animate-spin" />
            Enviando
          </span>
        );
      case 'completed':
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
            <CheckCircle className="w-3 h-3 mr-1" />
            Concluída
          </span>
        );
      case 'failed':
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
            <XCircle className="w-3 h-3 mr-1" />
            Falha
          </span>
        );
    }
  };

  const renderTabContent = () => {
    switch (activeTab) {
      case 'campaigns':
        return (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900">
                Campanhas
              </h2>
              <Button onClick={() => setShowNewCampaign(true)}>
                <Plus className="h-5 w-5 mr-2" />
                Nova Campanha
              </Button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <Card className="p-6">
                <div className="flex items-center gap-4">
                  <div className="p-3 bg-blue-50 rounded-lg">
                    <Send className="h-6 w-6 text-blue-600" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-500">Total Enviado</p>
                    <p className="text-2xl font-semibold text-gray-900">
                      {campaigns.reduce((sum, c) => sum + (c._count?.logs_sent || 0), 0)}
                    </p>
                  </div>
                </div>
              </Card>

              <Card className="p-6">
                <div className="flex items-center gap-4">
                  <div className="p-3 bg-green-50 rounded-lg">
                    <MessageSquare className="h-6 w-6 text-green-600" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-500">Taxa de Entrega</p>
                    <p className="text-2xl font-semibold text-gray-900">
                      {campaigns.length > 0
                        ? Math.round(
                            (campaigns.reduce((sum, c) => sum + (c._count?.logs_sent || 0), 0) /
                              campaigns.reduce((sum, c) => sum + (c._count?.logs_total || 0), 0)) *
                              100
                          )
                        : 0}%
                    </p>
                  </div>
                </div>
              </Card>

              <Card className="p-6">
                <div className="flex items-center gap-4">
                  <div className="p-3 bg-purple-50 rounded-lg">
                    <BarChart2 className="h-6 w-6 text-purple-600" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-500">Campanhas Ativas</p>
                    <p className="text-2xl font-semibold text-gray-900">
                      {campaigns.filter(c => c.status === 'scheduled' || c.status === 'sending').length}
                    </p>
                  </div>
                </div>
              </Card>
            </div>

            {campaigns.length === 0 ? (
              <div className="text-center py-8">
                <Send className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-gray-900 mb-2">
                  Nenhuma campanha cadastrada
                </h3>
                <p className="text-gray-500 mb-6">
                  Crie sua primeira campanha para começar a enviar mensagens em massa.
                </p>
                <Button onClick={() => setShowNewCampaign(true)}>
                  <Plus className="h-5 w-5 mr-2" />
                  Nova Campanha
                </Button>
              </div>
            ) : (
              <Card>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-gray-200">
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Nome
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Segmento
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Template
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Agendamento
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Status
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Progresso
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Ações
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {campaigns.map((campaign) => (
                        <tr key={campaign.id}>
                          <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                            {campaign.name}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                            {campaign.segment}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                            {campaign.template_name}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                            {format(new Date(campaign.scheduled_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            {renderCampaignStatus(campaign.status)}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                            {campaign._count?.logs_sent || 0}/{campaign._count?.logs_total || 0}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                            <div className="flex items-center gap-2">
                              {campaign.status === 'scheduled' && (
                                <>
                                  <Button
                                    variant="secondary"
                                    className="p-2"
                                    onClick={() => {
                                      setSelectedCampaign(campaign);
                                      setCampaignForm({
                                        name: campaign.name,
                                        segment: campaign.segment,
                                        template_name: campaign.template_name,
                                        scheduled_at: new Date(campaign.scheduled_at).toISOString().slice(0, 16)
                                      });
                                      setShowEditCampaign(true);
                                    }}
                                  >
                                    <Pencil className="h-4 w-4" />
                                  </Button>
                                  <Button
                                    variant="secondary"
                                    className="p-2"
                                    onClick={() => {
                                      setSelectedCampaign(campaign);
                                      setShowDeleteCampaign(true);
                                    }}
                                  >
                                    <Trash className="h-4 w-4" />
                                  </Button>
                                </>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            )}
          </div>
        );

      case 'settings':
        return (
          <div className="text-center py-16">
            <div className="max-w-sm mx-auto">
              {loading ? (
                <div className="animate-pulse space-y-4">
                  <div className="h-16 w-16 bg-gray-200 rounded-full mx-auto" />
                  <div className="h-8 bg-gray-200 rounded w-3/4 mx-auto" />
                  <div className="h-4 bg-gray-200 rounded w-full" />
                  <div className="h-4 bg-gray-200 rounded w-5/6 mx-auto" />
                </div>
              ) : connection ? (
                <Card className="p-6">
                  <div className="flex items-center justify-center mb-6">
                    <div className="h-16 w-16 bg-green-50 rounded-full flex items-center justify-center">
                      <Phone className="h-8 w-8 text-green-600" />
                    </div>
                  </div>
                  <h2 className="text-xl font-semibold text-gray-900 mb-6">
                    WhatsApp Business Conectado
                  </h2>
                  <div className="space-y-4 text-left">
                    <div>
                      <p className="text-sm text-gray-500">Número conectado</p>
                      <p className="text-gray-900 font-medium">{connection.phone_display}</p>
                    </div>
                    <div>
                      <p className="text-sm text-gray-500">ID do WhatsApp</p>
                      <p className="text-gray-900 font-medium">{connection.phone_number_id}</p>
                    </div>
                    <div>
                      <p className="text-sm text-gray-500">Conectado em</p>
                      <p className="text-gray-900 font-medium">
                        {format(new Date(connection.connected_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                      </p>
                    </div>
                    <div className="pt-4 border-t border-gray-100">
                      <Button
                        variant="secondary"
                        className="w-full text-red-600 border border-red-200 hover:bg-red-50"
                        onClick={handleDisconnect}
                        disabled={disconnecting}
                      >
                        {disconnecting ? 'Desconectando...' : 'Desconectar WhatsApp'}
                      </Button>
                    </div>
                  </div>
                </Card>
              ) : (
                <>
                  <Facebook className="h-16 w-16 text-[#1877F2] mx-auto mb-6" />
                  <h2 className="text-2xl font-semibold text-gray-900 mb-4">
                    Conecte seu WhatsApp Business
                  </h2>
                  <p className="text-gray-500 mb-8">
                    Para começar, você precisa conectar sua conta do WhatsApp Business através do Facebook Business Manager.
                  </p>
                  <Button 
                    className="w-full flex items-center justify-center gap-2 bg-[#1877F2] hover:bg-[#1864F2]"
                    onClick={() => window.location.href = fbLoginUrl}
                  >
                    <Facebook className="h-5 w-5" />
                    Conectar com o Facebook
                  </Button>
                </>
              )}
            </div>
          </div>
        );

      case 'results':
        return (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
              <Card className="p-6">
                <div className="flex items-center gap-4">
                  <div className="p-3 bg-blue-50 rounded-lg">
                    <Send className="h-6 w-6 text-blue-600" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-500">Total Enviado</p>
                    <p className="text-2xl font-semibold text-gray-900">
                      {campaignReports.reduce((sum, r) => sum + r.total_messages, 0)}
                    </p>
                  </div>
                </div>
              </Card>

              <Card className="p-6">
                <div className="flex items-center gap-4">
                  <div className="p-3 bg-green-50 rounded-lg">
                    <MessageSquare className="h-6 w-6 text-green-600" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-500">Taxa de Entrega</p>
                    <p className="text-2xl font-semibold text-gray-900">
                      {campaignReports.length > 0
                        ? Math.round(
                            (campaignReports.reduce((sum, r) => sum + r.delivered_count, 0) /
                              campaignReports.reduce((sum, r) => sum + r.total_messages, 0)) *
                              100
                          )
                        : 0}%
                    </p>
                  </div>
                </div>
              </Card>

              <Card className="p-6">
                <div className="flex items-center gap-4">
                  <div className="p-3 bg-purple-50 rounded-lg">
                    <BarChart2 className="h-6 w-6 text-purple-600" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-500">Taxa de Resposta</p>
                    <p className="text-2xl font-semibold text-gray-900">
                      {campaignReports.length > 0
                        ? Math.round(
                            (campaignReports.reduce((sum, r) => sum + r.response_count, 0) /
                              campaignReports.reduce((sum, r) => sum + r.total_messages, 0)) *
                              100
                          )
                        : 0}%
                    </p>
                  </div>
                </div>
              </Card>

              <Card className="p-6">
                <div className="flex items-center gap-4">
                  <div className="p-3 bg-red-50 rounded-lg">
                    <AlertTriangle className="h-6 w-6 text-red-600" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-500">Taxa de Falha</p>
                    <p className="text-2xl font-semibold text-gray-900">
                      {campaignReports.length > 0
                        ? Math.round(
                            (campaignReports.reduce((sum, r) => sum + r.failed_count, 0) /
                              campaignReports.reduce((sum, r) => sum + r.total_messages, 0)) *
                              100
                          )
                        : 0}%
                    </p>
                  </div>
                </div>
              </Card>
            </div>

            <Card>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-gray-200">
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Campanha
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Segmento
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Total
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Entregues
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Lidas
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Respostas
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Falhas
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {reportLoading ? (
                      <tr>
                        <td colSpan={7} className="px-6 py-4 text-center text-gray-500">
                          <div className="flex items-center justify-center">
                            <div className="animate-spin rounded-full h-5 w-5 border-2 border-blue-600 border-t-transparent" />
                            <span className="ml-2">Carregando relatórios...</span>
                          </div>
                        </td>
                      </tr>
                    ) : campaignReports.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="px-6 py-4 text-center text-gray-500">
                          Nenhuma campanha concluída ainda
                        </td>
                      </tr>
                    ) : (
                      campaignReports.map((report) => (
                        <tr key={report.id}>
                          <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                            {report.name}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                            {report.segment}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                            {report.total_messages}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="flex items-center">
                              <span className="text-sm text-gray-900">{report.delivered_count}</span>
                              <span className="ml-2 text-xs text-gray-500">
                                ({Math.round((report.delivered_count / report.total_messages) * 100)}%)
                              </span>
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="flex items-center">
                              <span className="text-sm text-gray-900">{report.read_count}</span>
                              <span className="ml-2 text-xs text-gray-500">
                                ({Math.round((report.read_count / report.total_messages) * 100)}%)
                              </span>
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="flex items-center">
                              <span className="text-sm text-gray-900">{report.response_count}</span>
                              <span className="ml-2 text-xs text-gray-500">
                                ({Math.round((report.response_count / report.total_messages) * 100)}%)
                              </span>
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="flex items-center">
                              <span className="text-sm text-gray-900">{report.failed_count}</span>
                              <span className="ml-2 text-xs text-gray-500">
                                ({Math.round((report.failed_count / report.total_messages) * 100)}%)
                              </span>
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </Card>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <PageLayout>
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="bg-white rounded-lg shadow">
          <div className="border-b border-gray-200">
            <nav className="flex -mb-px">
              {tabs.map(({ id, label, icon: Icon }) => (
                <button
                  key={id}
                  onClick={() => setActiveTab(id)}
                  className={`
                    group inline-flex items-center px-6 py-4 border-b-2 font-medium text-sm
                    ${activeTab === id
                      ? 'border-blue-500 text-blue-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                    }
                  `}
                >
                  <Icon
                    className={`
                      -ml-0.5 mr-2 h-5 w-5
                      ${activeTab === id ? 'text-blue-500' : 'text-gray-400 group-hover:text-gray-500'}
                    `}
                  />
                  {label}
                </button>
              ))}
            </nav>
          </div>

          <div className="p-6">
            {renderTabContent()}
          </div>
        </div>
      </div>

      <Modal
        isOpen={showNewCampaign}
        onClose={() => setShowNewCampaign(false)}
        title="Nova Campanha"
      >
        <form onSubmit={handleCreateCampaign} className="space-y-6">
          <div>
            <label className="block text-sm font-medium text-gray-700">
              Nome da Campanha
            </label>
            <input
              type="text"
              value={campaignForm.name}
              onChange={(e) => setCampaignForm(prev => ({ ...prev, name: e.target.value }))}
              className="mt-1 block w-full rounded-lg border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">
              Segmento
            </label>
            <select
              value={campaignForm.segment}
              onChange={(e) => setCampaignForm(prev => ({ ...prev, segment: e.target.value }))}
              className="mt-1 block w-full rounded-lg border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
              required
            >
              <option value="">Selecione um segmento</option>
              {segments.map(segment => (
                <option key={segment} value={segment}>{segment}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">
              Template
            </label>
            <select
              value={campaignForm.template_name}
              onChange={(e) => setCampaignForm(prev => ({ ...prev, template_name: e.target.value }))}
              className="mt-1 block w-full rounded-lg border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
              required
            >
              <option value="">Selecione um template</option>
              {templates.map(template => (
                <option key={template} value={template}>{template}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">
              Data e Hora de Envio
            </label>
            <input
              type="datetime-local"
              value={campaignForm.scheduled_at}
              onChange={(e) => setCampaignForm(prev => ({ ...prev, scheduled_at: e.target.value }))}
              className="mt-1 block w-full rounded-lg border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
              required
            />
          </div>

          <div className="flex justify-end space-x-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setShowNewCampaign(false)}
            >
              Cancelar
            </Button>
            <Button type="submit">
              Criar Campanha
            </Button>
          </div>
        </form>
      </Modal>

      <Modal
        isOpen={showEditCampaign}
        onClose={() => setShowEditCampaign(false)}
        title="Editar Campanha"
      >
        <form onSubmit={(e) => { e.preventDefault(); handleEditCampaign(); }} className="space-y-6">
          <div>
            <label className="block text-sm font-medium text-gray-700">
              Nome da Campanha
            </label>
            <input
              type="text"
              value={campaignForm.name}
              onChange={(e) => setCampaignForm(prev => ({ ...prev, name: e.target.value }))}
              className="mt-1 block w-full rounded-lg border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">
              Segmento
            </label>
            <select
              value={campaignForm.segment}
              onChange={(e) => setCampaignForm(prev => ({ ...prev, segment: e.target.value }))}
              className="mt-1 block w-full rounded-lg border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
              required
            >
              <option value="">Selecione um segmento</option>
              {segments.map(segment => (
                <option key={segment} value={segment}>{segment}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">
              Template
            </label>
            <select
              value={campaignForm.template_name}
              onChange={(e) => setCampaignForm(prev => ({ ...prev, template_name: e.target.value }))}
              className="mt-1 block w-full rounded-lg border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
              required
            >
              <option value="">Selecione um template</option>
              {templates.map(template => (
                <option key={template} value={template}>{template}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">
              Data e Hora de Envio
            </label>
            <input
              type="datetime-local"
              value={campaignForm.scheduled_at}
              onChange={(e) => setCampaignForm(prev => ({ ...prev, scheduled_at: e.target.value }))}
              className="mt-1 block w-full rounded-lg border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
              required
            />
          </div>

          <div className="flex justify-end space-x-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setShowEditCampaign(false)}
            >
              Cancelar
            </Button>
            <Button type="submit">
              Salvar Alterações
            </Button>
          </div>
        </form>
      </Modal>

      <Modal
        isOpen={showDeleteCampaign}
        onClose={() => setShowDeleteCampaign(false)}
        title="Excluir Campanha"
      >
        <div className="space-y-4">
          <div className="flex items-start space-x-2 text-red-700">
            <AlertTriangle className="h-5 w-5 mt-0.5 flex-shrink-0" />
            <div>
              <p className="font-medium">
                Tem certeza que deseja excluir esta campanha?
              </p>
              <p className="mt-1 text-sm text-red-600">
                Esta ação não pode ser desfeita e todos os dados relacionados serão perdidos.
              </p>
            </div>
          </div>

          <div className="flex justify-end space-x-2 mt-6">
            <Button
              variant="secondary"
              onClick={() => setShowDeleteCampaign(false)}
            >
              Cancelar
            </Button>
            <Button
              onClick={handleDeleteCampaign}
              className="bg-red-600 hover:bg-red-700"
            >
              Excluir
            </Button>
          </div>
        </div>
      </Modal>
    </PageLayout>
  );
}