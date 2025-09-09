/**
 * CLIENT-SIDE ONLY Zustand store for device state management
 * 
 * ⚠️  IMPORTANT: This store is CLIENT-SIDE ONLY and cannot be imported or used by server-side code.
 * Server-side components (like simulator.ts) maintain their own internal state.
 * Communication between client and server happens exclusively via WebSocket messages.
 */

import { create, StateCreator } from 'zustand'
import { subscribeWithSelector, persist } from 'zustand/middleware'
import { immer } from 'zustand/middleware/immer'
import type {
  DeviceState,
  DeviceInfo,
  ActiveWallets,
  PendingRequest,
  SimulatorConfig,
} from '@/shared/types'
import { 
  sendConnectionChangedCommand,
  sendPairingChangedCommand, 
  sendEnterPairingModeCommand,
  sendExitPairingModeCommand,
  sendSetLockedCommand,
  sendResetDeviceCommand,
  sendUpdateConfigCommand
} from '../clientWebSocketCommands'


const EMPTY_WALLET_UID = '0'.repeat(64) // 32 bytes as hex string

const DEFAULT_DEVICE_INFO: DeviceInfo = {
  deviceId: 'SD0001',
  name: 'Lattice1 Simulator',
  firmwareVersion: Buffer.from([0, 0, 15, 0]), // v0.15.0 as Buffer
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
  pairingTimeoutId: undefined, // Store timeout ID to clear it later
  
  // Pending Requests
  pendingRequests: [],
  
  // User Interaction
  userApprovalRequired: false,
  userApprovalTimeoutMs: 60000, // 60 seconds
  
  // Storage
  kvRecords: {},
}

/**
 * CLIENT-SIDE ONLY Zustand store interface for device state management
 * 
 * ⚠️  This interface is for CLIENT-SIDE UI state management only.
 * Server-side simulator maintains its own separate internal state.
 * 
 * Extends the base DeviceState with configuration and action methods
 * for managing the client-side view of the simulated device state.
 */
interface DeviceStore extends DeviceState {
  /** Simulator configuration settings */
  config: SimulatorConfig
  
  // Connection and pairing actions
  /** Disconnects from the current device */
  disconnect: () => void
  /** Unpairs from the current device */
  unpair: () => void
  /** Enters pairing mode with a 8-digit code for 60 seconds */
  enterPairingMode: ({ deviceId, pairingCode, timeoutMs, pairingStartTime }: { deviceId: string; pairingCode: string, timeoutMs: number, pairingStartTime: number}) => void
  /** Exits pairing mode */
  exitPairingMode: () => void
  /** Validates a pairing code */
  validatePairingCode: (code: string) => boolean
  
  // Device Management
  setDeviceInfo: (info: Partial<DeviceInfo>) => void
  setLocked: (locked: boolean) => void
  setBusy: (busy: boolean) => void
  setConnectionState: (isConnected: boolean, isPaired: boolean) => void
  
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
  resetConnectionState: () => Promise<void>
  resetDeviceState: () => Promise<void>
}

/**
 * CLIENT-SIDE ONLY Main Zustand store for device state management
 * 
 * ⚠️  ARCHITECTURE NOTE: This store is CLIENT-SIDE ONLY for UI state management.
 * - Server-side simulator.ts maintains its own separate internal state
 * - Client sends commands to server via WebSocket (device_command messages)
 * - Server sends state updates to client via WebSocket (device event messages)
 * - NO DIRECT IMPORTS between client store and server simulator
 * 
 * Provides state management for the Lattice1 device simulator UI including
 * connection status, device configuration, pending requests, and user interactions.
 * Uses immer for immutable state updates and supports subscriptions.
 * 
 * @example
 * ```typescript
 * // Client-side usage only
 * const store = useDeviceStore();
 * store.enterPairingMode(); // Sends WebSocket command to server
 * store.exitPairingMode();  // Sends WebSocket command to server
 * ```
 */
