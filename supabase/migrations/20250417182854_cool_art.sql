/*
  # Add WhatsApp connections table

  1. New Tables
    - `whatsapp_connections`
      - `id` (uuid, primary key)
      - `user_id` (uuid, foreign key to users)
      - `phone_number_id` (text)
      - `phone_display` (text)
      - `business_id` (text)
      - `access_token` (text)
      - `connected_at` (timestamptz)
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)

  2. Security
    - Enable RLS on `whatsapp_connections` table
    - Add policy for authenticated users to manage their own connections
    - Add policy for authenticated users to read their own connections

  3. Indexes
    - Index on user_id for faster lookups
    - Unique constraint on user_id and phone_number_id combination
*/

-- Create the whatsapp_connections table
CREATE TABLE IF NOT EXISTS public.whatsapp_connections (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    phone_number_id text NOT NULL,
    phone_display text NOT NULL,
    business_id text NOT NULL,
    access_token text NOT NULL,
    connected_at timestamptz NOT NULL DEFAULT now(),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS whatsapp_connections_user_id_idx ON public.whatsapp_connections(user_id);
CREATE UNIQUE INDEX IF NOT EXISTS whatsapp_connections_user_phone_idx ON public.whatsapp_connections(user_id, phone_number_id);

-- Enable Row Level Security
ALTER TABLE public.whatsapp_connections ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Users can manage their own WhatsApp connections"
    ON public.whatsapp_connections
    FOR ALL
    TO authenticated
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- Create updated_at trigger
CREATE OR REPLACE FUNCTION public.update_whatsapp_connections_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_whatsapp_connections_updated_at
    BEFORE UPDATE ON public.whatsapp_connections
    FOR EACH ROW
    EXECUTE FUNCTION public.update_whatsapp_connections_updated_at();