# Server-Client Communication System

This document explains the new request-response mapping system that bridges server-side protocol requests with client-side data storage.

## Overview

The Lattice Simulator now supports a hybrid architecture where:
- **Server-side**: Handles encrypted protocol requests from SDK clients
- **Client-side**: Maintains the authoritative data store (Zustand with localStorage)
- **Communication**: Real-time request-response mapping via Server-Sent Events (SSE)

## Architecture

```
SDK Client → Server (Protocol Handler) → Request Manager → SSE → Client (Browser)
                                                              ↓
SDK Client ← Server (Protocol Handler) ← Request Manager ← HTTP API ← Client (Browser)
```

### Components

1. **RequestManager** (`src/lib/requestManager.ts`)
   - Manages pending server-side requests
   - Correlates requests with client responses using UUIDs
   - Handles timeouts and cleanup

2. **ServerRequestHandler Hook** (`src/hooks/useServerRequestHandler.ts`)
   - Client-side hook that listens for server requests via SSE
   - Fetches data from Zustand stores
   - Sends responses back via HTTP API

3. **API Endpoints**
   - `/api/device-events/[deviceId]` - SSE endpoint for real-time events
   - `/api/client-response` - HTTP endpoint for client responses

4. **Protocol Handler Updates** (`src/lib/protocolHandler.ts`)
   - Updated KV records methods to use RequestManager
   - Falls back to simulator data if client requests fail

## How It Works

### 1. Server Request Flow

When a protocol request comes in for KV records:

```typescript
// In ProtocolHandler
const clientData = await requestKvRecords(deviceId, { type, n, start })
```

This:
1. Creates a pending request in RequestManager with a unique ID
2. Emits a 'server_request' event via deviceEvents
3. SSE broadcasts the event to connected clients
4. Waits for client response (with timeout)

### 2. Client Response Flow

The client-side handler:

```typescript
// In useServerRequestHandler
eventSource.addEventListener('server_request', (event) => {
  const request = JSON.parse(event.data)
  handleServerRequest(request) // Process and respond
})
```

This:
1. Receives the server request via SSE
2. Fetches data from Zustand stores
3. Sends response to `/api/client-response`
4. RequestManager resolves the pending promise

## Usage

### 1. Install the ServerRequestProvider

Add the provider to your app to enable server-client communication:

```typescript
// In your main app component
import ServerRequestProvider from '@/components/ServerRequestProvider'

function App() {
  return (
    <ServerRequestProvider>
      {/* Your app components */}
    </ServerRequestProvider>
  )
}
```

### 2. KV Records Flow

When the SDK makes a `getKvRecords` request:

1. **Server receives** encrypted protocol request
2. **RequestManager creates** pending request with UUID
3. **SSE broadcasts** request to client
4. **Client fetches** data from localStorage/Zustand
5. **Client sends** response via HTTP API
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
- Automatic SSE reconnection
- Request deduplication prevents duplicate processing

## Development & Debugging

### Debug Endpoints

Check pending requests for a device:
```
GET /api/client-response?deviceId=your-device-id
```

### Console Logs

Enable detailed logging by watching for:
- `[RequestManager]` - Server-side request lifecycle  
- `[ServerRequestHandler]` - Client-side request processing
- `[ProtocolHandler]` - Protocol request handling

### Testing

The system includes fallback behavior, so it works even if:
- Client is not connected
- SSE fails  
- HTTP requests timeout
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

Just add the `ServerRequestProvider` to your app - no other changes needed. The client will automatically:
- Connect to SSE endpoint
- Listen for server requests
- Respond with Zustand store data

## Performance Considerations

### Request Limits
- Default: 30-second timeout per request
- Cleanup: Expired requests cleaned every minute
- Memory: Processed request IDs limited to 100 (keeps last 50)

### Scalability
- Each device has its own SSE connection
- Requests are device-scoped
- No global state pollution

### Caching
- Client-side: Zustand with localStorage persistence
- Server-side: No caching (client is source of truth)

## Troubleshooting

### Common Issues

1. **Client not responding**
   - Check if ServerRequestProvider is installed
   - Verify SSE connection in Network tab
   - Check console for errors

2. **Data format mismatch**
   - Ensure client responds with expected format
   - Check TypeScript types in requestManager.ts

3. **Timeouts**
   - Increase timeout in RequestManager
   - Check network latency
   - Verify client processing time

### Health Checks

Monitor these for system health:
- SSE connection count: Should match active clients
- Pending request count: Should be low (< 10)
- Failed request rate: Should be < 5%

## Future Enhancements

Potential improvements:
- WebSocket upgrade from SSE for bidirectional communication
- Request batching for better performance  
- Persistent storage with SQLite
- Request retry mechanisms
- Performance metrics and monitoring

## Security Notes

- All data flows through existing protocol encryption
- No additional authentication needed
- SSE connections are per-device
- Request IDs are UUIDs (non-guessable)
- Client responses are validated server-side