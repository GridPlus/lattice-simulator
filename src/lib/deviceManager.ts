/**
 * Device Manager for Lattice1 Device Simulator
 * Central orchestrator for device instances and user interactions
 */

import { useDeviceStore } from '../store'
import {
  LatticeSecureEncryptedRequestType,
  DeviceResponse,
  ConnectRequest,
  PairRequest,
  GetAddressesRequest,
  SignRequest,
} from '../types'
import { LatticeSimulator } from './simulator'
import { RequestProcessor, createRequestProcessor, requiresUserApproval } from './requestProcessor'

/**
 * Device Manager for Lattice1 Device Simulator
 * 
 * Central orchestrator for device instances and user interactions.
 * Provides a high-level API for device operations and coordinates
 * between the simulator, request processor, and state management.
 * 
 * @example
 * ```typescript
 * const manager = new DeviceManager('test-device-001');
 * 
 * await manager.connect();
 * await manager.pair('secret123');
 * 
 * const addresses = await manager.getAddresses([44, 60, 0, 0, 0], 5);
 * const signature = await manager.sign(dataBuffer, [44, 60, 0, 0, 0]);
 * ```
 */
export class DeviceManager {
  /** The core device simulator instance */
  private simulator: LatticeSimulator
  
  /** Request processor for handling user interactions */
  private requestProcessor: RequestProcessor
  
  /** Whether the manager has been initialized */
  private isInitialized: boolean = false

  /**
   * Creates a new DeviceManager instance
   * 
   * Initializes the simulator and request processor with configuration
   * from the global store.
   * 
   * @param deviceId - Optional device ID (generates random if not provided)
   */
  constructor(deviceId?: string) {
    // Initialize simulator
    const config = useDeviceStore.getState().config
    this.simulator = new LatticeSimulator({
      deviceId,
      firmwareVersion: config.simulatedFirmwareVersion,
      autoApprove: config.autoApproveRequests,
    })

    // Initialize request processor
    this.requestProcessor = createRequestProcessor(this.simulator, {
      autoApproveRequests: config.autoApproveRequests,
      userApprovalTimeoutMs: useDeviceStore.getState().userApprovalTimeoutMs,
      enableUserInteraction: !config.autoApproveRequests,
    })

    this.isInitialized = true
    
    // Restore simulator state from persisted store state
    this.restoreFromStore(deviceId)
  }

  /**
   * Connects to the device
   * 
   * Establishes a connection with the simulated device and updates
   * the global state with connection information.
   * 
   * @param deviceId - Optional device ID to connect to
   * @returns Promise resolving to connection success status
   */
  async connect(deviceId?: string): Promise<DeviceResponse<boolean>> {
    if (!this.isInitialized) {
      throw new Error('Device manager not initialized')
    }

    try {
      // Update store state
      useDeviceStore.getState().setBusy(true)

      const request: ConnectRequest = {
        deviceId: deviceId || this.simulator.getDeviceId(),
        publicKey: Buffer.alloc(65), // Mock public key
      }

      const response = await this.simulator.connect(request)
      
      // Update store with connection state
      if (response.success) {
        // Sync state to store after successful connection
        this.syncStateToStore()
      }

      return {
        success: response.success,
        code: response.code,
        data: response.success,
        error: response.error,
      }
    } finally {
      useDeviceStore.getState().setBusy(false)
    }
  }

  /**
   * Pairs with the device
   * 
   * Establishes a trusted pairing with the device using an optional
   * pairing secret. Requires user approval unless auto-approve is enabled.
   * 
   * @param pairingSecret - Optional secret for secure pairing
   * @returns Promise resolving to pairing success status
   */
  async pair(pairingSecret?: string): Promise<DeviceResponse<boolean>> {
    const request: PairRequest = {
      pairingSecret,
      appName: 'Lattice Simulator',
      publicKey: Buffer.alloc(65), // Mock public key
    }

    const response = await this.requestProcessor.processRequest<boolean>(
      LatticeSecureEncryptedRequestType.finalizePairing,
      request,
      requiresUserApproval(LatticeSecureEncryptedRequestType.finalizePairing)
    )
    console.log('[DeviceManager] Pairing response:', response)
    if (response.success) {
      console.log('[DeviceManager] Pairing successful, setting connection state to true')
      // Update store state - set paired status directly since store.pair() was removed
      const store = useDeviceStore.getState()
      store.setConnectionState(true, true) // Set both connected and paired
      this.syncStateToStore()
    }

    return response
  }