// Custom storage implementation that handles SSR
const createStorage = () => {
  if (typeof window === 'undefined') {
    // Server-side: return a no-op storage that never rehydrates
    return {
      getItem: () => {
        console.log('[DeviceStore] Server-side: getItem returning null (no rehydration)')
        return null
      },
      setItem: () => {
        console.log('[DeviceStore] Server-side: setItem no-op')
      },
      removeItem: () => {
        console.log('[DeviceStore] Server-side: removeItem no-op')
      },
    }
  }
  
  // Client-side: use localStorage
  return {
    getItem: (key: string) => {
      try {
        const value = localStorage.getItem(key)
        return value ? JSON.parse(value) : null
      } catch (error) {
        console.warn('[DeviceStore] localStorage.getItem failed:', error)
        return null
      }
    },
    setItem: (key: string, value: any) => {
      try {
        console.log('[DeviceStore] Saving to localStorage:', key, value)
        localStorage.setItem(key, JSON.stringify(value))
        console.log('[DeviceStore] Successfully saved to localStorage')
      } catch (error) {
        console.warn('[DeviceStore] localStorage.setItem failed:', error)
      }
    },
    removeItem: (key: string) => {
      try {
        localStorage.removeItem(key)
      } catch (error) {
        console.warn('[DeviceStore] localStorage.removeItem failed:', error)
      }
    },
  }
}

// Create the base store without persistence
const createBaseStore = (): StateCreator<DeviceStore, [], [["zustand/subscribeWithSelector", never], ["zustand/immer", never]]> => 
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
        sendConnectionChangedCommand(state.deviceInfo.deviceId, false)
      },
      
      
      unpair: () => {
        const state = get()
        // Clear the pairing timeout if it exists
        if (state.pairingTimeoutId) {
          clearTimeout(state.pairingTimeoutId)
          console.log('[DeviceStore] Cleared pairing mode timeout during unpair')
        }
        
        set((draft) => {
          draft.isPaired = false
          draft.pairingSecret = undefined
          draft.ephemeralPub = undefined
          draft.sharedSecret = undefined
          draft.pendingRequests = []
          draft.currentRequest = undefined
          draft.userApprovalRequired = false
          draft.isPairingMode = false
          draft.pairingCode = undefined
          draft.pairingStartTime = undefined
          draft.pairingTimeoutId = undefined
        })
        const newState = get()
        sendPairingChangedCommand(newState.deviceInfo.deviceId, false)
      },
      
      enterPairingMode: ({ deviceId, pairingCode, timeoutMs, pairingStartTime }: { deviceId: string; pairingCode: string, timeoutMs: number, pairingStartTime: number}) => {
        console.log(`[deviceStore.enterPairingMode]: pairingCode: ${pairingCode}, isPairingmode: true }]`)
        set((draft) => {
          draft.isConnected = true
          draft.isPairingMode = true
          draft.pairingStartTime = pairingStartTime
          draft.pairingCode = pairingCode
          draft.pairingTimeoutMs = timeoutMs
        })
      },
      
      exitPairingMode: () => {
        set((draft) => {
          draft.isPairingMode = false
        })
        // sendExitPairingModeCommand(state.deviceInfo.deviceId)
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
        console.log('[DeviceStore] Current environment:', typeof window !== 'undefined' ? 'client' : 'server')
        set((draft) => {
          draft.isConnected = isConnected
          draft.isPaired = isPaired
        })
        const newState = get()
        console.log('[DeviceStore] setConnectionState completed. New state:', {
          isConnected: newState.isConnected,
          isPaired: newState.isPaired
        })
        console.log('[DeviceStore] Full state after setConnectionState:', {
          isConnected: newState.isConnected,
          isPaired: newState.isPaired,
          isPairingMode: newState.isPairingMode,
          pairingCode: newState.pairingCode
        })
        
        // Force a manual localStorage save to test if persistence is working
        if (typeof window !== 'undefined') {
          try {
            const stateToSave = {
              deviceInfo: {
                ...newState.deviceInfo,
                firmwareVersion: newState.deviceInfo.firmwareVersion ? Array.from(newState.deviceInfo.firmwareVersion) : null,
              },
              isConnected: newState.isConnected,
              isPaired: newState.isPaired,
              isPairingMode: newState.isPairingMode,
              pairingCode: newState.pairingCode,
              pairingStartTime: newState.pairingStartTime,
              config: newState.config,
              kvRecords: newState.kvRecords,
            }
            console.log('[DeviceStore] Manually saving to localStorage:', stateToSave)
            localStorage.setItem('lattice-device-store', JSON.stringify(stateToSave))
            console.log('[DeviceStore] Manual localStorage save completed')
          } catch (error) {
            console.error('[DeviceStore] Manual localStorage save failed:', error)
          }
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

      resetConnectionState: async () => {
        const state = get()
        const deviceId = state.deviceInfo.deviceId
        
        try {
          console.log(`[DeviceStore] Resetting connection state for: ${deviceId}`)
          
          // Call the API to reset server-side connection state
          const response = await fetch(`/api/device-reset/${deviceId}`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ resetType: 'connection' })
          })
          
          if (response.ok) {
            console.log(`[DeviceStore] Server-side connection reset successful for: ${deviceId}`)
            
            // Reset only connection and pairing related fields, preserve KV records
            set((draft) => {
              draft.isConnected = false
              draft.isPaired = false
              draft.isPairingMode = false
              draft.pairingCode = undefined
              draft.pairingStartTime = undefined
              draft.pairingTimeoutId = undefined
              draft.ephemeralPub = undefined
              draft.sharedSecret = undefined
              draft.pendingRequests = []
              draft.currentRequest = undefined
              draft.userApprovalRequired = false
              // Keep KV records, device info, config, etc.
            })
            
            // Emit events to notify other components
            sendConnectionChangedCommand(deviceId, false)
            sendPairingChangedCommand(deviceId, false)
            
            console.log(`[DeviceStore] Connection state reset completed for: ${deviceId}`)
          } else {
            console.error(`[DeviceStore] Server-side connection reset failed for: ${deviceId}`)
            throw new Error('Server connection reset failed')
          }
        } catch (error) {
          console.error(`[DeviceStore] Error resetting connection state:`, error)
          
          // Still reset connection state even if server reset fails
          set((draft) => {
            draft.isConnected = false
            draft.isPaired = false
            draft.isPairingMode = false
            draft.pairingCode = undefined
            draft.pairingStartTime = undefined
            draft.pairingTimeoutId = undefined
            draft.ephemeralPub = undefined
            draft.sharedSecret = undefined
            draft.pendingRequests = []
            draft.currentRequest = undefined
            draft.userApprovalRequired = false
          })
          
          sendConnectionChangedCommand(deviceId, false)
          sendPairingChangedCommand(deviceId, false)
        }
      },

      resetDeviceState: async () => {
        const state = get()
        const deviceId = state.deviceInfo.deviceId
        
        try {
          console.log(`[DeviceStore] Resetting full device state for: ${deviceId}`)
          
          // Call the API to reset server-side state
          const response = await fetch(`/api/device-reset/${deviceId}`, {
            method: 'POST',
          })
          
          if (response.ok) {
            console.log(`[DeviceStore] Server-side reset successful for: ${deviceId}`)
            
            // Reset client-side state (including KV records)
            set(() => ({
              ...INITIAL_STATE,
              config: DEFAULT_SIMULATOR_CONFIG,
            }))
            
            // Emit events to notify other components
            sendConnectionChangedCommand(deviceId, false)
            sendPairingChangedCommand(deviceId, false)
            
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
          
          sendConnectionChangedCommand(deviceId, false)
          sendPairingChangedCommand(deviceId, false)
        }
      },
    }))
  )

