/**
 * CLIENT-SIDE ONLY Zustand store for device state management
 *
 * ⚠️  IMPORTANT: This store is CLIENT-SIDE ONLY and cannot be imported or used by server-side code.
 * Server-side components (like simulator.ts) maintain their own internal state.
 * Communication between client and server happens exclusively via WebSocket messages.
 */

import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import {
  sendConnectionChangedCommand,
  sendPairingChangedCommand,
  sendResetDeviceCommand,
} from '../clientWebSocketCommands'
import type {
  DeviceState,
  DeviceInfo,
  ActiveWallets,
  PendingRequest,
  SimulatorConfig,
} from '@/shared/types'

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

  // Configuration
  config: DEFAULT_SIMULATOR_CONFIG,
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
  /** Whether the store has been rehydrated from persistence */
  _hasHydrated: boolean

  // Connection and pairing actions
  /** Disconnects from the current device */
  disconnect: () => void
  /** Unpairs from the current device */
  unpair: () => void
  /** Enters pairing mode with a 8-digit code for 60 seconds */
  enterPairingMode: ({
    deviceId,
    pairingCode,
    timeoutMs,
    pairingStartTime,
  }: {
    deviceId: string
    pairingCode: string
    timeoutMs: number
    pairingStartTime: number
  }) => void
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

// Create the store with persistence on client-side only
const createStore = () => {
  if (typeof window === 'undefined') {
    console.log('[DeviceStore] Server-side: do not create')
    return null
  }

  console.log('[DeviceStore] Client-side: creating store with persistence')

  return create<DeviceStore>()(
    persist(
      (set, get) => {
        // Create a vanilla version of the base store logic
        const storeImpl = {
          ...INITIAL_STATE,
          config: DEFAULT_SIMULATOR_CONFIG,
          _hasHydrated: false,

          // Device management
          setDeviceInfo: (info: Partial<DeviceInfo>) => {
            set(state => ({
              ...state,
              deviceInfo: { ...state.deviceInfo, ...info },
            }))
          },

          setLocked: (isLocked: boolean) => {
            set(state => ({ ...state, isLocked }))
          },

          setBusy: (isBusy: boolean) => {
            set(state => ({ ...state, isBusy }))
          },

          // Connection & Pairing
          setConnectionState: (isConnected: boolean, isPaired: boolean) => {
            set(state => ({
              ...state,
              isConnected,
              isPaired,
            }))

            const state = get()
            sendConnectionChangedCommand(state.deviceInfo.deviceId, isConnected)
            sendPairingChangedCommand(state.deviceInfo.deviceId, isPaired)
          },

          disconnect: () => {
            set(state => ({
              ...state,
              isConnected: false,
              isPairingMode: false,
              ephemeralPub: undefined,
              sharedSecret: undefined,
              pendingRequests: [],
              currentRequest: undefined,
              userApprovalRequired: false,
            }))
            const state = get()
            sendConnectionChangedCommand(state.deviceInfo.deviceId, false)
          },

          unpair: () => {
            const state = get()
            if (state.pairingTimeoutId) {
              clearTimeout(state.pairingTimeoutId)
            }
            set(prevState => ({
              ...prevState,
              isConnected: false,
              isPaired: false,
              isPairingMode: false,
              pairingCode: undefined,
              pairingStartTime: undefined,
              pairingTimeoutId: undefined,
            }))
            sendConnectionChangedCommand(state.deviceInfo.deviceId, false)
            sendPairingChangedCommand(state.deviceInfo.deviceId, false)
          },

          // Request management
          addPendingRequest: (request: PendingRequest) => {
            set(state => ({
              ...state,
              pendingRequests: [...state.pendingRequests, request],
              currentRequest: state.currentRequest || request,
              userApprovalRequired: true,
            }))
          },

          removePendingRequest: (requestId: string) => {
            set(state => {
              const updatedRequests = state.pendingRequests.filter(req => req.id !== requestId)
              return {
                ...state,
                pendingRequests: updatedRequests,
                currentRequest: updatedRequests[0] || undefined,
                userApprovalRequired: updatedRequests.length > 0,
              }
            })
          },

          approveCurrentRequest: () => {
            const state = get()
            if (state.currentRequest) {
              storeImpl.removePendingRequest(state.currentRequest.id)
            }
          },

          declineCurrentRequest: () => {
            const state = get()
            if (state.currentRequest) {
              storeImpl.removePendingRequest(state.currentRequest.id)
            }
          },

          // Wallet management
          setActiveWallets: (activeWallets: ActiveWallets) => {
            set(state => ({ ...state, activeWallets }))
          },

          // KV Records management
          setKvRecord: (key: string, value: string) => {
            set(state => ({
              ...state,
              kvRecords: { ...state.kvRecords, [key.toLowerCase()]: value },
            }))
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
            set(state => {
              const normalizedKey = key.toLowerCase()
              if (state.kvRecords[normalizedKey]) {
                return {
                  ...state,
                  kvRecords: { ...state.kvRecords, [normalizedKey]: newValue },
                }
              } else {
                throw new Error(`KV record not found for key: ${key}`)
              }
            })
          },

          removeKvRecord: (key: string) => {
            set(state => {
              const newRecords = { ...state.kvRecords }
              delete newRecords[key]
              return { ...state, kvRecords: newRecords }
            })
          },

          // Configuration
          updateConfig: (config: Partial<SimulatorConfig>) => {
            set(state => ({
              ...state,
              config: { ...state.config, ...config },
            }))
          },

          // Reset functions
          reset: () => {
            set(INITIAL_STATE)
          },

          resetConnectionState: async () => {
            const state = get()
            const deviceId = state.deviceInfo.deviceId

            try {
              // Send WebSocket command to reset server-side connection state
              sendResetDeviceCommand(deviceId, 'connection')

              set(state => ({
                ...state,
                isConnected: false,
                isPaired: false,
                isPairingMode: false,
                pairingCode: undefined,
                pairingStartTime: undefined,
                pairingTimeoutId: undefined,
                ephemeralPub: undefined,
                sharedSecret: undefined,
              }))
            } catch (error) {
              console.error(
                `[DeviceStore] Failed to reset connection state for ${deviceId}:`,
                error,
              )
            }
          },

          resetDeviceState: async () => {
            const state = get()
            const deviceId = state.deviceInfo.deviceId

            try {
              // Send WebSocket command to reset server-side state
              sendResetDeviceCommand(deviceId, 'full')

              // Reset client-side state (including KV records)
              set(() => ({
                ...INITIAL_STATE,
                config: DEFAULT_SIMULATOR_CONFIG,
              }))

              // Emit events to notify other components
              sendConnectionChangedCommand(deviceId, false)
              sendPairingChangedCommand(deviceId, false)
            } catch (error) {
              console.error(`[DeviceStore] Failed to reset device state for ${deviceId}:`, error)

              // Still reset client state even if server reset fails
              set(() => ({
                ...INITIAL_STATE,
                config: DEFAULT_SIMULATOR_CONFIG,
              }))

              sendConnectionChangedCommand(deviceId, false)
              sendPairingChangedCommand(deviceId, false)
            }
          },

          // Pairing mode
          enterPairingMode: ({
            deviceId,
            pairingCode,
            timeoutMs,
            pairingStartTime,
          }: {
            deviceId: string
            pairingCode: string
            timeoutMs: number
            pairingStartTime: number
          }) => {
            const state = get()
            if (state.deviceInfo.deviceId != deviceId) {
              console.log(
                `[DeviceStore] Ignoring pairing mode event for deviceId: ${deviceId} - current deviceId: ${state.deviceInfo.deviceId}`,
              )
              return
            }

            set(state => ({
              ...state,
              isConnected: true,
              isPairingMode: true,
              pairingStartTime: pairingStartTime,
              pairingCode: pairingCode,
              pairingTimeoutMs: timeoutMs,
            }))
          },

          exitPairingMode: () => {
            set(state => ({ ...state, isPairingMode: false }))
          },

          validatePairingCode: (code: string) => {
            const state = get()
            return state.pairingCode === code
          },
        }

        return storeImpl
      },
      {
        name: 'lattice-device-store',
        partialize: state => ({
          isConnected: state.isConnected,
          isPaired: state.isPaired,
          isPairingMode: state.isPairingMode,
          deviceInfo: state.deviceInfo,
          kvRecords: state.kvRecords,
          config: state.config,
        }),
        onRehydrateStorage: () => state => {
          // Handle Buffer conversion for firmwareVersion
          if (state && state.deviceInfo && Array.isArray(state.deviceInfo.firmwareVersion)) {
            state.deviceInfo.firmwareVersion = Buffer.from(state.deviceInfo.firmwareVersion)
          }
        },
      },
    ),
  )
}