  /**
   * Gets addresses from the device
   * 
   * Derives cryptocurrency addresses using HD wallet derivation paths.
   * Supports multiple cryptocurrencies based on the path structure.
   * 
   * @param startPath - HD derivation path array
   * @param count - Number of addresses to derive (default: 1)
   * @param flag - Optional address format flag
   * @returns Promise resolving to array of derived addresses
   */
  async getAddresses(
    startPath: number[],
    count: number = 1,
    flag?: number
  ): Promise<DeviceResponse<string[]>> {
    const request: GetAddressesRequest = {
      startPath,
      n: count,
      flag,
    }

    const response = await this.requestProcessor.processRequest<{ addresses: string[] }>(
      LatticeSecureEncryptedRequestType.getAddresses,
      request,
      requiresUserApproval(LatticeSecureEncryptedRequestType.getAddresses)
    )

    return {
      success: response.success,
      code: response.code,
      data: response.data?.addresses,
      error: response.error,
    }
  }

  /**
   * Signs data with the device
   * 
   * Signs transaction data or messages using the private key derived
   * from the specified path. Requires user approval unless auto-approve is enabled.
   * 
   * @param data - Data to sign
   * @param path - HD derivation path for the signing key
   * @param schema - Signing schema (default: 5 for generic)
   * @param curve - Cryptographic curve (default: 0 for secp256k1)
   * @param encoding - Data encoding (default: 1 for none)
   * @param hashType - Hash type (default: 0 for none)
   * @returns Promise resolving to signature buffer
   */
  async sign(
    data: Buffer,
    path: number[],
    schema: number = 5, // Generic signing
    curve: number = 0,  // secp256k1
    encoding: number = 1, // none
    hashType: number = 0  // none
  ): Promise<DeviceResponse<Buffer>> {
    const request: SignRequest = {
      data,
      path,
      schema,
      curve,
      encoding,
      hashType,
    }

    const response = await this.requestProcessor.processRequest<{ signature: Buffer }>(
      LatticeSecureEncryptedRequestType.sign,
      request,
      requiresUserApproval(LatticeSecureEncryptedRequestType.sign)
    )

    return {
      success: response.success,
      code: response.code,
      data: response.data?.signature,
      error: response.error,
    }
  }

  /**
   * Gets active wallet information
   * 
   * Retrieves information about the currently active internal
   * and external wallets.
   * 
   * @returns Promise resolving to active wallet data
   */
  async getWallets() {
    return await this.requestProcessor.processRequest(
      LatticeSecureEncryptedRequestType.getWallets,
      {},
      requiresUserApproval(LatticeSecureEncryptedRequestType.getWallets)
    )
  }

  /**
   * Gets key-value records (address tags)
   * 
   * Retrieves stored key-value pairs from the device, typically
   * used for address name tags.
   * 
   * @param keys - Array of keys to retrieve
   * @returns Promise resolving to record data
   */
  async getKvRecords(keys: string[]) {
    return await this.requestProcessor.processRequest(
      LatticeSecureEncryptedRequestType.getKvRecords,
      keys,
      requiresUserApproval(LatticeSecureEncryptedRequestType.getKvRecords)
    )
  }

  /**
   * Adds key-value records (address tags)
   * 
   * Stores new key-value pairs on the device and updates the global state.
   * Requires user approval unless auto-approve is enabled.
   * 
   * @param records - Map of key-value pairs to store
   * @returns Promise resolving to addition success status
   */
  async addKvRecords(records: Record<string, string>) {
    const response = await this.requestProcessor.processRequest(
      LatticeSecureEncryptedRequestType.addKvRecords,
      records,
      requiresUserApproval(LatticeSecureEncryptedRequestType.addKvRecords)
    )

    if (response.success) {
      // Update store with new records
      for (const [key, value] of Object.entries(records)) {
        useDeviceStore.getState().setKvRecord(key, value)
      }
    }

    return response
  }