// Create the store with or without persistence based on environment
console.log('[DeviceStore] Creating store instance...', typeof window !== 'undefined' ? 'client' : 'server')
// Create the store with proper typing
const createStore = () => {
  if (typeof window !== 'undefined') {
    // Client-side: use persistence
    return create<DeviceStore>()(
      persist(
        createBaseStore(),
        {
          name: 'lattice-device-store',
          storage: createStorage(),
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
            console.log('[DeviceStore] onRehydrateStorage called!', typeof window !== 'undefined' ? 'client' : 'server')
            
            if (typeof window === 'undefined') {
              console.log('[DeviceStore] Server-side: Skipping rehydration callback')
              return
            }
            
            if (state?.deviceInfo?.firmwareVersion && Array.isArray(state.deviceInfo.firmwareVersion)) {
              state.deviceInfo.firmwareVersion = Buffer.from(state.deviceInfo.firmwareVersion)
            }
            console.log('[DeviceStore] Rehydrated state:', state)
            console.log('[DeviceStore] Rehydration timestamp:', new Date().toISOString())
            console.log('[DeviceStore] Current localStorage content:', typeof window !== 'undefined' ? localStorage.getItem('lattice-device-store') : 'N/A')
          },
        }
      )
    )
  } else {
    // Server-side: no persistence
    return create<DeviceStore>()(createBaseStore())
  }
}

export const useDeviceStore = createStore()

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

