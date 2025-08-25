/**
 * Zustand store for device state management
 */

import { create } from 'zustand'
import { subscribeWithSelector } from 'zustand/middleware'
import { immer } from 'zustand/middleware/immer'
import type {
  DeviceState,
  DeviceInfo,
  ActiveWallets,
  PendingRequest,
  SimulatorConfig,
  DeviceResponse,
} from '../types'
import { LatticeResponseCode } from '../types'

const EMPTY_WALLET_UID = Buffer.alloc(32)

const DEFAULT_DEVICE_INFO: DeviceInfo = {
  deviceId: '',
  name: 'Lattice1 Simulator',
  firmwareVersion: Buffer.from([0, 0, 15, 0]), // v0.15.0
  isPaired: false,
  isLocked: false,
}

const DEFAULT_ACTIVE_WALLETS: ActiveWallets = {
  internal: {
    uid: EMPTY_WALLET_UID,
    external: false,
    name: Buffer.from('Internal Wallet'),
    capabilities: 0,
  },
  external: {
    uid: EMPTY_WALLET_UID,
    external: true,
    name: Buffer.alloc(0),
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
  addressTags: {},
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
  /** Connects to a device with the specified ID */
  connect: (deviceId: string) => Promise<DeviceResponse<boolean>>
  /** Disconnects from the current device */
  disconnect: () => void
  /** Pairs with the device using optional pairing secret */
  pair: (pairingSecret?: string) => Promise<DeviceResponse<boolean>>
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
  
  // Request Management
  addPendingRequest: (request: PendingRequest) => void
  removePendingRequest: (requestId: string) => void
  approveCurrentRequest: () => void
  declineCurrentRequest: () => void
  
  // Wallet Management
  setActiveWallets: (wallets: ActiveWallets) => void
  
  // Storage Management
  setAddressTag: (address: string, tag: string) => void
  removeAddressTag: (address: string) => void
  setKvRecord: (key: string, value: string) => void
  removeKvRecord: (key: string) => void
  
  // Configuration
  updateConfig: (config: Partial<SimulatorConfig>) => void
  
  // Reset
  reset: () => void
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
  subscribeWithSelector(
    immer((set, get) => ({
      ...INITIAL_STATE,
      config: DEFAULT_SIMULATOR_CONFIG,
      
      connect: async (deviceId: string) => {
        const state = get()
        
        if (state.isConnected) {
          return {
            success: false,
            code: LatticeResponseCode.deviceBusy,
            error: 'Device already connected',
          }
        }
        
        // Import DeviceManager here to avoid circular dependency
        const { getDeviceManager } = await import('../lib/deviceManager')
        
        try {
          // Use DeviceManager for actual connection logic
          const deviceManager = getDeviceManager(deviceId)
          const result = await deviceManager.connect(deviceId)
          
          return {
            success: result.success,
            code: result.code,
            data: result.data,
            error: result.error,
          }
        } catch (error) {
          return {
            success: false,
            code: LatticeResponseCode.internalError,
            error: error instanceof Error ? error.message : 'Connection failed',
          }
        }
      },
      
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
      },
      
      pair: async (pairingSecret?: string) => {
        const state = get()
        
        if (!state.isConnected) {
          return {
            success: false,
            code: LatticeResponseCode.pairFailed,
            error: 'Device not connected',
          }
        }
        
        if (state.isPaired) {
          return {
            success: false,
            code: LatticeResponseCode.already,
            error: 'Device already paired',
          }
        }
        
        // Import DeviceManager here to avoid circular dependency
        const { getDeviceManager } = await import('../lib/deviceManager')
        
        try {
          // Use DeviceManager for actual pairing logic
          const deviceManager = getDeviceManager(state.deviceInfo.deviceId)
          const result = await deviceManager.pair(pairingSecret)
          
          return {
            success: result.success,
            code: result.code,
            data: result.data,
            error: result.error,
          }
        } catch (error) {
          return {
            success: false,
            code: LatticeResponseCode.pairFailed,
            error: error instanceof Error ? error.message : 'Pairing failed',
          }
        }
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
          console.log('[DeviceStore] Exiting pairing mode')
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
      
      setAddressTag: (address: string, tag: string) => {
        set((draft) => {
          draft.addressTags[address.toLowerCase()] = tag
        })
      },
      
      removeAddressTag: (address: string) => {
        set((draft) => {
          delete draft.addressTags[address.toLowerCase()]
        })
      },
      
      setKvRecord: (key: string, value: string) => {
        set((draft) => {
          draft.kvRecords[key] = value
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
    }))
  )
)

// Selectors for commonly used state slices
/**
 * Selector hook for device connection state
 * 
 * @returns Object with connection status and device ID
 */
export const useDeviceConnection = () => 
  useDeviceStore(state => ({
    isConnected: state.isConnected,
    isPaired: state.isPaired,
    isPairingMode: state.isPairingMode,
    deviceId: state.deviceInfo.deviceId,
  }))

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

