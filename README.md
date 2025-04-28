# WhatsApp Integration with React

This project implements a WhatsApp Web integration for React applications, allowing businesses to send messages and manage customer communications programmatically.

## Features

- 🔄 QR Code Authentication
- 📱 Message Broadcasting
- 👥 Customer Segmentation
- 📊 Analytics Dashboard
- 🔒 Secure Communication

## Architecture

The application consists of three main components:

1. **Frontend (React + Vite)**
   - WhatsApp Context Provider
   - Real-time status updates
   - QR Code scanning interface
   - Message broadcasting UI

2. **Backend (Supabase Edge Functions)**
   - WhatsApp Web client management
   - Message queuing and delivery
   - Session management
   - Error handling

3. **Database (Supabase)**
   - Customer data storage
   - Message history
   - Analytics data

## Setup Instructions

### Prerequisites

- Node.js 18+
- Supabase account
- WhatsApp account

### Environment Variables

Create a `.env` file in the project root:

```env
VITE_SUPABASE_URL=your_supabase_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
```

### Installation

1. Install dependencies:
```bash
npm install
```

2. Start the development server:
```bash
npm run dev
```

## WhatsApp Integration

### Connection Flow

1. **Initial Connection**
   - Click "Connect WhatsApp"
   - Scan QR code with WhatsApp mobile app
   - Wait for connection confirmation

2. **Session Management**
   - Sessions are maintained until explicitly disconnected
   - Auto-reconnect on connection loss
   - Manual reset option available

3. **Message Broadcasting**
   - Select customer segment
   - Compose message (supports templates)
   - Preview and send
   - Monitor delivery status

### Error Handling

Common errors and solutions:

#### 1. Connection Issues

```typescript
// Example error handling in WhatsAppContext
try {
  await connect();
} catch (error) {
  if (error.message.includes('Failed to fetch')) {
    // Handle connection error
  }
}
```

#### 2. QR Code Generation

```typescript
// Example QR code error handling
whatsappClient.on('qr', async (qr) => {
  try {
    const qrCode = await generateQR(qr);
    // Handle success
  } catch (error) {
    // Handle QR generation error
  }
});
```

## Security Considerations

1. **Rate Limiting**
   - Maximum 100 messages per day
   - 8-second delay between messages
   - Automatic throttling

2. **WhatsApp Policies**
   - Only message existing customers
   - Respect opt-out requests
   - Follow content guidelines

3. **Data Protection**
   - End-to-end encryption
   - Secure storage
   - Privacy compliance

## Troubleshooting

### CORS Issues

If encountering CORS errors, verify:

1. Vite proxy configuration:
```typescript
// vite.config.ts
export default defineConfig({
  server: {
    proxy: {
      '/whatsapp': {
        target: 'your_api_url',
        changeOrigin: true,
        secure: false
      }
    }
  }
});
```

2. API CORS headers:
```typescript
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization'
};
```

### Connection Errors

1. **"Failed to fetch" Error**
   - Check internet connection
   - Verify API endpoint
   - Confirm proxy settings

2. **Authentication Failures**
   - Clear browser cache
   - Reset WhatsApp session
   - Re-scan QR code

3. **Message Sending Errors**
   - Validate phone numbers
   - Check rate limits
   - Verify connection status

## Best Practices

1. **Message Templates**
   - Use personalization variables
   - Keep messages concise
   - Include opt-out instructions

2. **Customer Segmentation**
   - Group by engagement level
   - Consider purchase history
   - Respect communication preferences

3. **Performance**
   - Implement message queuing
   - Monitor delivery rates
   - Track error patterns

## API Reference

### WhatsApp Context

```typescript
interface WhatsAppContextType {
  status: WhatsAppStatus;
  connect: () => Promise<void>;
  disconnect: () => void;
  resetSession: () => Promise<void>;
  sendMessages: (messages: Message[]) => Promise<any>;
}
```

### Status Types

```typescript
type WhatsAppStatus = {
  status: 'disconnected' | 'connecting' | 'connected';
  qr?: string;
  error?: string;
};
```

### Message Format

```typescript
interface Message {
  phone: string;  // Format: international number
  text: string;   // Message content
}
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Submit a pull request

## License

MIT License - see LICENSE file for details

## Support

For issues and feature requests, please use the GitHub issue tracker.