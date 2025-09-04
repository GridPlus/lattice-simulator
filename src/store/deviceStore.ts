/**
 * Zustand store for device state management
 */

import { create } from 'zustand'
import { subscribeWithSelector, persist } from 'zustand/middleware'
import { immer } from 'zustand/middleware/immer'
import type {
  DeviceState,
  DeviceInfo,
  ActiveWallets,
  PendingRequest,
  SimulatorConfig,
} from '../types'
import { emitPairingModeStarted, emitPairingModeEnded, emitConnectionChanged, emitPairingChanged } from '../lib/deviceEvents'

const EMPTY_WALLET_UID = '0'.repeat(64) // 32 bytes as hex string

const DEFAULT_DEVICE_INFO: DeviceInfo = {
  deviceId: 'SD0001',
  name: 'Lattice1 Simulator',
  firmwareVersion: Buffer.from([0, 0, 15, 0]), // v0.15.0 as Buffer
  isPaired: false,
  isLocked: false,
}

const DEFAULT_ACTIVE_WALLETS: ActiveWallets = {
  internal: {
    uid: EMPTY_WALLET_UID,
    external: false,
    name: 'Internal Wallet',
    capabilities: 0,
  },
  external: {
    uid: EMPTY_WALLET_UID,
    external: true,
    name: '', // Empty name for external wallet
    capabilities: 0,
  },
}

const DEFAULT_SIMULATOR_CONFIG: SimulatorConfig = {
  autoApproveRequests: false,
  simulateUserDelay: true,
  userDelayMs: 2000,
  enableTimeouts: true,
  supportedCurves: ['secp256k1', 'ed25519', 'bls12_381'],
  supportedEncodings: ['none', 'solana', 'evm', 'eth_deposit'],
  maxAddressesPerRequest: 10,
  simulatedFirmwareVersion: [0, 15, 0],
}

const INITIAL_STATE: DeviceState = {
  // Connection & Pairing
  isConnected: false,
  isPaired: false,
  
  // Device Info
  deviceInfo: DEFAULT_DEVICE_INFO,
  activeWallets: DEFAULT_ACTIVE_WALLETS,
  
  // State Management
  isLocked: false,
  isBusy: false,
  isPairingMode: false,
  pairingCode: undefined,
  pairingTimeoutMs: 60000, // 60 seconds
  pairingStartTime: undefined,
  
  // Pending Requests
  pendingRequests: [],
  
  // User Interaction
  userApprovalRequired: false,
  userApprovalTimeoutMs: 60000, // 60 seconds
  
  // Storage
  kvRecords: {},
}

/**
 * Zustand store interface for device state management
 * 
 * Extends the base DeviceState with configuration and action methods
 * for managing the simulated device state.
 */
interface DeviceStore extends DeviceState {
  /** Simulator configuration settings */
  config: SimulatorConfig
  
  // Connection and pairing actions
  /** Disconnects from the current device */
  disconnect: () => void
  /** Unpairs from the current device */
  unpair: () => void
  /** Enters pairing mode with a 6-digit code for 60 seconds */
  enterPairingMode: () => void
  /** Exits pairing mode */
  exitPairingMode: () => void
  /** Validates a pairing code */
  validatePairingCode: (code: string) => boolean
  
  // Device Management
  setDeviceInfo: (info: Partial<DeviceInfo>) => void
  setLocked: (locked: boolean) => void
  setBusy: (busy: boolean) => void
  setConnectionState: (isConnected: boolean, isPaired: boolean) => void
  syncStoreToDeviceManager: (deviceId: string) => void
  
  // Request Management
  addPendingRequest: (request: PendingRequest) => void
  removePendingRequest: (requestId: string) => void
  approveCurrentRequest: () => void
  declineCurrentRequest: () => void
  
  // Wallet Management
  setActiveWallets: (wallets: ActiveWallets) => void
  
  // Storage Management
  setKvRecord: (key: string, value: string, type?: number) => void
  removeKvRecord: (key: string) => void
  getKvRecord: (key: string) => string | undefined
  getAllKvRecords: () => Record<string, string>
  updateKvRecord: (key: string, newValue: string) => void
  
