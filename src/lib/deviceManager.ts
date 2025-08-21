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

export class DeviceManager {
  private simulator: LatticeSimulator
  private requestProcessor: RequestProcessor
  private isInitialized: boolean = false

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
    this.syncStateToStore()
  }

  /**
   * Connect to the device
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
        useDeviceStore.getState().connect(request.deviceId)
        useDeviceStore.getState().setDeviceInfo({
          deviceId: request.deviceId,
          isPaired: this.simulator.getIsPaired(),
          firmwareVersion: this.simulator.getFirmwareVersion(),
        })
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
   * Pair with the device
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

    if (response.success) {
      // Update store state
      useDeviceStore.getState().pair(pairingSecret)
      this.syncStateToStore()
    }

    return response
  }

  /**
   * Get addresses from the device
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
   * Sign data with the device
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
   * Get active wallets
   */
  async getWallets() {
    return await this.requestProcessor.processRequest(
      LatticeSecureEncryptedRequestType.getWallets,
      {},
      requiresUserApproval(LatticeSecureEncryptedRequestType.getWallets)
    )
  }

  /**
   * Get key-value records (address tags)
   */
  async getKvRecords(keys: string[]) {
    return await this.requestProcessor.processRequest(
      LatticeSecureEncryptedRequestType.getKvRecords,
      keys,
      requiresUserApproval(LatticeSecureEncryptedRequestType.getKvRecords)
    )
  }

  /**
   * Add key-value records (address tags)
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
   * Remove key-value records
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
   * Approve the current pending request
   */
  approveCurrentRequest(): boolean {
    return this.requestProcessor.approveCurrentRequest()
  }

  /**
   * Decline the current pending request
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
  private syncStateToStore(): void {
    const state = useDeviceStore.getState()
    
    state.setDeviceInfo({
      deviceId: this.simulator.getDeviceId(),
      isPaired: this.simulator.getIsPaired(),
      isLocked: this.simulator.getIsLocked(),
      firmwareVersion: this.simulator.getFirmwareVersion(),
    })

    state.setActiveWallets(this.simulator.getActiveWallets())
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
}

// Global device manager instance
let globalDeviceManager: DeviceManager | null = null

/**
 * Get or create the global device manager instance
 */
export function getDeviceManager(deviceId?: string): DeviceManager {
  if (!globalDeviceManager) {
    globalDeviceManager = new DeviceManager(deviceId)
  }
  return globalDeviceManager
}

/**
 * Reset the global device manager
 */
export function resetDeviceManager(): void {
  globalDeviceManager = null
}
