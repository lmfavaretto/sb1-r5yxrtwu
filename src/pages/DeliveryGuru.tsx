import { PageLayout } from '../components/layout/PageLayout';
import { Card } from '../components/ui/Card';
import { DeliveryGuruChat } from '../components/chat/DeliveryGuruChat';
import { useAuth } from '../contexts/AuthContext';

export function DeliveryGuru() {
  const { user } = useAuth();

  const handleSendMessage = async (message: string) => {
    if (!user?.id) {
      throw new Error('Você precisa estar logado para usar o chat');
    }

    const response = await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/delivery-guru`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          user_id: user.id,
          question: message
        }),
      }
    );

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      if (response.status === 429) {
        throw new Error('Muitas requisições. Por favor, aguarde alguns segundos e tente novamente.');
      }
      throw new Error(errorData.error || `Erro ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();
    if (!data.answer) throw new Error('Resposta inválida do servidor');
    return data.answer;
  };

  return (
    <PageLayout>
      <div className="max-w-4xl mx-auto">
        <Card className="h-[calc(100vh-8rem)]">
          <DeliveryGuruChat onSendMessage={handleSendMessage} />
        </Card>
      </div>
    </PageLayout>
  );
}