import { useState, useEffect } from 'react';
import { UserPlus, Trash2, AlertTriangle } from 'lucide-react';
import { Card } from '../ui/Card';
import { Button } from '../ui/Button';
import { Modal } from '../ui/Modal';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';
import toast from 'react-hot-toast';

interface AccountUser {
  id: string;
  name: string;
  email: string;
  role: 'admin' | 'user';
  created_at: string;
}

export function AccountUsers() {
  const [users, setUsers] = useState<AccountUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [selectedUser, setSelectedUser] = useState<AccountUser | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [newUser, setNewUser] = useState({
    name: '',
    email: '',
    password: '',
    role: 'user' as const
  });
  const { user } = useAuth();

  useEffect(() => {
    if (user) {
      fetchUsers();
    }
  }, [user]);

  const fetchUsers = async () => {
    try {
      const { data: accountUsers, error } = await supabase
        .from('account_users')
        .select('*')
        .eq('user_id', user?.id)
        .order('created_at', { ascending: true });

      if (error) throw error;
      setUsers(accountUsers || []);
    } catch (error) {
      console.error('Error fetching account users:', error);
      toast.error('Erro ao carregar usuários');
    } finally {
      setLoading(false);
    }
  };

  const handleAddUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    setIsSubmitting(true);

    try {
      // Basic validation
      if (!newUser.name.trim()) {
        throw new Error('Nome é obrigatório');
      }

      if (!newUser.email.trim()) {
        throw new Error('Email é obrigatório');
      }

      if (!newUser.password || newUser.password.length < 6) {
        throw new Error('Senha deve ter pelo menos 6 caracteres');
      }

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/create-account-user`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            name: newUser.name.trim(),
            email: newUser.email.trim(),
            password: newUser.password,
            role: newUser.role,
            user_id: user.id
          }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Erro ao criar usuário');
      }

      setUsers(prev => [...prev, data.data]);
      setShowAddModal(false);
      setNewUser({ name: '', email: '', password: '', role: 'user' });
      toast.success('Usuário adicionado com sucesso!');

    } catch (error) {
      console.error('Error adding user:', error);
      const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
      
      if (errorMessage.includes('already has an account')) {
        toast.error('Este email já está cadastrado');
      } else if (errorMessage.includes('Missing required fields')) {
        toast.error('Por favor, preencha todos os campos obrigatórios');
      } else if (errorMessage.includes('Invalid email format')) {
        toast.error('Formato de email inválido');
      } else if (errorMessage.includes('Password must be')) {
        toast.error('Senha deve ter pelo menos 6 caracteres');
      } else if (errorMessage.includes('Authentication check failed')) {
        toast.error('Erro de autenticação ao criar usuário');
      } else if (errorMessage.includes('Database operation failed')) {
        toast.error('Erro ao salvar dados do usuário');
      } else if (errorMessage.includes('Missing Supabase configuration')) {
        toast.error('Erro de configuração do servidor');
      } else {
        toast.error(`Erro ao adicionar usuário: ${errorMessage}`);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteUser = async () => {
    if (!selectedUser || !user) return;

    try {
      const { error } = await supabase
        .from('account_users')
        .delete()
        .eq('id', selectedUser.id)
        .eq('user_id', user.id);

      if (error) throw error;

      setUsers(prev => prev.filter(u => u.id !== selectedUser.id));
      setShowDeleteModal(false);
      setSelectedUser(null);
      toast.success('Usuário removido com sucesso');
    } catch (error) {
      console.error('Error deleting user:', error);
      toast.error('Erro ao remover usuário');
    }
  };

  if (loading) {
    return (
      <Card>
        <div className="p-6 flex items-center justify-center">
          <div className="animate-spin rounded-full h-8 w-8 border-2 border-blue-600 border-t-transparent" />
        </div>
      </Card>
    );
  }

  return (
    <Card>
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">Usuários da Conta</h2>
          <Button
            onClick={() => setShowAddModal(true)}
            disabled={users.length >= 2}
          >
            <UserPlus className="h-5 w-5 mr-2" />
            Adicionar Usuário
          </Button>
        </div>

        <div className="space-y-4">
          {users.length === 0 ? (
            <p className="text-center text-gray-500 py-4">
              Nenhum usuário adicionado. Você pode adicionar até 2 usuários adicionais.
            </p>
          ) : (
            <div className="divide-y divide-gray-200">
              {users.map(accountUser => (
                <div
                  key={accountUser.id}
                  className="py-4 flex items-center justify-between"
                >
                  <div>
                    <p className="font-medium text-gray-900">{accountUser.name}</p>
                    <p className="text-sm text-gray-500">{accountUser.email}</p>
                    <span className={`mt-1 inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                      accountUser.role === 'admin' 
                        ? 'bg-purple-100 text-purple-800'
                        : 'bg-blue-100 text-blue-800'
                    }`}>
                      {accountUser.role === 'admin' ? 'Administrador' : 'Usuário'}
                    </span>
                  </div>
                  <Button
                    variant="secondary"
                    onClick={() => {
                      setSelectedUser(accountUser);
                      setShowDeleteModal(true);
                    }}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <Modal
        isOpen={showAddModal}
        onClose={() => setShowAddModal(false)}
        title="Adicionar Usuário"
      >
        <form onSubmit={handleAddUser} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">
              Nome
            </label>
            <input
              type="text"
              value={newUser.name}
              onChange={(e) => setNewUser(prev => ({ ...prev, name: e.target.value }))}
              className="mt-1 block w-full rounded-lg border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
              required
              disabled={isSubmitting}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">
              Email
            </label>
            <input
              type="email"
              value={newUser.email}
              onChange={(e) => setNewUser(prev => ({ ...prev, email: e.target.value }))}
              className="mt-1 block w-full rounded-lg border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
              required
              disabled={isSubmitting}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">
              Senha
            </label>
            <input
              type="password"
              value={newUser.password}
              onChange={(e) => setNewUser(prev => ({ ...prev, password: e.target.value }))}
              className="mt-1 block w-full rounded-lg border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
              required
              minLength={6}
              disabled={isSubmitting}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">
              Função
            </label>
            <select
              value={newUser.role}
              onChange={(e) => setNewUser(prev => ({ ...prev, role: e.target.value as 'admin' | 'user' }))}
              className="mt-1 block w-full rounded-lg border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
              disabled={isSubmitting}
            >
              <option value="user">Usuário</option>
              <option value="admin">Administrador</option>
            </select>
          </div>

          <div className="flex justify-end space-x-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setShowAddModal(false)}
              disabled={isSubmitting}
            >
              Cancelar
            </Button>
            <Button 
              type="submit"
              disabled={isSubmitting}
            >
              {isSubmitting ? (
                <div className="flex items-center">
                  <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent mr-2" />
                  Adicionando...
                </div>
              ) : (
                'Adicionar'
              )}
            </Button>
          </div>
        </form>
      </Modal>

      <Modal
        isOpen={showDeleteModal}
        onClose={() => {
          setShowDeleteModal(false);
          setSelectedUser(null);
        }}
        title="Remover Usuário"
      >
        <div className="space-y-4">
          <div className="flex items-start space-x-2 text-yellow-700">
            <AlertTriangle className="h-5 w-5 mt-0.5 flex-shrink-0" />
            <div>
              <p className="font-medium">
                Tem certeza que deseja remover este usuário?
              </p>
              <p className="mt-1 text-sm text-yellow-600">
                Esta ação não pode ser desfeita.
              </p>
            </div>
          </div>

          <div className="flex justify-end space-x-2 mt-6">
            <Button
              variant="secondary"
              onClick={() => {
                setShowDeleteModal(false);
                setSelectedUser(null);
              }}
            >
              Cancelar
            </Button>
            <Button
              onClick={handleDeleteUser}
              className="bg-red-600 hover:bg-red-700"
            >
              Remover
            </Button>
          </div>
        </div>
      </Modal>
    </Card>
  );
}