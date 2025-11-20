# 🏗️ Lattice Simulator Architecture

This document describes the segregated client-server architecture of the Lattice
Simulator.

## 📁 Directory Structure

```
src/
├── server/              # 🖥️ SERVER-SIDE ONLY (Node.js)
│   ├── deviceSimulator.ts          # Core device simulation (DeviceSimulator)
│   ├── events.ts                   # Server-side event system
│   ├── websocket/manager.ts        # WebSocket connection manager
│   ├── deviceManager.ts            # Device instance manager
│   ├── protocolHandler.ts          # Protocol message handler
│   └── requestManager.ts           # Request lifecycle management
│
├── client/              # 🌐 CLIENT-SIDE ONLY (React/Browser)
│   ├── store/
│   │   ├── clientDeviceStore.ts        # Client UI state management
│   │   └── clientWalletStore.ts        # Client wallet state
│   ├── hooks/
│   │   ├── useClientWebSocketHandler.ts    # WebSocket client communication
│   │   └── useClientServerStateSync.ts     # Client-server state sync
│   ├── websocket/
│   │   └── commands.ts                  # Client-side bridge helpers
│   └── components/                      # React UI components
│
└── core/                # 🤝 SHARED (Both client and server)
    ├── types/           # TypeScript type definitions
    ├── utils/           # Shared utility functions
    ├── protocol/        # Protocol helpers, constants, parser
    ├── wallets/         # Wallet registry + per-coin factories
    └── signing/         # SignatureEngine implementation
```

## 🔄 Communication Architecture

### **Clear Separation**

- ❌ **No direct imports** between client and server code
- ✅ **WebSocket-only communication** between client and server
- ✅ **Shared types and utilities** for consistency

### **Message Flow**

#### Client → Server (Commands)

```typescript
// Client sends commands via WebSocket
{
  type: 'device_command',
  data: {
    command: 'exit_pairing_mode',
    data: {}
  }
}
```

#### Server → Client (Events)

```typescript
// Server broadcasts state changes via WebSocket
{
  type: 'pairing_mode_ended',
  data: { deviceId: 'SD0001' }
}
```

## 🖥️ Server-Side Components

### **DeviceSimulator**

- **Purpose**: Core device simulation engine
- **Location**: `src/server/deviceSimulator.ts`
- **Key Features**:
  - Manages internal device state (pairing mode, KV records, etc.)
  - Handles protocol operations (connect, pair, getAddresses, sign)
  - Emits events via `events.ts`

### **WebSocket Manager**

- **Purpose**: WebSocket connection and message handling
- **Location**: `src/server/websocket/manager.ts`
- **Key Features**:
  - Manages WebSocket connections per device
  - Handles command messages from clients
  - Broadcasts events to connected clients

### **Device Events**

- **Purpose**: Server-side event emission system
- **Location**: `src/server/events.ts`
- **Key Features**:
  - Emits events like `pairing_mode_ended`
  - Broadcasts to WebSocket clients via the WebSocket manager

## 🌐 Client-Side Components

### **ClientDeviceStore**

- **Purpose**: Client-side UI state management
- **Location**: `src/client/store/clientDeviceStore.ts`
- **Key Features**:
  - Manages UI state (not device truth)
  - Sends commands to server via WebSocket
  - Updates state based on server events

### **useClientWebSocketHandler**

- **Purpose**: WebSocket client communication
- **Location**: `src/client/hooks/useClientWebSocketHandler.ts`
- **Key Features**:
  - Connects to server WebSocket
  - Sends device commands to server
  - Receives and handles server events

## 🎯 Key Architectural Principles

### **1. Server Manages Truth**

- Server-side simulator maintains the authoritative device state
- Client UI state is derived from server events

### **2. Commands vs Events**

- **Commands**: Client → Server (intentions/requests)
  - `enter_pairing_mode`, `exit_pairing_mode`
- **Events**: Server → Client (state changes/facts)
  - `pairing_mode_started`, `pairing_mode_ended`

### **3. Clean Separation**

- Server code cannot import client code
- Client code cannot import server code
- Communication only via WebSocket messages

### **4. Naming Convention**

- **Server files**: `server*.ts` (e.g., `deviceSimulator.ts`)
- **Server classes**: `Server*` prefix (e.g., `DeviceSimulator`)
- **Client files**: `client*.ts` (e.g., `clientDeviceStore.ts`)
- **Client hooks**: `useClient*` (e.g., `useClientWebSocketHandler`)

## 🔧 Migration Benefits

1. **Clear Boundaries**: No more confusion about what runs where
2. **Type Safety**: Import errors prevent architectural violations
3. **Scalability**: Server and client can evolve independently
4. **Debugging**: Easier to trace client vs server issues
5. **Testing**: Server and client logic can be tested in isolation

## 🚀 Usage Examples

### Server-Side (Node.js)

```typescript
// packages/daemon/index.ts
import { wsManager } from "./src/server/websocket/manager"
import { DeviceSimulator } from "./src/server/deviceSimulator"

const simulator = new DeviceSimulator({
  deviceId: "SD0001",
  autoApprove: true,
})
```

### Client-Side (React)

```typescript
// Component.tsx
import { useClientWebSocketHandler } from '../src/client/hooks/useClientWebSocketHandler'
import { useClientDeviceStore } from '../src/client/store/clientDeviceStore'

const Component = () => {
  useClientWebSocketHandler('SD0001')
  const { exitPairingMode } = useClientDeviceStore()

  return <button onClick={exitPairingMode}>Exit Pairing</button>
}
```