  // Configuration
  updateConfig: (config: Partial<SimulatorConfig>) => void
  
  // Reset
  reset: () => void
  resetDeviceState: () => Promise<void>
}

/**
 * Main Zustand store for device state management
 * 
 * Provides state management for the Lattice1 device simulator including
 * connection status, device configuration, pending requests, and user interactions.
 * Uses immer for immutable state updates and supports subscriptions.
 * 
 * @example
 * ```typescript
 * const store = useDeviceStore();
 * await store.connect('device-123');
 * await store.pair('secret');
 * store.setLocked(true);
 * ```
 */
export const useDeviceStore = create<DeviceStore>()(
  persist(
    subscribeWithSelector(
      immer((set, get) => ({
      ...INITIAL_STATE,
      config: DEFAULT_SIMULATOR_CONFIG,
      
      
      disconnect: () => {
        set((draft) => {
          draft.isConnected = false
          draft.isPairingMode = false
          draft.ephemeralPub = undefined
          draft.sharedSecret = undefined
          draft.pendingRequests = []
          draft.currentRequest = undefined
          draft.userApprovalRequired = false
        })
        const state = get()
        emitConnectionChanged(state.deviceInfo.deviceId, false)
      },
      
      
      unpair: () => {
        set((draft) => {
          draft.isPaired = false
          draft.pairingSecret = undefined
          draft.ephemeralPub = undefined
          draft.sharedSecret = undefined
          draft.deviceInfo.isPaired = false
          draft.pendingRequests = []
          draft.currentRequest = undefined
          draft.userApprovalRequired = false
          draft.isPairingMode = false
          draft.pairingCode = undefined
          draft.pairingStartTime = undefined
        })
        const state = get()
        emitPairingChanged(state.deviceInfo.deviceId, false)
      },
      
      enterPairingMode: () => {
        set((draft) => {
          // Generate a static 6-digit pairing code (for demo purposes)
          draft.pairingCode = '12345678'
          draft.isPairingMode = true
          draft.pairingStartTime = Date.now()
        })
        
        console.log('[DeviceStore] Entered pairing mode with code:', get().pairingCode)
        console.log('[DeviceStore] Pairing mode will timeout in 60 seconds')
        
        // Emit device event for SSE clients
        const currentState = get()
        if (currentState.isPairingMode && currentState.pairingCode) {
          try {
            emitPairingModeStarted(currentState.deviceInfo.deviceId, currentState.pairingCode, currentState.pairingTimeoutMs)
          } catch (error) {
            console.error('[DeviceStore] Failed to emit pairing mode started event:', error)
          }
        }
        
        // Set up timeout to exit pairing mode after 60 seconds
        setTimeout(() => {
          const currentState = get()
          if (currentState.isPairingMode && currentState.pairingStartTime) {
            const elapsed = Date.now() - currentState.pairingStartTime
            if (elapsed >= currentState.pairingTimeoutMs) {
              console.log('[DeviceStore] Pairing mode timed out after 60 seconds')
              get().exitPairingMode()
            }
          }
        }, get().pairingTimeoutMs)
      },
      
      exitPairingMode: () => {
        const state = get()
        if (state.isPairingMode) {
          // Emit device event for SSE clients
          try {
            emitPairingModeEnded(state.deviceInfo.deviceId)
            emitPairingChanged(state.deviceInfo.deviceId, state.isPaired)
            emitConnectionChanged(state.deviceInfo.deviceId, state.isConnected)
          } catch (error) {
            console.error('[DeviceStore] Failed to emit pairing mode ended event:', error)
          }
        }
        set((draft) => {
          draft.isPairingMode = false
          draft.pairingCode = undefined
          draft.pairingStartTime = undefined
        })
      },
      
      validatePairingCode: (code: string) => {
        const state = get()
        return state.isPairingMode && state.pairingCode === code
      },
      
      setDeviceInfo: (info: Partial<DeviceInfo>) => {
        set((draft) => {
          Object.assign(draft.deviceInfo, info)
        })
      },
      
      setLocked: (locked: boolean) => {
        set((draft) => {
          draft.isLocked = locked
          draft.deviceInfo.isLocked = locked
        })
      },
      
      setBusy: (busy: boolean) => {
        set((draft) => {
          draft.isBusy = busy
        })
      },
      
      setConnectionState: (isConnected: boolean, isPaired: boolean) => {
        console.log('[DeviceStore] setConnectionState called:', { isConnected, isPaired })
        set((draft) => {
          draft.isConnected = isConnected
          draft.isPaired = isPaired
        })
        console.log('[DeviceStore] setConnectionState completed. New state:', {
          isConnected: get().isConnected,
          isPaired: get().isPaired
        })
      },
      
      syncStoreToDeviceManager: async (deviceId: string) => {
        const state = get()
        console.log('[DeviceStore] Syncing store state to device manager for:', deviceId, {
          isConnected: state.isConnected,
          isPaired: state.isPaired,
          isPairingMode: state.isPairingMode
        })
        
        // Check if persist is working by logging localStorage
        if (typeof window !== 'undefined') {
          const persisted = localStorage.getItem('lattice-device-store')
          console.log('[DeviceStore] Persisted state from localStorage:', persisted ? JSON.parse(persisted) : 'null')
        }
        
        try {
          // Import DeviceManager here to avoid circular dependency
          const { getDeviceManager } = await import('../lib/deviceManager')
          const deviceManager = getDeviceManager(deviceId)
          
          // Sync the store state to the device manager's simulator
          if (state.isConnected) {
            console.log('[DeviceStore] Device is connected, syncing store state to device manager')
            deviceManager.syncStoreToSimulator(state)
          }
          
          console.log('[DeviceStore] Store to device manager sync completed')
        } catch (error) {
          console.error('[DeviceStore] Error syncing store to device manager:', error)
        }
      },
      
      addPendingRequest: (request: PendingRequest) => {
        set((draft) => {
          draft.pendingRequests.push(request)
          if (!draft.currentRequest) {
            draft.currentRequest = request
            draft.userApprovalRequired = true
          }
        })
      },
      
      removePendingRequest: (requestId: string) => {
        set((draft) => {
          draft.pendingRequests = draft.pendingRequests.filter(
            (req: PendingRequest) => req.id !== requestId
          )
          if (draft.currentRequest?.id === requestId) {
            draft.currentRequest = draft.pendingRequests[0]
            draft.userApprovalRequired = !!draft.currentRequest
          }
        })
      },
      
      approveCurrentRequest: () => {
        const state = get()
        if (state.currentRequest) {
          get().removePendingRequest(state.currentRequest.id)
        }
      },
      
      declineCurrentRequest: () => {
        const state = get()
        if (state.currentRequest) {
          get().removePendingRequest(state.currentRequest.id)
        }
      },
      
      setActiveWallets: (wallets: ActiveWallets) => {
        set((draft) => {
          draft.activeWallets = wallets
        })
      },
      
      setKvRecord: (key: string, value: string, type: number = 0) => {
        set((draft) => {
          draft.kvRecords[key.toLowerCase()] = value
        })
      },
      
      getKvRecord: (key: string) => {
        const state = get()
        const normalizedKey = key.toLowerCase()
        return state.kvRecords[normalizedKey]
      },
      
      getAllKvRecords: () => {
        const state = get()
        return { ...state.kvRecords }
      },
      
      updateKvRecord: (key: string, newValue: string) => {
        set((draft) => {
          const normalizedKey = key.toLowerCase()
          if (draft.kvRecords[normalizedKey]) {
            draft.kvRecords[normalizedKey] = newValue
          } else {
            throw new Error(`KV record not found for key: ${key}`)
          }
        })
      },
      

      
      removeKvRecord: (key: string) => {
        set((draft) => {
          delete draft.kvRecords[key]
        })
      },
      
      updateConfig: (config: Partial<SimulatorConfig>) => {
        set((draft) => {
          Object.assign(draft.config, config)
        })
      },
      
      reset: () => {
        set(() => ({
          ...INITIAL_STATE,
          config: DEFAULT_SIMULATOR_CONFIG,
        }))
      },

      resetDeviceState: async () => {
        const state = get()
        const deviceId = state.deviceInfo.deviceId
        
        try {
          console.log(`[DeviceStore] Resetting device state for: ${deviceId}`)
          
          // Call the API to reset server-side state
          const response = await fetch(`/api/device-reset/${deviceId}`, {
            method: 'POST',
          })
          
          if (response.ok) {
            console.log(`[DeviceStore] Server-side reset successful for: ${deviceId}`)
            
            // Reset client-side state
            set(() => ({
              ...INITIAL_STATE,
              config: DEFAULT_SIMULATOR_CONFIG,
            }))
            
            // Emit events to notify other components
            emitConnectionChanged(deviceId, false)
            emitPairingChanged(deviceId, false)
            
            console.log(`[DeviceStore] Full device reset completed for: ${deviceId}`)
          } else {
            console.error(`[DeviceStore] Server-side reset failed for: ${deviceId}`)
            throw new Error('Server reset failed')
          }
        } catch (error) {
          console.error(`[DeviceStore] Error resetting device state:`, error)
          
          // Still reset client state even if server reset fails
          set(() => ({
            ...INITIAL_STATE,
            config: DEFAULT_SIMULATOR_CONFIG,
          }))
          
          emitConnectionChanged(deviceId, false)
          emitPairingChanged(deviceId, false)
        }
      },
    }))
    ),
    {
      name: 'lattice-device-store',
      // Only persist essential state, not sensitive or temporary data
      partialize: (state) => ({
        deviceInfo: {
          ...state.deviceInfo,
          // Convert Buffer to array for serialization
          firmwareVersion: state.deviceInfo.firmwareVersion ? Array.from(state.deviceInfo.firmwareVersion) : null,
        },
        isConnected: state.isConnected,
        isPaired: state.isPaired,
        isPairingMode: state.isPairingMode,
        pairingCode: state.pairingCode,
        pairingStartTime: state.pairingStartTime,
        config: state.config,
        kvRecords: state.kvRecords,
      }),
      // Custom deserializer to convert arrays back to Buffers
      onRehydrateStorage: () => (state) => {
        if (state?.deviceInfo?.firmwareVersion && Array.isArray(state.deviceInfo.firmwareVersion)) {
          state.deviceInfo.firmwareVersion = Buffer.from(state.deviceInfo.firmwareVersion)
        }
        console.log('[DeviceStore] Rehydrated state:', state)
      },
    }
  )
)