  /**
   * Removes key-value records
   * 
   * Removes stored key-value pairs from the device and updates the global state.
   * Requires user approval unless auto-approve is enabled.
   * 
   * @param keys - Array of keys to remove
   * @returns Promise resolving to removal success status
   */
  async removeKvRecords(keys: string[]) {
    const response = await this.requestProcessor.processRequest(
      LatticeSecureEncryptedRequestType.removeKvRecords,
      keys,
      requiresUserApproval(LatticeSecureEncryptedRequestType.removeKvRecords)
    )

    if (response.success) {
      // Update store
      for (const key of keys) {
        useDeviceStore.getState().removeKvRecord(key)
      }
    }

    return response
  }

  /**
   * Approves the current pending request
   * 
   * Manually approves the request currently awaiting user approval.
   * 
   * @returns True if a request was approved, false if none pending
   */
  approveCurrentRequest(): boolean {
    return this.requestProcessor.approveCurrentRequest()
  }

  /**
   * Declines the current pending request
   * 
   * Manually declines the request currently awaiting user approval.
   * 
   * @returns True if a request was declined, false if none pending
   */
  declineCurrentRequest(): boolean {
    return this.requestProcessor.declineCurrentRequest()
  }

  /**
   * Disconnect from the device
   */
  disconnect(): void {
    useDeviceStore.getState().disconnect()
    this.syncStateToStore()
  }

  /**
   * Unpair from the device
   */
  unpair(): void {
    this.simulator.unpair()
    useDeviceStore.getState().unpair()
    this.syncStateToStore()
  }

  /**
   * Lock/unlock the device
   */
  setLocked(locked: boolean): void {
    this.simulator.setLocked(locked)
    useDeviceStore.getState().setLocked(locked)
  }

  /**
   * Reset the device to initial state
   */
  reset(): void {
    this.simulator.reset()
    useDeviceStore.getState().reset()
    this.requestProcessor.clearPendingRequests()
  }

  /**
   * Update configuration
   */
  updateConfig(config: any): void {
    useDeviceStore.getState().updateConfig(config)
    
    // Update simulator configuration
    this.simulator.setAutoApprove(config.autoApproveRequests || false)
    
    // Update request processor configuration
    this.requestProcessor.updateConfig({
      autoApproveRequests: config.autoApproveRequests || false,
      enableUserInteraction: !(config.autoApproveRequests || false),
    })
  }

  /**
   * Sync simulator state to Zustand store
   */
  public syncStateToStore(): void {
    const isPaired = this.simulator.getIsPaired()
    
    console.log('[DeviceManager] Syncing state to store:', {
      deviceId: this.simulator.getDeviceId(),
      isConnected: true,
      isPaired: isPaired,
      isLocked: this.simulator.getIsLocked()
    })
    
    // Get the store and update state using its methods
    const store = useDeviceStore.getState()
    
    // Update device info first
    store.setDeviceInfo({
      deviceId: this.simulator.getDeviceId(),
      isPaired: isPaired,
      isLocked: this.simulator.getIsLocked(),
      firmwareVersion: this.simulator.getFirmwareVersion(),
    })
    
    // Update active wallets
    store.setActiveWallets(this.simulator.getActiveWallets())
    
    // Update connection and pairing state using store actions
    store.setConnectionState(true, isPaired)
    
    // If device is not paired, automatically enter pairing mode
    if (!isPaired) {
      console.log('[DeviceManager] Device connected but not paired, entering pairing mode...')
      store.enterPairingMode()
    }
    
    console.log('[DeviceManager] State sync complete')
  }

