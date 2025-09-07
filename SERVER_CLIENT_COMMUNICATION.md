# Server-Client Communication System

This document explains the new request-response mapping system that bridges server-side protocol requests with client-side data storage.

## Overview

The Lattice Simulator now supports a hybrid architecture where:
- **Server-side**: Handles encrypted protocol requests from SDK clients
- **Client-side**: Maintains the authoritative data store (Zustand with localStorage)
- **Communication**: Real-time bidirectional communication via WebSocket

## Architecture

```
SDK Client → Server (Protocol Handler) → Request Manager → WebSocket → Client (Browser)
                                                              ↕
SDK Client ← Server (Protocol Handler) ← Request Manager ← WebSocket ← Client (Browser)
```

### Components

1. **Custom Next.js Server** (`server.ts`)
   - Handles WebSocket protocol upgrades for path `/ws/device/[deviceId]`
   - Delegates all other requests to standard Next.js app handler
   - Integrates with WebSocket Manager for connection handling

2. **WebSocket Manager** (`src/lib/wsManager.ts`)
   - Manages active WebSocket connections per device
   - Handles message routing and broadcasting
   - Provides server request/client response correlation

3. **RequestManager** (`src/lib/requestManager.ts`)
   - Manages pending server-side requests
   - Correlates requests with client responses using UUIDs
   - Handles timeouts and cleanup
   - Now uses WebSocket instead of SSE

4. **ServerRequestHandler Hook** (`src/hooks/useServerRequestHandler.ts`)
   - Client-side hook that connects via WebSocket
   - Listens for server requests and device state updates
   - Fetches data from Zustand stores
   - Sends responses back over the same WebSocket connection
   - Includes auto-reconnection logic and heartbeat mechanism

5. **Enhanced DeviceEvents** (`src/lib/deviceEvents.ts`)
   - Broadcasts events to both local listeners and WebSocket clients
   - Maintains backward compatibility for existing components

## How It Works

### 1. Server Request Flow

When a protocol request comes in for KV records:

```typescript
// In ProtocolHandler
const clientData = await requestKvRecords(deviceId, { type, n, start })
```

This:
1. Creates a pending request in RequestManager with a unique ID
2. Uses wsManager to send the request via WebSocket to connected clients
3. Waits for client response (with timeout)

### 2. Client Response Flow

The client-side handler:

```typescript
// In useServerRequestHandler
ws.onmessage = (event) => {
  const message = JSON.parse(event.data)
  if (message.type === 'server_request') {
    handleServerRequest(message.data) // Process and respond
  }
}
```

This:
1. Receives the server request via WebSocket
2. Fetches data from Zustand stores  
3. Sends response back over the same WebSocket connection
4. RequestManager resolves the pending promise

## Usage

### 1. Start the Custom Server

Run the application using the custom server:

```bash
# Development
npm run dev

# Production
npm run build
npm run start
```

The server will start on `http://localhost:3000` with WebSocket support at `ws://localhost:3000/ws/device/[deviceId]`.

### 2. Client Integration

Use the `useServerRequestHandler` hook in your device components:

```typescript
// In your device component
import { useServerRequestHandler } from '@/hooks/useServerRequestHandler'

function DeviceComponent({ deviceId }: { deviceId: string }) {
  // This automatically establishes WebSocket connection and handles server requests
  useServerRequestHandler(deviceId)
  
  return <div>Device: {deviceId}</div>
}
```

### 3. KV Records Flow

When the SDK makes a `getKvRecords` request:

1. **Server receives** encrypted protocol request
2. **RequestManager creates** pending request with UUID
3. **WebSocket sends** request to connected client
4. **Client fetches** data from localStorage/Zustand
5. **Client sends** response via WebSocket
6. **RequestManager resolves** pending promise
7. **Server responds** to SDK with encrypted data

### 3. Data Format

The client should respond with data in the expected format:

```typescript
// For getKvRecords
{
  records: [
    { id: 0, type: 0, caseSensitive: false, key: "foo", val: "bar" }
  ],
  total: 1,
  fetched: 1
}

// For addKvRecords/removeKvRecords
{
  success: true,
  error?: string
}
```

## Error Handling

### Timeouts
- Default timeout: 30 seconds per request
- Configurable via RequestManager
- Falls back to simulator data on timeout

### Client Offline
- Server falls back to simulator's local data
- Graceful degradation ensures protocol continues working