// Selectors for commonly used state slices
/**
 * Selector hook for device connection state
 * 
 * @returns Object with connection status and device ID
 */
export const useDeviceConnection = () => {
  const state = useDeviceStore(state => ({
    isConnected: state.isConnected,
    isPaired: state.isPaired,
    isPairingMode: state.isPairingMode,
    deviceId: state.deviceInfo.deviceId,
  }))
  
  return state
}

/**
 * Selector hook for device status information
 * 
 * @returns Object with lock status, busy state, and firmware info
 */
export const useDeviceStatus = () =>
  useDeviceStore(state => ({
    isLocked: state.isLocked,
    isBusy: state.isBusy,
    firmwareVersion: state.deviceInfo.firmwareVersion,
    name: state.deviceInfo.name,
  }))

/**
 * Selector hook for pending request information
 * 
 * @returns Object with pending requests and current approval state
 */
export const usePendingRequests = () =>
  useDeviceStore(state => ({
    pendingRequests: state.pendingRequests,
    currentRequest: state.currentRequest,
    userApprovalRequired: state.userApprovalRequired,
  }))

/**
 * Selector hook for active wallet information
 * 
 * @returns Current active wallet data
 */
export const useActiveWallets = () =>
  useDeviceStore(state => state.activeWallets)

/**
 * Selector hook for simulator configuration
 * 
 * @returns Current simulator configuration settings
 */
export const useSimulatorConfig = () =>
  useDeviceStore(state => state.config)