  /**
   * Restore simulator state from persisted store state
   * 
   * Called during initialization to restore the simulator state
   * from the persisted store state after page refresh.
   */
  private restoreFromStore(deviceId?: string): void {
    const id = deviceId || 'SD0001'
    const storeState = useDeviceStore.getState()
    
    console.log('[DeviceManager] Restoring from store for device:', id, {
      isConnected: storeState.isConnected,
      isPaired: storeState.isPaired,
      isPairingMode: storeState.isPairingMode
    })
    
    // Only restore if the device is connected and we have the right device ID
    if (storeState.isConnected && storeState.deviceInfo.deviceId === id) {
      console.log('[DeviceManager] Device is connected, restoring simulator state')
      
      // Restore paired state
      if (storeState.isPaired) {
        this.simulator.setIsPaired(true)
        console.log('[DeviceManager] Restored isPaired to true')
      }
      
      // Restore device info
      if (storeState.deviceInfo) {
        this.simulator.setDeviceInfo(storeState.deviceInfo)
        console.log('[DeviceManager] Restored device info')
      }
      
      // Restore active wallets
      if (storeState.activeWallets) {
        this.simulator.setActiveWallets(storeState.activeWallets)
        console.log('[DeviceManager] Restored active wallets')
      }
    } else {
      console.log(`[DeviceManager] Device not connected or wrong device ID[${id}], skipping restore`)
    }
  }

  /**
   * Sync store state to simulator
   * 
   * Updates the simulator with the current store state to ensure
   * consistency after page refresh or navigation.
   */
  public syncStoreToSimulator(storeState: any): void {
    console.log('[DeviceManager] Syncing store state to simulator:', {
      isConnected: storeState.isConnected,
      isPaired: storeState.isPaired,
      isPairingMode: storeState.isPairingMode
    })
    
    // Update simulator's paired state
    if (storeState.isPaired) {
      this.simulator.setIsPaired(true)
      console.log('[DeviceManager] Set simulator isPaired to true')
    }
    
    // Update simulator's device info
    if (storeState.deviceInfo) {
      this.simulator.setDeviceInfo(storeState.deviceInfo)
      console.log('[DeviceManager] Updated simulator device info')
    }
    
    // Update simulator's active wallets
    if (storeState.activeWallets) {
      this.simulator.setActiveWallets(storeState.activeWallets)
      console.log('[DeviceManager] Updated simulator active wallets')
    }
    
    console.log('[DeviceManager] Store to simulator sync complete')
  }

  // Getters for accessing simulator state
  getDeviceId(): string {
    return this.simulator.getDeviceId()
  }

  getIsPaired(): boolean {
    return this.simulator.getIsPaired()
  }

  getIsLocked(): boolean {
    return this.simulator.getIsLocked()
  }

  getFirmwareVersion(): Buffer {
    return this.simulator.getFirmwareVersion()
  }

  getUserApprovalRequired(): boolean {
    return this.simulator.getUserApprovalRequired()
  }

  getPendingRequests() {
    return this.requestProcessor.getPendingRequests()
  }

  getCurrentRequest() {
    return this.requestProcessor.getCurrentRequest()
  }

  /**
   * Gets the internal simulator instance
   * 
   * @returns The LatticeSimulator instance
   */
  getSimulator(): LatticeSimulator {
    return this.simulator
  }
}

// Global device manager instances per device ID
const deviceManagers: Map<string, DeviceManager> = new Map()

/**
 * Gets or creates a device manager instance for the specified device ID
 * 
 * Provides device-specific manager instances instead of a global singleton.
 * Creates a new instance if none exists for the given device ID.
 * 
 * @param deviceId - Device ID for the manager (defaults to 'SD0001')
 * @returns The DeviceManager instance for the specified device
 */
export function getDeviceManager(deviceId?: string): DeviceManager {
  const id = deviceId || 'SD0001'
  
  if (!deviceManagers.has(id)) {
    deviceManagers.set(id, new DeviceManager(id))
  }
  
  return deviceManagers.get(id)!
}

/**
 * Resets device manager for a specific device ID
 * 
 * Clears the device manager instance for the specified device,
 * forcing creation of a new instance on next access.
 * 
 * @param deviceId - Device ID to reset (resets all if not specified)
 */
export function resetDeviceManager(deviceId?: string): void {
  if (deviceId) {
    deviceManagers.delete(deviceId)
  } else {
    deviceManagers.clear()
  }
}
