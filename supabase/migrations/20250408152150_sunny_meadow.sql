/*
  # Create WhatsApp Business tables

  1. New Tables
    - `whatsapp_connections`: Store WhatsApp Business API connections
    - `conversations`: Track customer conversations
    - `messages`: Store message history
    - `message_tags`: Track conversation tags
    - `tag_rules`: Automation rules for tagging

  2. Security
    - Enable RLS on all tables
    - Add policies for authenticated users
    - Add proper foreign key constraints
*/

-- Drop existing tables if they exist
DROP TABLE IF EXISTS message_tags CASCADE;
DROP TABLE IF EXISTS messages CASCADE;
DROP TABLE IF EXISTS tag_rules CASCADE;
DROP TABLE IF EXISTS conversations CASCADE;
DROP TABLE IF EXISTS whatsapp_connections CASCADE;

-- Create whatsapp_connections table
CREATE TABLE whatsapp_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES users(id) ON DELETE CASCADE NOT NULL,
  phone_number_id text NOT NULL,
  phone_display text,
  business_id text,
  access_token text,
  connected_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now()
);

-- Create conversations table
CREATE TABLE conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES users(id) ON DELETE CASCADE NOT NULL,
  customer_id uuid REFERENCES customers(id),
  whatsapp_number text NOT NULL,
  last_message_at timestamptz,
  status text DEFAULT 'open' CHECK (status IN ('open', 'closed')),
  segment_tag text,
  created_at timestamptz DEFAULT now()
);

-- Create messages table
CREATE TABLE messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid REFERENCES conversations(id) ON DELETE CASCADE NOT NULL,
  from_me boolean NOT NULL,
  "to" text,
  "from" text,
  type text DEFAULT 'text' CHECK (type IN ('text', 'image', 'audio', 'document')),
  body text,
  status text DEFAULT 'sent' CHECK (status IN ('sent', 'delivered', 'read', 'failed')),
  "timestamp" timestamptz DEFAULT now()
);

-- Create message_tags table
CREATE TABLE message_tags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid REFERENCES conversations(id) ON DELETE CASCADE NOT NULL,
  tag text NOT NULL,
  created_by uuid REFERENCES users(id),
  created_at timestamptz DEFAULT now()
);

-- Create tag_rules table
CREATE TABLE tag_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES users(id) ON DELETE CASCADE NOT NULL,
  name text,
  trigger text NOT NULL CHECK (trigger IN ('resposta', 'sem_resposta', 'clique')),
  tag text NOT NULL,
  action text DEFAULT 'add' CHECK (action IN ('add', 'remove')),
  delay_minutes integer DEFAULT 0,
  active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

-- Enable RLS on all tables
ALTER TABLE whatsapp_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE message_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE tag_rules ENABLE ROW LEVEL SECURITY;

-- Create policies for whatsapp_connections
CREATE POLICY "Users can manage own connections"
  ON whatsapp_connections
  FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Create policies for conversations
CREATE POLICY "Users can manage own conversations"
  ON conversations
  FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Create policies for messages
CREATE POLICY "Users can manage messages through conversations"
  ON messages
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM conversations
      WHERE conversations.id = messages.conversation_id
      AND conversations.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM conversations
      WHERE conversations.id = messages.conversation_id
      AND conversations.user_id = auth.uid()
    )
  );

-- Create policies for message_tags
CREATE POLICY "Users can manage tags through conversations"
  ON message_tags
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM conversations
      WHERE conversations.id = message_tags.conversation_id
      AND conversations.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM conversations
      WHERE conversations.id = message_tags.conversation_id
      AND conversations.user_id = auth.uid()
    )
  );

-- Create policies for tag_rules
CREATE POLICY "Users can manage own tag rules"
  ON tag_rules
  FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Create indexes for better performance
CREATE INDEX whatsapp_connections_user_id_idx ON whatsapp_connections(user_id);
CREATE INDEX conversations_user_id_idx ON conversations(user_id);
CREATE INDEX conversations_customer_id_idx ON conversations(customer_id);
CREATE INDEX messages_conversation_id_idx ON messages(conversation_id);
CREATE INDEX message_tags_conversation_id_idx ON message_tags(conversation_id);
CREATE INDEX tag_rules_user_id_idx ON tag_rules(user_id);