### Network Issues
- Automatic WebSocket reconnection with 3-second retry delay
- Heartbeat mechanism keeps connections alive (30-second intervals)
- Request deduplication prevents duplicate processing

## Development & Debugging

### WebSocket Connection

Monitor WebSocket connections in browser DevTools:
- **Network tab**: Look for WebSocket connections to `/ws/device/[deviceId]`
- **Console**: Watch for connection/reconnection messages

### Console Logs

Enable detailed logging by watching for:
- `[RequestManager]` - Server-side request lifecycle  
- `[ServerRequestHandler]` - Client-side WebSocket connection and request processing
- `[WSManager]` - WebSocket connection management
- `[ProtocolHandler]` - Protocol request handling

### Testing

The system includes fallback behavior, so it works even if:
- Client is not connected
- WebSocket connection fails
- WebSocket messages timeout
- Data format is incorrect

## Migration

### From Simulator-Only Storage

Before:
```typescript
// Server directly used simulator storage
const response = await this.simulator.getKvRecords(params)
```

After:
```typescript
// Server requests from client, falls back to simulator
try {
  const clientData = await requestKvRecords(deviceId, params)
  return processClientData(clientData)
} catch (error) {
  // Fallback to simulator
  const response = await this.simulator.getKvRecords(params)
  return response
}
```

### Client-Side Integration

Use the `useServerRequestHandler` hook in components that need server communication:

```typescript
import { useServerRequestHandler } from '@/hooks/useServerRequestHandler'

function DeviceComponent({ deviceId }) {
  useServerRequestHandler(deviceId) // Handles WebSocket connection automatically
  return <div>Your component</div>
}
```

The client will automatically:
- Connect to WebSocket endpoint
- Listen for server requests
- Respond with Zustand store data
- Reconnect on network interruptions

## Performance Considerations

### Request Limits
- Default: 30-second timeout per request
- Cleanup: Expired requests cleaned every minute
- Memory: Processed request IDs limited to 100 (keeps last 50)

### WebSocket Connections
- Each device has its own WebSocket connection
- Connections are managed per device ID
- Automatic cleanup when devices disconnect
- Heartbeat keeps connections alive

### Scalability
- Requests are device-scoped
- No global state pollution
- Connection pooling per device
- Memory-efficient message routing

### Caching
- Client-side: Zustand with localStorage persistence
- Server-side: No caching (client is source of truth)

## Troubleshooting

### Common Issues

1. **Client not responding**
   - Check if `useServerRequestHandler` hook is used
   - Verify WebSocket connection in Network tab
   - Check console for connection errors
   - Ensure custom server is running (not `next dev`)

2. **WebSocket connection failed**
   - Verify server is running with custom server.ts
   - Check firewall/proxy settings
   - Look for CORS issues in browser console

3. **Auto-reconnection not working**
   - Check WebSocket close codes in console
   - Verify server is accessible
   - Monitor reconnection attempt logs

4. **Data format mismatch**
   - Ensure client responds with expected format
   - Check TypeScript types in requestManager.ts

5. **Timeouts**
   - Increase timeout in RequestManager
   - Check network latency
   - Verify client processing time

### Health Checks

Monitor these for system health:
- WebSocket connection count: Should match active clients
- Pending request count: Should be low (< 10)  
- Failed request rate: Should be < 5%
- Heartbeat response times: Should be < 1 second

## Migration from SSE System

### What Changed
- **Removed**: `/api/device-events/[deviceId]` SSE endpoint
- **Removed**: `/api/client-response` HTTP endpoint  
- **Added**: WebSocket server at `/ws/device/[deviceId]`
- **Updated**: `useServerRequestHandler` now uses WebSocket instead of EventSource
- **Enhanced**: Auto-reconnection with exponential backoff

### Benefits
- **Single connection**: Request and response over same WebSocket
- **Lower latency**: No HTTP request/response overhead
- **Better reliability**: Built-in heartbeat and reconnection
- **Real-time**: True bidirectional communication
- **Resource efficient**: Fewer open connections

## Future Enhancements

Potential improvements:
- Request batching for better performance  
- Persistent storage with SQLite
- Advanced retry mechanisms with exponential backoff
- Performance metrics and monitoring dashboard
- Connection pooling optimizations
- Message compression for large payloads

## Security Notes

- All data flows through existing protocol encryption
- WebSocket connections are device-scoped  
- Request IDs are UUIDs (non-guessable)
- Client responses are validated server-side
- No additional authentication layer needed
- Same origin policy enforced by browser