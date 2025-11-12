# 🏗️ Lattice Simulator Architecture

This document describes the segregated client-server architecture of the Lattice
Simulator.

## 📁 Directory Structure

```
src/
├── server/              # 🖥️ SERVER-SIDE ONLY (Node.js)
│   ├── serverSimulator.ts          # Core device simulation (ServerLatticeSimulator)
│   ├── serverDeviceEvents.ts       # Server-side event system
│   ├── serverWebSocketManager.ts   # WebSocket connection manager
│   ├── serverDeviceManager.ts      # Device instance manager
│   ├── serverProtocolHandler.ts    # Protocol message handler
│   └── serverRequestManager.ts     # Request lifecycle management
│
├── client/              # 🌐 CLIENT-SIDE ONLY (React/Browser)
│   ├── store/
│   │   ├── clientDeviceStore.ts        # Client UI state management
│   │   └── clientWalletStore.ts        # Client wallet state
│   ├── hooks/
│   │   ├── useClientWebSocketHandler.ts    # WebSocket client communication
│   │   └── useClientServerStateSync.ts     # Client-server state sync
│   └── components/                     # React UI components
│
└── shared/              # 🤝 SHARED (Both client and server)
    ├── types/           # TypeScript type definitions
    ├── utils/           # Shared utility functions
    ├── constants.ts     # Shared constants
    ├── protocolParser.ts # Protocol message parsing
    ├── walletConfig.ts  # Wallet configuration
    └── kvRecordsEvents.ts # KV record events
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

### **ServerLatticeSimulator**

- **Purpose**: Core device simulation engine
- **Location**: `src/server/serverSimulator.ts`
- **Key Features**:
  - Manages internal device state (pairing mode, KV records, etc.)
  - Handles protocol operations (connect, pair, getAddresses, sign)
  - Emits events via `serverDeviceEvents`

### **ServerWebSocketManager**

- **Purpose**: WebSocket connection and message handling
- **Location**: `src/server/serverWebSocketManager.ts`
- **Key Features**:
  - Manages WebSocket connections per device
  - Handles command messages from clients
  - Broadcasts events to connected clients

### **ServerDeviceEvents**

- **Purpose**: Server-side event emission system
- **Location**: `src/server/serverDeviceEvents.ts`
- **Key Features**:
  - Emits events like `pairing_mode_ended`
  - Broadcasts to WebSocket clients via `ServerWebSocketManager`

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

- **Server files**: `server*.ts` (e.g., `serverSimulator.ts`)
- **Server classes**: `Server*` prefix (e.g., `ServerLatticeSimulator`)
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
// server.ts
import { serverWebSocketManager } from "./src/server/serverWebSocketManager"
import { ServerLatticeSimulator } from "./src/server/serverSimulator"

const simulator = new ServerLatticeSimulator({
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
