import { useState, useEffect } from 'react';
import { Bell, Store, Building2, Upload, Image } from 'lucide-react';
import { PageLayout } from '../components/layout/PageLayout';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { AccountUsers } from '../components/settings/AccountUsers';
import toast from 'react-hot-toast';

interface UserSettings {
  notifications_enabled: boolean;
  email_frequency: 'daily' | 'weekly' | 'monthly' | 'never';
  whatsapp_notifications: boolean;
}

interface UserProfile {
  name: string;
  email: string;
  phone: string;
  business_name: string;
  logo_url?: string;
}

export function Settings() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [settings, setSettings] = useState<UserSettings>({
    notifications_enabled: true,
    email_frequency: 'daily',
    whatsapp_notifications: false,
  });
  const [profile, setProfile] = useState<UserProfile>({
    name: '',
    email: '',
    phone: '',
    business_name: '',
    logo_url: '',
  });
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [imageError, setImageError] = useState(false);
  const { user } = useAuth();

  useEffect(() => {
    const fetchUserData = async () => {
      if (!user) return;

      try {
        setLoading(true);
        const { data: userData, error: userError } = await supabase
          .from('users')
          .select('name, email, phone, business_name, logo_url')
          .eq('id', user.id)
          .maybeSingle();

        if (userError) throw userError;

        // Get public URL for logo if it exists
        let publicUrl = null;
        if (userData?.logo_url) {
          const { data: { publicUrl: url } } = supabase
            .storage
            .from('logos')
            .getPublicUrl(userData.logo_url);
          publicUrl = url;
        }

        setProfile({
          name: userData?.name || '',
          email: userData?.email || user.email || '',
          phone: userData?.phone || '',
          business_name: userData?.business_name || '',
          logo_url: publicUrl || '',
        });
        setImageError(false);

        const { data: settingsData, error: settingsError } = await supabase
          .from('settings')
          .select('*')
          .eq('user_id', user.id)
          .maybeSingle();

        if (settingsError && settingsError.code !== 'PGRST116') {
          throw settingsError;
        }

        if (settingsData) {
          setSettings({
            notifications_enabled: settingsData.notifications_enabled,
            email_frequency: settingsData.email_frequency,
            whatsapp_notifications: settingsData.whatsapp_notifications,
          });
        }
      } catch (error) {
        console.error('Error loading user data:', error);
        setError('Failed to load user data');
      } finally {
        setLoading(false);
      }
    };

    fetchUserData();
  }, [user]);

  const handleLogoUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !user) return;

    try {
      setUploadingLogo(true);
      setError(null);

      // Validate file type
      if (!file.type.startsWith('image/')) {
        throw new Error('Please upload an image file');
      }

      // Validate file size (max 2MB)
      if (file.size > 2 * 1024 * 1024) {
        throw new Error('Image size should be less than 2MB');
      }

      // Upload to Supabase Storage
      const fileExt = file.name.split('.').pop();
      const fileName = `${user.id}/${Date.now()}.${fileExt}`;

      // Upload file
      const { error: uploadError } = await supabase.storage
        .from('logos')
        .upload(fileName, file, { upsert: true });

      if (uploadError) throw uploadError;

      // Get public URL
      const { data: { publicUrl } } = supabase.storage
        .from('logos')
        .getPublicUrl(fileName);

      // Update user profile with logo URL
      const { error: updateError } = await supabase
        .from('users')
        .update({ logo_url: fileName })
        .eq('id', user.id);

      if (updateError) throw updateError;

      // Update local state
      setProfile(prev => ({ ...prev, logo_url: publicUrl }));
      setImageError(false);
      toast.success('Logo uploaded successfully');

    } catch (error) {
      console.error('Error uploading logo:', error);
      setError(error instanceof Error ? error.message : 'Failed to upload logo');
      toast.error('Failed to upload logo');
    } finally {
      setUploadingLogo(false);
    }
  };

  const handleSave = async () => {
    if (!user) return;

    try {
      setSaving(true);
      setError(null);

      // Update user profile
      const { error: userError } = await supabase
        .from('users')
        .update({
          name: profile.name,
          phone: profile.phone,
          business_name: profile.business_name,
        })
        .eq('id', user.id);

      if (userError) throw userError;

      // Check if settings exist
      const { data: existingSettings, error: checkError } = await supabase
        .from('settings')
        .select('id')
        .eq('user_id', user.id)
        .maybeSingle();

      if (checkError) throw checkError;

      let settingsError;

      if (existingSettings) {
        // Update existing settings
        const { error } = await supabase
          .from('settings')
          .update({
            notifications_enabled: settings.notifications_enabled,
            email_frequency: settings.email_frequency,
            whatsapp_notifications: settings.whatsapp_notifications,
          })
          .eq('user_id', user.id);
        
        settingsError = error;
      } else {
        // Insert new settings
        const { error } = await supabase
          .from('settings')
          .insert({
            user_id: user.id,
            notifications_enabled: settings.notifications_enabled,
            email_frequency: settings.email_frequency,
            whatsapp_notifications: settings.whatsapp_notifications,
          });
        
        settingsError = error;
      }

      if (settingsError) throw settingsError;

      toast.success('Settings saved successfully');
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (error) {
      console.error('Error saving settings:', error);
      setError('Failed to save settings');
      toast.error('Failed to save settings');
    } finally {
      setSaving(false);
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

  return (
    <PageLayout>
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold text-gray-900">Settings</h1>
          <Button
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? 'Saving...' : 'Save Changes'}
          </Button>
        </div>

        {error && (
          <div className="bg-red-50 text-red-700 p-4 rounded-xl">
            {error}
          </div>
        )}

        {success && (
          <div className="bg-green-50 text-green-700 p-4 rounded-xl">
            Settings saved successfully
          </div>
        )}

        <Card>
          <div className="space-y-6">
            <h2 className="text-lg font-medium text-gray-900 flex items-center gap-2">
              <Image className="h-5 w-5 text-gray-500" />
              Business Logo
            </h2>

            <div className="flex items-start space-x-4">
              <div className="flex-shrink-0">
                {profile.logo_url && !imageError ? (
                  <div className="relative h-16 w-16 bg-white rounded-lg overflow-hidden">
                    <img
                      src={profile.logo_url}
                      alt="Business logo"
                      className="h-full w-full object-contain"
                      onError={() => setImageError(true)}
                    />
                  </div>
                ) : (
                  <div className="h-16 w-16 rounded-lg bg-gray-100 flex items-center justify-center">
                    <Image className="h-8 w-8 text-gray-400" />
                  </div>
                )}
              </div>
              <div className="flex-1">
                <label className="relative cursor-pointer inline-flex items-center space-x-2 px-4 py-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 focus-within:ring-2 focus-within:ring-offset-2 focus-within:ring-blue-500">
                  <Upload className="h-5 w-5 text-gray-400" />
                  <span className="text-sm font-medium text-gray-700">
                    {uploadingLogo ? 'Uploading...' : 'Upload Logo'}
                  </span>
                  <input
                    type="file"
                    className="sr-only"
                    accept="image/*"
                    onChange={handleLogoUpload}
                    disabled={uploadingLogo}
                  />
                </label>
                <p className="mt-2 text-sm text-gray-500">
                  Recommended: Square image, max 2MB
                </p>
              </div>
            </div>
          </div>
        </Card>

        <Card>
          <div className="space-y-6">
            <h2 className="text-lg font-medium text-gray-900 flex items-center gap-2">
              <Store className="h-5 w-5 text-gray-500" />
              Profile Information
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-gray-700">
                  Name
                </label>
                <input
                  type="text"
                  value={profile.name}
                  onChange={(e) => setProfile(prev => ({ ...prev, name: e.target.value }))}
                  className="mt-1 block w-full rounded-lg border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700">
                  Email
                </label>
                <input
                  type="email"
                  value={profile.email}
                  disabled
                  className="mt-1 block w-full rounded-lg border-gray-300 bg-gray-50 shadow-sm"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700">
                  Phone
                </label>
                <input
                  type="tel"
                  value={profile.phone}
                  onChange={(e) => setProfile(prev => ({ ...prev, phone: e.target.value }))}
                  className="mt-1 block w-full rounded-lg border-gray-300 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700">
                  Business Name
                </label>
                <input
                  type="text"
                  value={profile.business_name}
                  onChange={(e) => setProfile(prev => ({ ...prev, business_name: e.target.value }))}
                  className="mt-1 block w-full rounded-lg border-gray-300 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
            </div>
          </div>
        </Card>

        <AccountUsers />

        <Card>
          <div className="space-y-6">
            <h2 className="text-lg font-medium text-gray-900 flex items-center gap-2">
              <Bell className="h-5 w-5 text-gray-500" />
              Notification Preferences
            </h2>

            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Bell className="h-5 w-5 text-gray-500" />
                  <div>
                    <p className="font-medium text-gray-900">Enable Notifications</p>
                    <p className="text-sm text-gray-500">Receive updates about your business</p>
                  </div>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={settings.notifications_enabled}
                    onChange={(e) => setSettings(prev => ({ ...prev, notifications_enabled: e.target.checked }))}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                </label>
              </div>

              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Building2 className="h-5 w-5 text-gray-500" />
                  <div>
                    <p className="font-medium text-gray-900">WhatsApp Notifications</p>
                    <p className="text-sm text-gray-500">Receive notifications via WhatsApp</p>
                  </div>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={settings.whatsapp_notifications}
                    onChange={(e) => setSettings(prev => ({ ...prev, whatsapp_notifications: e.target.checked }))}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                </label>
              </div>

              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Bell className="h-5 w-5 text-gray-500" />
                  <div>
                    <p className="font-medium text-gray-900">Email Frequency</p>
                    <p className="text-sm text-gray-500">How often you want to receive email updates</p>
                  </div>
                </div>
                <select
                  value={settings.email_frequency}
                  onChange={(e) => setSettings(prev => ({ ...prev, email_frequency: e.target.value as UserSettings['email_frequency'] }))}
                  className="rounded-lg border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                >
                  <option value="daily">Daily</option>
                  <option value="weekly">Weekly</option>
                  <option value="monthly">Monthly</option>
                  <option value="never">Never</option>
                </select>
              </div>
            </div>
          </div>
        </Card>
      </div>
    </PageLayout>
  );
}