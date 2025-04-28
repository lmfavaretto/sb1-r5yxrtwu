/*
  # Create WhatsApp campaigns tables

  1. New Tables
    - `whatsapp_campaigns`
      - `id` (uuid, primary key)
      - `user_id` (uuid, references users.id)
      - `name` (text)
      - `segment` (text)
      - `template_name` (text)
      - `template_params` (jsonb)
      - `scheduled_at` (timestamptz)
      - `status` (text)
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)
    
    - `whatsapp_campaign_logs`
      - `id` (uuid, primary key)
      - `campaign_id` (uuid, references whatsapp_campaigns.id)
      - `customer_id` (uuid, references customers.id)
      - `status` (text)
      - `error` (text)
      - `sent_at` (timestamptz)

  2. Security
    - Enable RLS on both tables
    - Add policies for authenticated users
*/

-- Create whatsapp_campaigns table
CREATE TABLE IF NOT EXISTS whatsapp_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES users(id) ON DELETE CASCADE NOT NULL,
  name text NOT NULL,
  segment text NOT NULL,
  template_name text NOT NULL,
  template_params jsonb DEFAULT '{}'::jsonb,
  scheduled_at timestamptz NOT NULL,
  status text DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'sending', 'completed', 'failed')),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create whatsapp_campaign_logs table
CREATE TABLE IF NOT EXISTS whatsapp_campaign_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid REFERENCES whatsapp_campaigns(id) ON DELETE CASCADE NOT NULL,
  customer_id uuid REFERENCES customers(id) ON DELETE CASCADE NOT NULL,
  status text DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'delivered', 'read', 'failed')),
  error text,
  sent_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE whatsapp_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE whatsapp_campaign_logs ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Users can manage own campaigns"
  ON whatsapp_campaigns
  FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can view campaign logs"
  ON whatsapp_campaign_logs
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM whatsapp_campaigns
      WHERE whatsapp_campaigns.id = whatsapp_campaign_logs.campaign_id
      AND whatsapp_campaigns.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM whatsapp_campaigns
      WHERE whatsapp_campaigns.id = whatsapp_campaign_logs.campaign_id
      AND whatsapp_campaigns.user_id = auth.uid()
    )
  );

-- Create indexes
CREATE INDEX whatsapp_campaigns_user_id_idx ON whatsapp_campaigns(user_id);
CREATE INDEX whatsapp_campaigns_status_idx ON whatsapp_campaigns(status);
CREATE INDEX whatsapp_campaign_logs_campaign_id_idx ON whatsapp_campaign_logs(campaign_id);

-- Create updated_at trigger
CREATE OR REPLACE FUNCTION update_whatsapp_campaigns_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_whatsapp_campaigns_updated_at
  BEFORE UPDATE ON whatsapp_campaigns
  FOR EACH ROW
  EXECUTE FUNCTION update_whatsapp_campaigns_updated_at();