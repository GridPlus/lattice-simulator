# 🏗️ Lattice Simulator Architecture Assessment

## Current Architecture Problems

### ❌ **Unclear Separation of Responsibilities**

The current architecture has **blurred boundaries** between client and server responsibilities, making it unsuitable for headless operation:

#### **Wallet Account Generation - DUPLICATED**
- **Client Side**: `handleWalletAddressesRequest` generates accounts using client wallet services
- **Server Side**: `SigningService` tries to create accounts using server `WalletManager`
- **Problem**: Two separate wallet systems that don't sync properly

#### **Data Storage - CONFLICTING**
- **Client Side**: Zustand stores with localStorage persistence (authoritative)
- **Server Side**: In-memory storage that gets overwritten by client sync
- **Problem**: Server can't operate independently

#### **Protocol Handling - MIXED**
- **Server**: Handles encrypted protocol requests from SDK
- **Client**: Generates wallet addresses and handles signing requests
- **Problem**: Server depends on client for core functionality

## Current Architecture Diagram

```
┌─────────────────┐    WebSocket    ┌─────────────────┐
│   SDK Client    │ ──────────────► │   Server        │
│                 │                 │                 │
│ - Encrypted     │                 │ - Protocol      │
│   Requests      │                 │   Handler        │
│ - Signing       │                 │ - WebSocket     │
│   Operations    │                 │   Manager        │
└─────────────────┘                 └─────────────────┘
                                           │
                                           │ WebSocket
                                           ▼
┌─────────────────┐                 ┌─────────────────┐
│   Browser UI    │ ◄────────────── │   Client        │
│                 │                 │                 │
│ - React UI      │                 │ - Wallet        │
│ - Zustand       │                 │   Generation    │
│ - localStorage  │                 │ - Address       │
│                 │                 │   Derivation    │
└─────────────────┘                 └─────────────────┘
```

## Problems for Headless Operation

### 1. **Client Dependency**
- Server cannot generate wallet addresses without client
- Server cannot sign transactions without client wallet data
- Server cannot operate independently

### 2. **Data Inconsistency**
- Client is "source of truth" but server has its own wallet manager
- Sync mechanism is complex and error-prone
- Race conditions between client and server data

### 3. **Architecture Violations**
- Server imports client code (`walletManager`)
- Client handles server responsibilities (wallet generation)
- Mixed concerns in single components

## Proposed Architecture: Clear Separation

### 🎯 **Server Responsibilities (Headless-Capable)**

