import { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import toast from 'react-hot-toast';

export function WhatsAppCallback() {
  const [error, setError] = useState<string | null>(null);
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    const handleCallback = async () => {
      try {
        // Get code from URL
        const code = new URLSearchParams(location.search).get('code');
        if (!code) {
          throw new Error('No authorization code received');
        }

        // Get current user
        const { data: { user }, error: userError } = await supabase.auth.getUser();
        if (userError) throw userError;
        if (!user) throw new Error('User not authenticated');

        // Exchange code for access token
        const tokenUrl = `https://graph.facebook.com/v19.0/oauth/access_token?client_id=${import.meta.env.VITE_FB_APP_ID}&redirect_uri=${import.meta.env.VITE_FB_REDIRECT_URI}&client_secret=${import.meta.env.VITE_FB_APP_SECRET}&code=${code}`;

        const tokenResponse = await fetch(tokenUrl);
        if (!tokenResponse.ok) {
          const error = await tokenResponse.json();
          throw new Error(error.error?.message || 'Failed to get access token');
        }

        const { access_token } = await tokenResponse.json();

        // Get business accounts
        const businessResponse = await fetch('https://graph.facebook.com/v19.0/me/businesses', {
          headers: {
            'Authorization': `Bearer ${access_token}`
          }
        });

        if (!businessResponse.ok) {
          const errorData = await businessResponse.json();
          throw new Error(errorData?.error?.message || 'Failed to get business accounts');
        }

        const businessData = await businessResponse.json();
        if (!businessData?.data || businessData.data.length === 0) {
          throw new Error('No business accounts found. Please make sure you have a Business Manager account.');
        }

        const businessId = businessData.data[0].id;

        // Get WhatsApp Business accounts
        const wabaResponse = await fetch(
          `https://graph.facebook.com/v19.0/${businessId}/owned_whatsapp_business_accounts`,
          {
            headers: {
              'Authorization': `Bearer ${access_token}`
            }
          }
        );

        if (!wabaResponse.ok) {
          const errorData = await wabaResponse.json();
          throw new Error(errorData?.error?.message || 'Failed to get WhatsApp Business accounts');
        }

        const wabaData = await wabaResponse.json();
        if (!wabaData?.data || wabaData.data.length === 0) {
          throw new Error('No WhatsApp Business accounts found. Please make sure you have WhatsApp Business configured in your Business Manager.');
        }

        const wabaId = wabaData.data[0].id;

        // Get WhatsApp Business phone numbers
        const phoneResponse = await fetch(
          `https://graph.facebook.com/v19.0/${wabaId}/phone_numbers`,
          {
            headers: {
              'Authorization': `Bearer ${access_token}`
            }
          }
        );

        if (!phoneResponse.ok) {
          const errorData = await phoneResponse.json();
          throw new Error(errorData?.error?.message || 'Failed to get phone number info');
        }

        const phoneData = await phoneResponse.json();
        if (!phoneData.data?.[0]) {
          throw new Error('No WhatsApp Business phone numbers found. Please make sure you have a phone number configured in your Business Manager.');
        }

        const phoneNumberId = phoneData.data[0].id;
        const phoneDisplay = phoneData.data[0].display_phone_number;

        // Save connection in Supabase
        const { error: insertError } = await supabase
          .from('whatsapp_connections')
          .upsert({
            user_id: user.id,
            phone_number_id: phoneNumberId,
            phone_display: phoneDisplay,
            business_id: wabaId,
            access_token,
            connected_at: new Date().toISOString(),
          });

        if (insertError) throw insertError;

        // Redirect back to WhatsApp page with success message
        navigate('/whatsapp');
        toast.success('WhatsApp Business conectado com sucesso!');

      } catch (err) {
        console.error('WhatsApp callback error:', err);
        const errorMessage = err instanceof Error ? err.message : 'Failed to connect WhatsApp Business';
        setError(errorMessage);
        toast.error(errorMessage);
      }
    };

    handleCallback();
  }, [location.search, navigate]);

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white p-8 rounded-xl shadow-lg max-w-md w-full">
          <div className="text-center">
            <h2 className="text-xl font-semibold text-red-600 mb-2">Connection Error</h2>
            <p className="text-gray-600">{error}</p>
            <button
              onClick={() => navigate('/whatsapp')}
              className="mt-4 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200"
            >
              Back to WhatsApp
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="text-center">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600 mx-auto" />
        <p className="mt-4 text-gray-600">Connecting to WhatsApp Business...</p>
      </div>
    </div>
  );
}