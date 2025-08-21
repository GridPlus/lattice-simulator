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
  
  // Pending Requests
  pendingRequests: [],
  
  // User Interaction
  userApprovalRequired: false,
  userApprovalTimeoutMs: 60000, // 60 seconds
  
  // Storage
  addressTags: {},
  kvRecords: {},
}

interface DeviceStore extends DeviceState {
  // Configuration
  config: SimulatorConfig
  
  // Actions
  connect: (deviceId: string) => Promise<DeviceResponse<boolean>>
  disconnect: () => void
  pair: (pairingSecret?: string) => Promise<DeviceResponse<boolean>>
  unpair: () => void
  
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
        
        // Simulate connection delay
        await new Promise(resolve => setTimeout(resolve, 500))
        
        set((draft) => {
          draft.isConnected = true
          draft.deviceInfo.deviceId = deviceId
          draft.isPairingMode = !draft.isPaired
        })
        
        return {
          success: true,
          code: LatticeResponseCode.success,
          data: state.isPaired,
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
        
        if (!state.isPairingMode) {
          return {
            success: false,
            code: LatticeResponseCode.pairDisabled,
            error: 'Pairing mode not active',
          }
        }
        
        // Simulate pairing process
        await new Promise(resolve => setTimeout(resolve, 1000))
        
        set((draft) => {
          draft.isPaired = true
          draft.isPairingMode = false
          draft.pairingSecret = pairingSecret
          draft.deviceInfo.isPaired = true
        })
        
        return {
          success: true,
          code: LatticeResponseCode.success,
          data: true,
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
        })
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
export const useDeviceConnection = () => 
  useDeviceStore(state => ({
    isConnected: state.isConnected,
    isPaired: state.isPaired,
    isPairingMode: state.isPairingMode,
    deviceId: state.deviceInfo.deviceId,
  }))

export const useDeviceStatus = () =>
  useDeviceStore(state => ({
    isLocked: state.isLocked,
    isBusy: state.isBusy,
    firmwareVersion: state.deviceInfo.firmwareVersion,
    name: state.deviceInfo.name,
  }))

export const usePendingRequests = () =>
  useDeviceStore(state => ({
    pendingRequests: state.pendingRequests,
    currentRequest: state.currentRequest,
    userApprovalRequired: state.userApprovalRequired,
  }))

export const useActiveWallets = () =>
  useDeviceStore(state => state.activeWallets)

export const useSimulatorConfig = () =>
  useDeviceStore(state => state.config)

