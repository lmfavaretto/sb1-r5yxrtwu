import { useState, useEffect } from 'react';
import { Bell, Store } from 'lucide-react';
import { Button } from '../ui/Button';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';

function gerarSaudacao() {
  const hora = new Date().getHours();
  if (hora < 12) return "Bom dia";
  if (hora < 18) return "Boa tarde";
  return "Boa noite";
}

export function Header() {
  const { user, signOut } = useAuth();
  const [userData, setUserData] = useState<{
    name: string | null;
    business_name: string | null;
    logo_url: string | null;
  }>({
    name: null,
    business_name: null,
    logo_url: null
  });
  const [imageError, setImageError] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchUserData = async () => {
      if (!user?.email) {
        setLoading(false);
        return;
      }

      try {
        // First check if user is a secondary user
        const { data: accountUser } = await supabase
          .from('account_users')
          .select('name, user_id')
          .eq('email', user.email)
          .maybeSingle();

        if (accountUser) {
          // Get parent user's business data
          const { data: parentData, error: parentError } = await supabase
            .from('users')
            .select('business_name, logo_url')
            .eq('id', accountUser.user_id)
            .single();

          if (parentError) throw parentError;

          let publicUrl = null;
          if (parentData?.logo_url) {
            const { data: { publicUrl: url } } = supabase
              .storage
              .from('logos')
              .getPublicUrl(parentData.logo_url);
            publicUrl = url;
          }

          setUserData({
            name: accountUser.name,
            business_name: parentData.business_name,
            logo_url: publicUrl
          });
          setImageError(false);
          setLoading(false);
          return;
        }

        // If not a secondary user, get own data
        const { data: ownData, error: ownError } = await supabase
          .from('users')
          .select('name, business_name, logo_url')
          .eq('id', user.id)
          .single();

        if (ownError) throw ownError;

        let publicUrl = null;
        if (ownData?.logo_url) {
          const { data: { publicUrl: url } } = supabase
            .storage
            .from('logos')
            .getPublicUrl(ownData.logo_url);
          publicUrl = url;
        }

        setUserData({
          name: ownData.name,
          business_name: ownData.business_name,
          logo_url: publicUrl
        });
        setImageError(false);

      } catch (error) {
        console.error('Error fetching user data:', error);
        setImageError(true);
      } finally {
        setLoading(false);
      }
    };

    fetchUserData();

    // Subscribe to realtime changes
    const channel = supabase
      .channel('user_updates')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'users',
          filter: `id=eq.${user?.id}`
        },
        async (payload) => {
          if (!payload.new) return;

          let publicUrl = null;
          if (payload.new.logo_url) {
            const { data: { publicUrl: url } } = supabase
              .storage
              .from('logos')
              .getPublicUrl(payload.new.logo_url);
            publicUrl = url;
          }

          setUserData({
            name: payload.new.name || null,
            business_name: payload.new.business_name || null,
            logo_url: publicUrl
          });
          setImageError(false);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user]);

  return (
    <header className="h-16 bg-white border-b border-gray-200 px-6 flex items-center justify-between">
      <div className="flex items-center space-x-4">
        {loading ? (
          <div className="h-8 w-8 rounded bg-gray-100 animate-pulse" />
        ) : userData.logo_url && !imageError ? (
          <div className="relative h-8 w-8 bg-white rounded overflow-hidden">
            <img
              src={userData.logo_url}
              alt="Logo da empresa"
              className="h-full w-full object-contain"
              onError={() => setImageError(true)}
            />
          </div>
        ) : (
          <Store className="h-8 w-8 text-gray-400" />
        )}
        <div className="flex flex-col">
          <h1 className="text-lg font-medium text-gray-900">
            {`${gerarSaudacao()}, ${userData.name || 'Usuário'}`}
          </h1>
          {userData.business_name && (
            <p className="text-sm text-gray-500">
              {userData.business_name}
            </p>
          )}
        </div>
      </div>
      
      <div className="flex items-center space-x-4">
        <Button variant="secondary" className="p-2">
          <Bell className="h-5 w-5" />
        </Button>
        
        <Button variant="secondary" onClick={() => signOut()}>
          Sair
        </Button>
      </div>
    </header>
  );
}