```
┌─────────────────────────────────────────────────────────────┐
│                    SERVER (Node.js)                        │
│                                                             │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────┐ │
│  │   Protocol      │  │   Wallet        │  │   Signing   │ │
│  │   Handler       │  │   Manager       │  │   Service   │ │
│  │                 │  │                 │  │             │ │
│  │ - Connect       │  │ - Generate      │  │ - Sign      │ │
│  │ - Pair          │  │   Accounts      │  │   Data      │ │
│  │ - Get Addresses │  │ - Store Keys    │  │ - Validate  │ │
│  │ - Sign          │  │ - Derive Paths  │  │   Signatures│ │
│  └─────────────────┘  └─────────────────┘  └─────────────┘ │
│                                                             │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────┐ │
│  │   Device        │  │   Storage       │  │   Events    │ │
│  │   Simulator     │  │   Manager       │  │   System    │ │
│  │                 │  │                 │  │             │ │
│  │ - State         │  │ - Persistence   │  │ - Broadcast │ │
│  │ - Pairing       │  │ - Recovery      │  │ - Logging   │ │
│  │ - Lock/Unlock   │  │ - Backup        │  │ - Metrics   │ │
│  └─────────────────┘  └─────────────────┘  └─────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

**Server Capabilities:**
- ✅ **Independent Operation**: Can run without client
- ✅ **Wallet Generation**: Creates accounts on-demand
- ✅ **Transaction Signing**: Handles all signing operations
- ✅ **Data Persistence**: Stores wallet data locally
- ✅ **Protocol Compliance**: Full Lattice1 protocol support

### 🌐 **Client Responsibilities (UI Only)**

```
┌────────────────────────────────────────────────────────────┐
│                    CLIENT (Browser)                        │
│                                                            │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────┐ │
│  │   UI            │  │   State         │  │   WebSocket │ │
│  │   Components    │  │   Management    │  │   Client    │ │
│  │                 │  │                 │  │             │ │
│  │ - React UI      │  │ - Zustand       │  │ - Connect   │ │
│  │ - Forms         │  │ - Local State   │  │ - Commands  │ │
│  │ - Modals        │  │ - UI State      │  │ - Events    │ │
│  └─────────────────┘  └─────────────────┘  └─────────────┘ │
│                                                            │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────┐ │
│  │   User          │  │   Display       │  │   Sync      │ │
│  │   Interaction   │  │   Logic         │  │   Manager   │ │
│  │                 │  │                 │  │             │ │
│  │ - Approvals     │  │ - Format Data   │  │ - Sync UI   │ │
│  │ - Confirmations │  │ - Display       │  │   State     │ │
│  │ - Settings      │  │   Transactions  │  │ - Real-time │ │
│  └─────────────────┘  └─────────────────┘  └─────────────┘ │
└────────────────────────────────────────────────────────────┘
```

**Client Capabilities:**
- ✅ **UI Only**: No business logic
- ✅ **User Interaction**: Approvals, confirmations
- ✅ **Data Display**: Format and show server data
- ✅ **Real-time Updates**: WebSocket communication

## Migration Strategy

### Phase 1: Server Independence
1. **Move wallet generation to server**
   - Remove client-side wallet generation
   - Implement server-side wallet manager
   - Add server-side persistence

2. **Move signing to server**
   - Remove client-side signing logic
   - Implement server-side signing service
   - Add server-side key management

### Phase 2: Client Simplification
1. **Remove client wallet logic**
   - Remove `clientWalletStore`
   - Remove wallet generation hooks
   - Simplify client to UI-only

2. **Implement server communication**
   - WebSocket commands for server operations
   - Real-time state sync from server
   - UI state management only

### Phase 3: Headless Support
1. **Server-only mode**
   - CLI interface for server operations
   - Configuration-based setup
   - No client dependency

2. **API endpoints**
   - REST API for external integration
   - WebSocket API for real-time clients
   - Configuration management

## Benefits of New Architecture

### ✅ **Clear Separation**
- Server: Business logic, data, operations
- Client: UI, user interaction, display

### ✅ **Headless Operation**
- Server can run independently
- No client dependency
- CLI and API support

### ✅ **Maintainability**
- Single source of truth (server)
- Clear boundaries
- Easier testing and debugging

### ✅ **Scalability**
- Server can handle multiple clients
- Client can be replaced with different UI
- Independent evolution

## Implementation Plan

### Step 1: Server Wallet Manager
```typescript
// Move wallet generation to server
class ServerWalletManager {
  async generateAccounts(coinType: string, count: number): Promise<WalletAccount[]>
  async getAccountByPath(path: number[]): Promise<WalletAccount | null>
  async storeAccount(account: WalletAccount): Promise<void>
}
```

### Step 2: Server Signing Service
```typescript
// Move signing to server
class ServerSigningService {
  async signTransaction(request: SigningRequest): Promise<SignatureResult>
  async validateSignature(signature: Buffer, data: Buffer): Promise<boolean>
}
```

### Step 3: Client Simplification
```typescript
// Client becomes UI-only
class ClientUI {
  async requestServerOperation(operation: string, data: any): Promise<any>
  displayServerData(data: any): void
  handleUserInteraction(interaction: UserInteraction): void
}
```

This architecture ensures the simulator can work headlessly while maintaining a clean separation of concerns.
