/**
 * SERVER-SIDE ONLY Device Manager for Lattice1 Device Simulator
 *
 * ⚠️  SERVER-SIDE ONLY: This class runs on the Node.js server and should never be imported by client code.
 *
 * Central orchestrator for device instances and user interactions
 */

import { createRequestProcessor, requiresUserApproval } from './serverRequestProcessor'
import { ServerLatticeSimulator } from './serverSimulator'
import { LatticeSecureEncryptedRequestType } from '../shared/types'
import type { RequestProcessor } from './serverRequestProcessor'
import type {
  DeviceResponse,
  ConnectRequest,
  PairRequest,
  GetAddressesRequest,
  SignRequest,
} from '../shared/types'

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
  private simulator: ServerLatticeSimulator

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
    // Initialize simulator with default config (no client store dependency)
    const defaultConfig = {
      simulatedFirmwareVersion: [0, 15, 0],
      autoApproveRequests: false,
      userApprovalTimeoutMs: 60000,
    }

    this.simulator = new ServerLatticeSimulator({
      deviceId,
      firmwareVersion: defaultConfig.simulatedFirmwareVersion as [number, number, number],
      autoApprove: defaultConfig.autoApproveRequests,
    })

    // Initialize request processor
    this.requestProcessor = createRequestProcessor(this.simulator, {
      autoApproveRequests: defaultConfig.autoApproveRequests,
      userApprovalTimeoutMs: defaultConfig.userApprovalTimeoutMs,
      enableUserInteraction: !defaultConfig.autoApproveRequests,
    })

    this.isInitialized = true

    // Note: Server-side state restoration is handled via /api/sync-client-state
    // The client-side localStorage is the source of truth, not the server-side store
    console.log(
      '[DeviceManager] Server-side DeviceManager initialized, waiting for client state sync',
    )
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
      // Server-side connection handling - no client store
      console.log('[DeviceManager] Starting connection process')

      const request: ConnectRequest = {
        deviceId: deviceId || this.simulator.getDeviceId(),
        publicKey: Buffer.alloc(65), // Mock public key
      }

      const response = await this.simulator.connect(request)

      // Update store with connection state
      if (response.success) {
        // State sync will be handled by WebSocket events to client
        console.log('[DeviceManager] Connection successful')
      }

      return {
        success: response.success,
        code: response.code,
        data: response.success,
        error: response.error,
      }
    } finally {
      console.log('[DeviceManager] Connection process completed')
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
      requiresUserApproval(LatticeSecureEncryptedRequestType.finalizePairing),
    )
    console.log('[DeviceManager] Pairing response:', response)
    if (response.success) {
      console.log('[DeviceManager] Pairing successful')
      // State sync will be handled by WebSocket events to client
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
    flag?: number,
  ): Promise<DeviceResponse<string[]>> {
    const request: GetAddressesRequest = {
      startPath,
      n: count,
      flag,
    }

    const response = await this.requestProcessor.processRequest<{ addresses: string[] }>(
      LatticeSecureEncryptedRequestType.getAddresses,
      request,
      requiresUserApproval(LatticeSecureEncryptedRequestType.getAddresses),
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
    curve: number = 0, // secp256k1
    encoding: number = 1, // none
    hashType: number = 0, // none
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
      requiresUserApproval(LatticeSecureEncryptedRequestType.sign),
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
      requiresUserApproval(LatticeSecureEncryptedRequestType.getWallets),
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
      requiresUserApproval(LatticeSecureEncryptedRequestType.getKvRecords),
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
      requiresUserApproval(LatticeSecureEncryptedRequestType.addKvRecords),
    )

    if (response.success) {
      // Server handles its own KV records - no client store interaction
      console.log('[DeviceManager] KV records added successfully')
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
      requiresUserApproval(LatticeSecureEncryptedRequestType.removeKvRecords),
    )

    if (response.success) {
      // Server handles its own KV records - no client store interaction
      console.log('[DeviceManager] KV records removed successfully')
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
    // Server handles disconnection internally - reset connection state
    this.simulator.setIsPaired(false)
    console.log('[DeviceManager] Device disconnected')
  }

  /**
   * Unpair from the device
   */
  unpair(): void {
    this.simulator.unpair()
    // State sync will be handled by WebSocket events to client
  }

  /**
   * Lock/unlock the device
   */
  setLocked(locked: boolean): void {
    this.simulator.setLocked(locked)
  }

  /**
   * Reset the device to initial state
   */
  reset(): void {
    this.simulator.reset()
    this.requestProcessor.clearPendingRequests()
  }

  /**
   * Update configuration
   */
  updateConfig(config: any): void {
    // Server maintains its own config - no client store interaction

    // Update simulator configuration
    this.simulator.setAutoApprove(config.autoApproveRequests || false)

    // Update request processor configuration
    this.requestProcessor.updateConfig({
      autoApproveRequests: config.autoApproveRequests || false,
      enableUserInteraction: !(config.autoApproveRequests || false),
    })
  }

  /**
   * Restore simulator state from client state
   *
   * This method is called by the /api/sync-client-state endpoint to restore
   * the server-side simulator state from the client's localStorage (source of truth).
   *
   * @param clientState - State from client's localStorage
   */
  public restoreFromClientState(clientState: any): void {
    console.log('[DeviceManager] Restoring simulator state from client state:', {
      isPaired: clientState.isPaired,
      kvRecordsCount: Object.keys(clientState.kvRecords || {}).length,
    })

    // Restore paired state
    if (clientState.isPaired) {
      this.simulator.setIsPaired(true)
      console.log('[DeviceManager] Restored isPaired to true from client state')
    }

    // Restore device info
    if (clientState.deviceInfo) {
      this.simulator.setDeviceInfo(clientState.deviceInfo)
      console.log('[DeviceManager] Restored device info from client state')
    }

    // Restore active wallets
    if (clientState.activeWallets) {
      this.simulator.setActiveWallets(clientState.activeWallets)
      console.log('[DeviceManager] Restored active wallets from client state')
    }

    // Restore KV records
    if (clientState.kvRecords && Object.keys(clientState.kvRecords).length > 0) {
      this.simulator.setKvRecordsDirectly(clientState.kvRecords)
      console.log(
        '[DeviceManager] Restored KV records from client state:',
        Object.keys(clientState.kvRecords),
      )
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
      isPairingMode: storeState.isPairingMode,
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
  getSimulator(): ServerLatticeSimulator {
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
