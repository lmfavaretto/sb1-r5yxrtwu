import { useState, useEffect } from 'react';
import { Search, Users, Crown, Clock, DollarSign, Trash2, AlertTriangle, Download, Eye, Store, Loader2, CheckCircle } from 'lucide-react';
import Papa from 'papaparse';
import { PageLayout } from '../components/layout/PageLayout';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Modal } from '../components/ui/Modal';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import toast from 'react-hot-toast';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

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

interface DelMatchIntegration {
  id: string;
  api_base_url: string;
  email: string;
  token: string | null;
  expires_at: string | null;
  last_order_reference: string | null;
  created_at: string;
  updated_at: string;
  last_sync_at: string | null;
  sync_enabled: boolean;
  sync_interval_minutes: number;
}

interface SyncStatus {
  newCustomers: number;
  updatedCustomers: number;
  newOrders: number;
  skippedOrders: number;
  errors: string[];
}

const EXPECTED_COLUMNS = [
  'nome',
  'celular',
  'logradouro',
  'logradouro_numero',
  'complemento',
  'bairro',
  'cidade',
  'total',
  'total_pontos',
  'cliente_desde',
  'ticket_medio',
  'ultimo_pedido'
];

function cleanPhone(phone: string): string | null {
  if (!phone) return null;
  const cleaned = phone.replace(/\D/g, '');
  return cleaned.length >= 10 ? cleaned : null;
}

function parseBrazilianDateToISO(dateStr: string): string | null {
  try {
    if (!dateStr) return null;
    const [day, month, year] = dateStr.split('/');
    if (!day || !month || !year) return null;

    const d = day.padStart(2, '0');
    const m = month.padStart(2, '0');
    return `${year}-${m}-${d}`;
  } catch (error) {
    console.warn('Error parsing date:', dateStr, error);
    return null;
  }
}

function parseNumber(value: string): number | null {
  if (!value) return null;
  const cleanValue = value.replace(/[R$\s]/g, '');
  const normalizedValue = cleanValue.replace(',', '.');
  const number = parseFloat(normalizedValue);
  return isNaN(number) ? null : number;
}

function formatAddress(logradouro?: string, numero?: string, complemento?: string, bairro?: string, cidade?: string): string {
  const parts = [
    logradouro,
    numero && `nº ${numero}`,
    complemento,
    bairro,
    cidade
  ].filter(Boolean);
  
  return parts.join(', ');
}