export const useDeviceStore =
  createStore() ||
  (() => {
    // Fallback store for SSR - return a minimal store that matches the interface
    const fallbackStore = {
      getState: () => INITIAL_STATE,
      setState: () => {},
      subscribe: () => () => {},
      destroy: () => {},
      // Add the missing methods that components expect
      getAllKvRecords: () => [],
      getKvRecord: () => undefined,
      setKvRecord: () => {},
      removeKvRecord: () => {},
      updateKvRecord: () => {},
      setConnectionState: () => {},
      exitPairingMode: () => {},
      enterPairingMode: () => {},
      resetConnectionState: () => {},
      setDeviceInfo: () => {},
      activeWallets: [],
      config: INITIAL_STATE.config,
      _hasHydrated: true,
    }

    // Make it callable like a real Zustand store
    return ((selector?: (state: DeviceState) => any) => {
      if (typeof selector === 'function') {
        return selector(INITIAL_STATE)
      }
      return fallbackStore
    }) as any
  })()

// Selectors for commonly used state slices
/**
 * Selector hook for device connection state
 *
 * @returns Object with connection status and device ID
 */
export const useDeviceConnection = () => {
  const state = useDeviceStore((state: any) => ({
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
  useDeviceStore((state: any) => ({
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
  useDeviceStore((state: any) => ({
    pendingRequests: state.pendingRequests,
    currentRequest: state.currentRequest,
    userApprovalRequired: state.userApprovalRequired,
  }))

/**
 * Selector hook for active wallet information
 *
 * @returns Current active wallet data
 */
export const useActiveWallets = () => useDeviceStore((state: any) => state.activeWallets)

/**
 * Selector hook for simulator configuration
 *
 * @returns Current simulator configuration settings
 */
export const useSimulatorConfig = () => useDeviceStore((state: any) => state.config)
