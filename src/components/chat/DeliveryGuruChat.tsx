import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Send, Bot, Sparkles, Brain, MessageSquare, Trash2, Clock, ArrowRight } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Button } from '../ui/Button';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  whatsappAction?: {
    template: string;
    segment: string;
    message: string;
    criteria: Record<string, any>;
  };
}

interface DeliveryGuruChatProps {
  onSendMessage: (message: string) => Promise<string>;
}

const SUGGESTED_QUESTIONS = [
  'Quais clientes devo reativar essa semana?',
  'Qual campanha gerou mais resposta no último mês?',
  'Me sugira uma campanha para clientes que sumiram depois de 2 pedidos',
  'Qual é o melhor horário para enviar campanhas?',
  'Me dá uma ideia de mensagem para um combo promocional',
  'Qual cliente gastou mais nos últimos 30 dias?',
  'Quais produtos tiveram queda nas vendas?',
  'Como está o desempenho dos clientes VIP?'
];

const RATE_LIMIT = {
  REQUESTS_PER_WINDOW: 3,
  WINDOW_MS: 180000,
  COOLDOWN_MS: 30000,
  MIN_COOLDOWN_MS: 10000,
};

export function DeliveryGuruChat({ onSendMessage }: DeliveryGuruChatProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const cooldownIntervalRef = useRef<number>();
  const requestTimestampsRef = useRef<number[]>([]);
  const navigate = useNavigate();

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  useEffect(() => {
    return () => {
      if (cooldownIntervalRef.current) {
        clearInterval(cooldownIntervalRef.current);
      }
    };
  }, []);

  const checkRateLimit = (): number => {
    const now = Date.now();
    
    requestTimestampsRef.current = requestTimestampsRef.current.filter(
      timestamp => now - timestamp < RATE_LIMIT.WINDOW_MS
    );

    if (requestTimestampsRef.current.length >= RATE_LIMIT.REQUESTS_PER_WINDOW) {
      const oldestTimestamp = requestTimestampsRef.current[0];
      const timeUntilNextWindow = RATE_LIMIT.WINDOW_MS - (now - oldestTimestamp);
      return Math.max(timeUntilNextWindow, RATE_LIMIT.MIN_COOLDOWN_MS);
    }

    const lastRequest = requestTimestampsRef.current[requestTimestampsRef.current.length - 1];
    if (lastRequest) {
      const timeSinceLastRequest = now - lastRequest;
      if (timeSinceLastRequest < RATE_LIMIT.COOLDOWN_MS) {
        return Math.max(RATE_LIMIT.COOLDOWN_MS - timeSinceLastRequest, RATE_LIMIT.MIN_COOLDOWN_MS);
      }
    }

    return 0;
  };

  const startCooldown = (duration: number) => {
    const adjustedDuration = Math.max(duration, RATE_LIMIT.MIN_COOLDOWN_MS);
    
    if (cooldownIntervalRef.current) {
      clearInterval(cooldownIntervalRef.current);
    }

    setCooldown(Math.ceil(adjustedDuration / 1000));
    
    cooldownIntervalRef.current = window.setInterval(() => {
      setCooldown(prev => {
        if (prev <= 1) {
          clearInterval(cooldownIntervalRef.current);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || loading || cooldown > 0) return;

    setError(null);
    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: input.trim(),
      timestamp: new Date(),
    };

    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setLoading(true);

    try {
      const waitTime = checkRateLimit();
      if (waitTime > 0) {
        const waitTimeSeconds = Math.ceil(waitTime / 1000);
        throw new Error(`Aguarde ${waitTimeSeconds} segundos antes de enviar uma nova mensagem.`);
      }

      const response = await onSendMessage(userMessage.content);
      requestTimestampsRef.current.push(Date.now());

      // Extract WhatsApp action from response
      const [messageContent, actionContent] = response.split('[whatsapp_action]');
      
      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: messageContent.trim(),
        timestamp: new Date(),
      };

      // Parse WhatsApp action if present
      if (actionContent) {
        try {
          const actionJson = actionContent.trim();
          assistantMessage.whatsappAction = JSON.parse(actionJson);
        } catch (error) {
          console.error('Error parsing WhatsApp action:', error);
        }
      }

      setMessages(prev => [...prev, assistantMessage]);
      startCooldown(RATE_LIMIT.COOLDOWN_MS);

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Erro inesperado.';
      setError(errorMessage);
      if (errorMessage.includes('Aguarde') || errorMessage.includes('Muitas requisições')) {
        const waitTimeMatch = errorMessage.match(/\d+/);
        const waitTime = waitTimeMatch ? parseInt(waitTimeMatch[0]) * 1000 : RATE_LIMIT.COOLDOWN_MS;
        startCooldown(waitTime);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleCreateCampaign = (action: Message['whatsappAction']) => {
    if (!action) return;

    const params = new URLSearchParams({
      template: action.template,
      segment: action.segment,
      message: action.message,
      criteria: JSON.stringify(action.criteria)
    });

    navigate(`/whatsapp/campaigns/auto?${params.toString()}`);
  };

  const clearChat = () => {
    setMessages([]);
    setError(null);
  };

  const renderMessageContent = (message: Message) => {
    if (message.role === 'user') {
      return (
        <div className="flex justify-end mb-4">
          <div className="max-w-[80%] bg-blue-600 text-white rounded-xl px-4 py-2">
            <p className="text-sm">{message.content}</p>
            <p className="text-xs mt-1 opacity-70">
              {format(message.timestamp, 'HH:mm', { locale: ptBR })}
            </p>
          </div>
        </div>
      );
    }

    const sections = message.content.split(/\n(?=📊|💡|📱)/g);
    
    return (
      <div className="flex mb-4">
        <div className="max-w-[80%] bg-gray-100 rounded-xl px-4 py-2">
          {sections.map((section, index) => {
            const type = section.startsWith('📊') ? 'insight' :
                       section.startsWith('💡') ? 'opportunity' :
                       section.startsWith('📱') ? 'action' : 'text';

            const className = type === 'insight' ? 'bg-blue-50 text-blue-800' :
                           type === 'opportunity' ? 'bg-green-50 text-green-800' :
                           type === 'action' ? 'bg-purple-50 text-purple-800' : '';

            return className ? (
              <div key={index} className={`${className} rounded-lg p-3 mb-2`}>
                {section}
              </div>
            ) : (
              <p key={index} className="mb-2">{section}</p>
            );
          })}

          {message.whatsappAction && (
            <Button
              onClick={() => handleCreateCampaign(message.whatsappAction)}
              className="mt-3 w-full flex items-center justify-center gap-2"
            >
              Criar Campanha no WhatsApp
              <ArrowRight className="h-4 w-4" />
            </Button>
          )}

          <p className="text-xs mt-1 text-gray-500">
            {format(message.timestamp, 'HH:mm', { locale: ptBR })}
          </p>
        </div>
      </div>
    );
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto p-6 space-y-4">
        {messages.length === 0 ? (
          <div className="text-center text-gray-500 space-y-4">
            <div className="flex items-center justify-center gap-2">
              <Bot className="h-12 w-12 text-blue-600" />
              <Sparkles className="h-6 w-6 text-yellow-400 animate-pulse" />
            </div>
            <h2 className="text-xl font-semibold text-gray-900">
              Delivery Guru
            </h2>
            <p className="text-gray-600">
              Olá! Sou seu consultor estratégico de marketing para delivery. Como posso ajudar seu negócio hoje?
            </p>
            <div className="grid grid-cols-2 gap-2 mt-4">
              {SUGGESTED_QUESTIONS.map((question) => (
                <button
                  key={question}
                  onClick={() => setInput(question)}
                  className="p-3 bg-gray-50 text-gray-700 rounded-xl hover:bg-gray-100 transition-colors text-sm text-left flex items-start gap-2"
                >
                  <MessageSquare className="h-4 w-4 mt-0.5 flex-shrink-0" />
                  <span>{question}</span>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <>
            {messages.map((message) => renderMessageContent(message))}
            {error && (
              <div className="flex justify-center">
                <div className="bg-red-50 text-red-600 rounded-xl px-4 py-2 text-sm">
                  {error}
                </div>
              </div>
            )}
          </>
        )}
        {loading && (
          <div className="flex justify-start">
            <div className="bg-gray-100 rounded-xl px-4 py-2">
              <div className="flex items-center gap-2">
                <Brain className="h-5 w-5 text-blue-600" />
                <div className="flex space-x-2">
                  <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" />
                  <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }} />
                  <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.4s' }} />
                </div>
              </div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <div className="border-t border-gray-200 p-4">
        <form onSubmit={handleSubmit} className="flex space-x-4">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Digite sua pergunta..."
            className="flex-1 rounded-xl border-gray-300 focus:border-blue-500 focus:ring-blue-500"
            disabled={loading || cooldown > 0}
          />
          <Button 
            type="submit" 
            disabled={loading || !input.trim() || cooldown > 0}
            className="relative"
          >
            {cooldown > 0 ? (
              <>
                <Clock className="h-5 w-5" />
                <span className="absolute -top-2 -right-2 bg-blue-600 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
                  {cooldown}
                </span>
              </>
            ) : (
              <Send className="h-5 w-5" />
            )}
          </Button>
          {messages.length > 0 && (
            <Button
              type="button"
              variant="secondary"
              onClick={clearChat}
              title="Limpar conversa"
            >
              <Trash2 className="h-5 w-5" />
            </Button>
          )}
        </form>
      </div>
    </div>
  );
}