function normalizeDelMatchUrl(url: string): string {
  const cleanUrl = url.replace(/^https?:\/\//, '').replace(/\/$/, '');
  const domainPattern = /^[a-zA-Z0-9-]+\.delmatchcardapio\.com$/;
  
  if (!domainPattern.test(cleanUrl)) {
    throw new Error('Informe apenas o domínio do cardápio, ex: seunome.delmatchcardapio.com');
  }
  
  return cleanUrl;
}

export function Upload() {
  const [importStatus, setImportStatus] = useState<ImportStatus>({ status: 'idle' });
  const [showIntegrationModal, setShowIntegrationModal] = useState(false);
  const [integrationLoading, setIntegrationLoading] = useState(false);
  const [integration, setIntegration] = useState<DelMatchIntegration | null>(null);
  const [integrationForm, setIntegrationForm] = useState({
    api_base_url: '',
    email: '',
    password: '',
  });
  const [integrationError, setIntegrationError] = useState<string | null>(null);
  const [syncStatus, setSyncStatus] = useState<SyncStatus | null>(null);
  const [syncing, setSyncing] = useState(false);
  const { user } = useAuth();

  useEffect(() => {
    if (user) {
      loadIntegration();
    }
  }, [user]);

  const loadIntegration = async () => {
    try {
      const { data, error } = await supabase
        .from('api_integrations')
        .select('*')
        .eq('user_id', user?.id)
        .maybeSingle();

      if (error) throw error;
      setIntegration(data);
    } catch (error) {
      console.error('Error loading integration:', error);
    }
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !user) return;

    setImportStatus({ status: 'processing' });

    try {
      const results = await new Promise<any[]>((resolve, reject) => {
        Papa.parse(file, {
          header: true,
          skipEmptyLines: true,
          encoding: 'latin1',
          transformHeader: (header) => header.trim().toLowerCase(),
          complete: (results) => resolve(results.data),
          error: (error) => reject(error),
        });
      });

      let customersImported = 0;
      let ordersImported = 0;
      const warnings: ImportWarnings = {
        invalidPhones: 0,
        invalidNames: 0,
        invalidDates: 0,
        invalidTickets: 0,
        invalidTotals: 0,
        skippedRows: 0,
      };

      const BATCH_SIZE = 50;
      for (let i = 0; i < results.length; i += BATCH_SIZE) {
        const batch = results.slice(i, i + BATCH_SIZE);
        
        for (const row of batch) {
          try {
            if (!row.nome?.trim()) {
              warnings.invalidNames++;
              continue;
            }

            const phone = cleanPhone(row.celular);
            if (!phone) {
              console.warn(`Invalid phone number for customer ${row.nome}:`, row.celular);
              warnings.invalidPhones++;
              continue;
            }

            const createdAtISO = parseBrazilianDateToISO(row.cliente_desde);
            const lastOrderDateISO = parseBrazilianDateToISO(row.ultimo_pedido);
            
            if (!createdAtISO || !lastOrderDateISO) {
              console.warn(`Invalid dates for customer ${row.nome}:`, {
                cliente_desde: row.cliente_desde,
                ultimo_pedido: row.ultimo_pedido
              });
              warnings.invalidDates++;
              continue;
            }

            const totalOrders = parseInt(row.total, 10);
            const ticketMedio = parseNumber(row.ticket_medio);

            if (isNaN(totalOrders) || totalOrders < 0) {
              console.warn(`Invalid total orders for customer ${row.nome}:`, row.total);
              warnings.invalidTotals++;
              continue;
            }

            if (!ticketMedio || ticketMedio < 0) {
              console.warn(`Invalid ticket_medio for customer ${row.nome}:`, row.ticket_medio);
              warnings.invalidTickets++;
              continue;
            }

            const totalSpent = totalOrders * ticketMedio;
            const address = formatAddress(
              row.logradouro,
              row.logradouro_numero,
              row.complemento,
              row.bairro,
              row.cidade
            );

            const { data: existingCustomer } = await supabase
              .from('customers')
              .select('id')
              .eq('user_id', user.id)
              .eq('phone', phone)
              .maybeSingle();

            let customerId: string;

            if (existingCustomer) {
              customerId = existingCustomer.id;
              
              const { error: updateError } = await supabase
                .from('customers')
                .update({
                  name: row.nome.trim(),
                  address,
                  neighborhood: row.bairro?.trim(),
                  city: row.cidade?.trim(),
                  created_at: createdAtISO,
                  last_order_date: lastOrderDateISO,
                  total_orders: totalOrders,
                  total_spent: totalSpent,
                  sistema_origem: 'csv_import'
                })
                .eq('id', customerId);

              if (updateError) throw updateError;
            } else {
              const { data: newCustomer, error: customerError } = await supabase
                .from('customers')
                .insert({
                  user_id: user.id,
                  name: row.nome.trim(),
                  phone,
                  address,
                  neighborhood: row.bairro?.trim(),
                  city: row.cidade?.trim(),
                  created_at: createdAtISO,
                  last_order_date: lastOrderDateISO,
                  total_orders: totalOrders,
                  total_spent: totalSpent,
                  sistema_origem: 'csv_import'
                })
                .select()
                .single();

              if (customerError) throw customerError;
              customerId = newCustomer.id;
              customersImported++;
            }

            for (let i = 0; i < totalOrders; i++) {
              const { error: orderError } = await supabase
                .from('orders')
                .insert({
                  customer_id: customerId,
                  order_date: lastOrderDateISO,
                  order_value: ticketMedio,
                  reference: `csv_${customerId}_${Date.now()}_${i + 1}`
                });

              if (orderError) throw orderError;
              ordersImported++;
            }

          } catch (error) {
            console.error('Error processing row:', row, error);
            warnings.skippedRows++;
          }
        }
      }

      setImportStatus({
        status: 'success',
        message: 'Import completed successfully',
        customers: customersImported,
        orders: ordersImported,
        warnings,
      });
    } catch (error) {
      console.error('Import error:', error);
      setImportStatus({
        status: 'error',
        message: error instanceof Error ? error.message : 'Error importing data',
      });
    }
  };

  const handleIntegrationSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    try {
      setIntegrationLoading(true);
      setIntegrationError(null);

      const normalizedUrl = normalizeDelMatchUrl(integrationForm.api_base_url);

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/delmatch-authenticate`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            api_base_url: normalizedUrl,
            email: integrationForm.email,
            password: integrationForm.password,
          }),
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Authentication failed');
      }

      const { token, expires } = await response.json();

      const { data, error } = await supabase
        .from('api_integrations')
        .upsert({
          user_id: user.id,
          api_base_url: normalizedUrl,
          email: integrationForm.email,
          password: integrationForm.password,
          token,
          expires_at: new Date(expires * 1000).toISOString(),
          sync_enabled: true,
          sync_interval_minutes: 60,
        })
        .select()
        .single();

      if (error) throw error;

      setIntegration(data);
      setShowIntegrationModal(false);

      handleSync();

    } catch (error) {
      console.error('Integration error:', error);
      setIntegrationError(error instanceof Error ? error.message : 'Failed to connect to Del Match');
    } finally {
      setIntegrationLoading(false);
    }
  };

  const handleSync = async () => {
    if (!user || !integration) return;

    try {
      setSyncing(true);
      setSyncStatus(null);

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/fetch-delmatch-orders`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ user_id: user.id }),
        }
      );

      if (!response.ok) {
        throw new Error('Failed to sync orders');
      }

      const result = await response.json();
      setSyncStatus(result);

      loadIntegration();

    } catch (error) {
      console.error('Sync error:', error);
      setSyncStatus({
        newCustomers: 0,
        updatedCustomers: 0,
        newOrders: 0,
        skippedOrders: 0,
        errors: [error instanceof Error ? error.message : 'Unknown error'],
      });
    } finally {
      setSyncing(false);
    }
  };

  const handleDisconnect = async () => {
    if (!user || !integration) return;

    try {
      const { error } = await supabase
        .from('api_integrations')
        .delete()
        .eq('id', integration.id);

      if (error) throw error;

      setIntegration(null);
      setSyncStatus(null);
    } catch (error) {
      console.error('Error disconnecting:', error);
    }
  };

  const toggleAutoSync = async () => {
    if (!integration) return;

    try {
      const { error } = await supabase
        .from('api_integrations')
        .update({ 
          sync_enabled: !integration.sync_enabled 
        })
        .eq('id', integration.id);

      if (error) throw error;

      loadIntegration();
      toast.success(
        integration.sync_enabled 
          ? 'Sincronização automática desativada' 
          : 'Sincronização automática ativada'
      );
    } catch (error) {
      console.error('Error toggling auto sync:', error);
      toast.error('Erro ao alterar sincronização automática');
    }
  };

  return (
    <PageLayout>
      <div className="max-w-4xl mx-auto space-y-6">
        <Card>
          <div className="space-y-6">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">
                Importar CSV
              </h2>
              <p className="mt-1 text-sm text-gray-500">
                Importe seus clientes e pedidos através de um arquivo CSV
              </p>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Colunas Esperadas
                </label>
                <div className="bg-slate-50 rounded-xl p-4 shadow-inner">
                  <div className="grid grid-cols-2 gap-x-8 gap-y-1">
                    {EXPECTED_COLUMNS.map((column) => (
                      <div key={column} className="text-sm text-gray-600">
                        • {column}
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Upload CSV
                </label>
                <div className="mt-1 flex justify-center px-6 pt-5 pb-6 border-2 border-gray-300 border-dashed rounded-xl hover:border-blue-500 transition-colors">
                  <div className="space-y-2 text-center">
                    <Download className="mx-auto h-12 w-12 text-gray-400" />
                    <div className="flex flex-col items-center text-sm text-gray-600">
                      <label className="relative cursor-pointer rounded-md font-medium text-blue-600 hover:text-blue-500">
                        <span>Selecionar CSV</span>
                        <input
                          type="file"
                          className="sr-only"
                          accept=".csv"
                          onChange={handleFileUpload}
                          disabled={importStatus.status === 'processing'}
                        />
                      </label>
                      <p className="pl-1">ou arraste e solte</p>
                    </div>
                    <p className="text-xs text-gray-500">Apenas arquivos CSV</p>
                  </div>
                </div>
              </div>
            </div>

            {importStatus.status !== 'idle' && (
              <div className={`p-4 rounded-xl ${
                importStatus.status === 'processing' ? 'bg-blue-50 text-blue-700' :
                importStatus.status === 'success' ? 'bg-green-50 text-green-700' :
                'bg-red-50 text-red-700'
              }`}>
                <div className="flex items-center gap-2">
                  {importStatus.status === 'processing' && (
                    <div className="animate-spin rounded-full h-4 w-4 border-2 border-current border-t-transparent" />
                  )}
                  {importStatus.status === 'success' && <CheckCircle className="h-4 w-4" />}
                  {importStatus.status === 'error' && <AlertTriangle className="h-4 w-4" />}
                  <span className="text-sm font-medium">{importStatus.message}</span>
                </div>
                {importStatus.status === 'success' &&
                  importStatus.warnings && (
                  <div className="mt-4 space-y-4">
                    <div className="text-green-700">
                      <p className="font-medium">Importados com sucesso:</p>
                      <ul className="mt-2 list-disc list-inside text-sm">
                        <li>{importStatus.customers} novos clientes</li>
                        <li>{importStatus.orders} pedidos criados</li>
                      </ul>
                    </div>
                    
                    {Object.entries(importStatus.warnings).some(([_, count]) => count > 0) && (
                      <div className="text-yellow-700">
                        <p className="font-medium">Avisos:</p>
                        <ul className="mt-2 list-disc list-inside text-sm">
                          {importStatus.warnings.invalidNames > 0 && (
                            <li>{importStatus.warnings.invalidNames} registros com nomes inválidos</li>
                          )}
                          {importStatus.warnings.invalidPhones > 0 && (
                            <li>{importStatus.warnings.invalidPhones} registros com telefones inválidos</li>
                          )}
                          {importStatus.warnings.invalidDates > 0 && (
                            <li>{importStatus.warnings.invalidDates} registros com datas inválidas</li>
                          )}
                          {importStatus.warnings.invalidTickets > 0 && (
                            <li>{importStatus.warnings.invalidTickets} registros com ticket médio inválido</li>
                          )}
                          {importStatus.warnings.invalidTotals > 0 && (
                            <li>{importStatus.warnings.invalidTotals} registros com total de pedidos inválido</li>
                          )}
                          {importStatus.warnings.skippedRows > 0 && (
                            <li>{importStatus.warnings.skippedRows} registros ignorados por erros</li>
                          )}
                        </ul>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </Card>

        <Card>
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                  <Store className="h-5 w-5 text-gray-500" />
                  Integração com Del Match
                </h2>
                <p className="mt-1 text-sm text-gray-500">
                  Mantenha sua base de clientes atualizada automaticamente com a integração oficial da plataforma Del Match
                </p>
              </div>

              {!integration ? (
                <Button onClick={() => setShowIntegrationModal(true)}>
                  Conectar
                </Button>
              ) : (
                <div className="flex items-center gap-4">
                  <Button
                    variant="secondary"
                    onClick={handleSync}
                    disabled={syncing}
                  >
                    {syncing ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin mr-2" />
                        Sincronizando...
                      </>
                    ) : (
                      'Sincronizar Agora'
                    )}
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={handleDisconnect}
                  >
                    Desconectar
                  </Button>
                </div>
              )}
            </div>

            {integration && (
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <div className={`w-2 h-2 rounded-full ${
                    integration.token ? 'bg-green-500' : 'bg-red-500'
                  }`} />
                  <span className="text-sm font-medium text-gray-900">
                    {integration.token ? 'Conectado' : 'Desconectado'}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700">
                      URL do Cardápio
                    </label>
                    <p className="mt-1 text-sm text-gray-900">
                      {integration.api_base_url}
                    </p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700">
                      E-mail
                    </label>
                    <p className="mt-1 text-sm text-gray-900">
                      {integration.email}
                    </p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700">
                      Última Sincronização Manual
                    </label>
                    <p className="mt-1 text-sm text-gray-900">
                      {integration.updated_at ? format(new Date(integration.updated_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR }) : 'Nunca'}
                    </p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700">
                      Último Pedido Processado
                    </label>
                    <p className="mt-1 text-sm text-gray-900">
                      {integration.last_order_reference || 'Nenhum'}
                    </p>
                  </div>
                </div>

                <div className="border-t border-gray-200 pt-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-sm font-medium text-gray-900">
                        Sincronização Automática
                      </h3>
                      <p className="mt-1 text-sm text-gray-500">
                        {integration.sync_enabled 
                          ? 'A sincronização automática está ativada e ocorre a cada hora' 
                          : 'A sincronização automática está desativada'}
                      </p>
                      {integration.last_sync_at && (
                        <p className="mt-1 text-sm text-gray-500">
                          Última sincronização automática: {format(new Date(integration.last_sync_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                        </p>
                      )}
                    </div>
                    <Button
                      variant="secondary"
                      onClick={toggleAutoSync}
                      className={integration.sync_enabled ? 'bg-green-50 text-green-700' : ''}
                    >
                      {integration.sync_enabled ? 'Desativar' : 'Ativar'}
                    </Button>
                  </div>
                </div>

                {syncStatus && (
                  <div className={`p-4 rounded-xl ${
                    syncStatus.errors.length > 0 ? 'bg-yellow-50' : 'bg-green-50'
                  }`}>
                    <h3 className="text-sm font-medium mb-2">
                      Resultado da Sincronização
                    </h3>
                    <div className="space-y-2 text-sm">
                      <p>✓ {syncStatus.newCustomers} novos clientes</p>
                      <p>✓ {syncStatus.updatedCustomers} clientes atualizados</p>
                      <p>✓ {syncStatus.newOrders} novos pedidos</p>
                      <p>✓ {syncStatus.skippedOrders} pedidos ignorados (já processados)</p>
                      {syncStatus.errors.length > 0 && (
                        <div className="mt-2">
                          <p className="font-medium">Erros:</p>
                          <ul className="list-disc list-inside">
                            {syncStatus.errors.map((error, index) => (
                              <li key={index}>{error}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </Card>

        <Modal
          isOpen={showIntegrationModal}
          onClose={() => setShowIntegrationModal(false)}
          title="Conectar com Del Match"
        >
          <form onSubmit={handleIntegrationSubmit} className="space-y-6">
            {integrationError && (
              <div className="bg-red-50 text-red-700 p-4 rounded-xl text-sm">
                {integrationError}
              </div>
            )}

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">
                  URL do Cardápio
                </label>
                <input
                  type="text"
                  value={integrationForm.api_base_url}
                  onChange={(e) => setIntegrationForm(prev => ({ ...prev, api_base_url: e.target.value }))}
                  placeholder="seucardapio.delmatchcardapio.com"
                  className="mt-1 block w-full rounded-xl border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                  required
                />
                <p className="mt-1 text-xs text-gray-500">
                  Ex: seucardapio.delmatchcardapio.com
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700">
                  E-mail
                </label>
                <input
                  type="email"
                  value={integrationForm.email}
                  onChange={(e) => setIntegrationForm(prev => ({ ...prev, email: e.target.value }))}
                  className="mt-1 block w-full rounded-xl border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700">
                  Senha
                </label>
                <input
                  type="password"
                  value={integrationForm.password}
                  onChange={(e) => setIntegrationForm(prev => ({ ...prev, password: e.target.value }))}
                  className="mt-1 block w-full rounded-xl border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                  required
                />
              </div>
            </div>

            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="secondary"
                onClick={() => setShowIntegrationModal(false)}
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                disabled={integrationLoading}
              >
                {integrationLoading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    Conectando...
                  </>
                ) : (
                  'Conectar'
                )}
              </Button>
            </div>
          </form>
        </Modal>
      </div>
    </PageLayout>
  );
}