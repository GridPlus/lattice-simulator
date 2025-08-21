/**
 * Core Lattice1 Device Simulation Engine
 */

import { randomBytes } from 'crypto'
import {
  LatticeResponseCode,
  LatticeSecureEncryptedRequestType,
  DeviceResponse,
  ConnectRequest,
  ConnectResponse,
  PairRequest,
  GetAddressesRequest,
  GetAddressesResponse,
  SignRequest,
  SignResponse,
  WalletPath,
  ActiveWallets,
} from '../types'
import {
  generateDeviceId,
  generateKeyPair,
  generateMockAddresses,
  detectCoinTypeFromPath,
  mockSign,
  simulateDelay,
  createDeviceResponse,
  generateRequestId,
  supportsFeature,
} from '../utils'
import { SIMULATOR_CONSTANTS, EXTERNAL } from './constants'

export class LatticeSimulator {
  private deviceId: string
  private isPaired: boolean = false
  private isLocked: boolean = false
  private pairingSecret?: string
  private ephemeralKeyPair?: { publicKey: Buffer; privateKey: Buffer }
  private firmwareVersion: Buffer
  private activeWallets: ActiveWallets
  private addressTags: Record<string, string> = {}
  private kvRecords: Record<string, string> = {}
  private userApprovalRequired: boolean = false
  private autoApprove: boolean = false
  
  constructor(options?: {
    deviceId?: string
    firmwareVersion?: [number, number, number]
    autoApprove?: boolean
  }) {
    this.deviceId = options?.deviceId || generateDeviceId()
    this.autoApprove = options?.autoApprove || false
    
    // Set firmware version [patch, minor, major, reserved]
    const [major, minor, patch] = options?.firmwareVersion || [0, 15, 0]
    this.firmwareVersion = Buffer.from([patch, minor, major, 0])
    
    // Initialize with empty wallets
    const emptyUid = Buffer.alloc(32)
    this.activeWallets = {
      internal: {
        uid: emptyUid,
        external: false,
        name: Buffer.from('Internal Wallet'),
        capabilities: 0,
      },
      external: {
        uid: emptyUid,
        external: true,
        name: Buffer.alloc(0),
        capabilities: 0,
      },
    }
  }

  /**
   * Handle device connection request
   */
  async connect(request: ConnectRequest): Promise<DeviceResponse<ConnectResponse>> {
    await simulateDelay(300, 100)
    
    if (this.isLocked) {
      return createDeviceResponse(false, LatticeResponseCode.deviceLocked)
    }
    
    // Generate ephemeral key pair for this session
    this.ephemeralKeyPair = generateKeyPair()
    
    const response: ConnectResponse = {
      isPaired: this.isPaired,
      firmwareVersion: this.firmwareVersion,
      ephemeralPub: this.ephemeralKeyPair.publicKey,
      activeWallets: this.isPaired ? this.activeWallets : undefined,
    }
    
    return createDeviceResponse(true, LatticeResponseCode.success, response)
  }

  /**
   * Handle device pairing request
   */
  async pair(request: PairRequest): Promise<DeviceResponse<boolean>> {
    await simulateDelay(1000, 500)
    
    if (this.isPaired) {
      return createDeviceResponse<boolean>(false, LatticeResponseCode.already)
    }
    
    if (this.isLocked) {
      return createDeviceResponse<boolean>(false, LatticeResponseCode.deviceLocked)
    }
    
    if (!this.ephemeralKeyPair) {
      return createDeviceResponse<boolean>(false, LatticeResponseCode.pairFailed, undefined, 'No connection established')
    }
    
    // Simulate user approval for pairing
    if (!this.autoApprove) {
      const approved = await this.simulateUserApproval('pairing', 60000)
      if (!approved) {
        return createDeviceResponse(false, LatticeResponseCode.userDeclined)
      }
    }
    
    this.isPaired = true
    this.pairingSecret = request.pairingSecret
    
    return createDeviceResponse(true, LatticeResponseCode.success, true)
  }

  /**
   * Handle get addresses request
   */
  async getAddresses(request: GetAddressesRequest): Promise<DeviceResponse<GetAddressesResponse>> {
    await simulateDelay(200, 100)
    
    if (!this.isPaired) {
      return createDeviceResponse<GetAddressesResponse>(false, LatticeResponseCode.pairFailed)
    }
    
    if (this.isLocked) {
      return createDeviceResponse<GetAddressesResponse>(false, LatticeResponseCode.deviceLocked)
    }
    
    // Validate request
    if (!request.startPath || request.startPath.length < 3) {
      return createDeviceResponse<GetAddressesResponse>(false, LatticeResponseCode.invalidMsg, undefined, 'Invalid derivation path')
    }
    
    if (request.n > 10) {
      return createDeviceResponse<GetAddressesResponse>(false, LatticeResponseCode.invalidMsg, undefined, 'Too many addresses requested')
    }
    
    // Detect coin type from path
    const coinType = detectCoinTypeFromPath(request.startPath)
    if (coinType === 'UNKNOWN') {
      return createDeviceResponse<GetAddressesResponse>(false, LatticeResponseCode.invalidMsg, undefined, 'Unsupported derivation path')
    }
    
    // Generate addresses
    const addressInfos = generateMockAddresses(request.startPath, request.n, coinType)
    
    const response: GetAddressesResponse = {
      addresses: addressInfos.map(info => info.address),
    }
    
    // Add public keys if requested
    if (request.flag === EXTERNAL.GET_ADDR_FLAGS.SECP256K1_PUB) {
      response.publicKeys = addressInfos.map(info => info.publicKey)
    }
    
    return createDeviceResponse(true, LatticeResponseCode.success, response)
  }

  /**
   * Handle signing request
   */
  async sign(request: SignRequest): Promise<DeviceResponse<SignResponse>> {
    await simulateDelay(500, 300)
    
    if (!this.isPaired) {
      return createDeviceResponse<SignResponse>(false, LatticeResponseCode.pairFailed)
    }
    
    if (this.isLocked) {
      return createDeviceResponse<SignResponse>(false, LatticeResponseCode.deviceLocked)
    }
    
    // Validate request
    if (!request.data || request.data.length === 0) {
      return createDeviceResponse<SignResponse>(false, LatticeResponseCode.invalidMsg, undefined, 'No data to sign')
    }
    
    if (!request.path || request.path.length < 3) {
      return createDeviceResponse<SignResponse>(false, LatticeResponseCode.invalidMsg, undefined, 'Invalid derivation path')
    }
    
    // Check if signing requires user approval
    if (!this.autoApprove) {
      const approved = await this.simulateUserApproval('signing', 300000) // 5 minutes
      if (!approved) {
        return createDeviceResponse(false, LatticeResponseCode.userDeclined)
      }
    }
    
    // Mock signature generation
    const privateKey = this.derivePrivateKey(request.path)
    const signature = mockSign(request.data, privateKey)
    
    const response: SignResponse = {
      signature,
      recovery: request.curve === EXTERNAL.SIGNING.CURVES.SECP256K1 ? 0 : undefined,
    }
    
    return createDeviceResponse(true, LatticeResponseCode.success, response)
  }

  /**
   * Handle get wallets request
   */
  async getWallets(): Promise<DeviceResponse<ActiveWallets>> {
    await simulateDelay(100, 50)
    
    if (!this.isPaired) {
      return createDeviceResponse(false, LatticeResponseCode.pairFailed)
    }
    
    if (this.isLocked) {
      return createDeviceResponse(false, LatticeResponseCode.deviceLocked)
    }
    
    return createDeviceResponse(true, LatticeResponseCode.success, this.activeWallets)
  }

  /**
   * Handle get KV records request
   */
  async getKvRecords(keys: string[]): Promise<DeviceResponse<Record<string, string>>> {
    await simulateDelay(150, 75)
    
    if (!this.isPaired) {
      return createDeviceResponse(false, LatticeResponseCode.pairFailed)
    }
    
    if (!supportsFeature(this.firmwareVersion, [0, 12, 0])) {
      return createDeviceResponse(false, LatticeResponseCode.unsupportedVersion)
    }
    
    const records: Record<string, string> = {}
    for (const key of keys) {
      if (this.kvRecords[key]) {
        records[key] = this.kvRecords[key]
      }
    }
    
    return createDeviceResponse(true, LatticeResponseCode.success, records)
  }

  /**
   * Handle add KV records request
   */
  async addKvRecords(records: Record<string, string>): Promise<DeviceResponse<void>> {
    await simulateDelay(200, 100)
    
    if (!this.isPaired) {
      return createDeviceResponse(false, LatticeResponseCode.pairFailed)
    }
    
    if (!supportsFeature(this.firmwareVersion, [0, 12, 0])) {
      return createDeviceResponse(false, LatticeResponseCode.unsupportedVersion)
    }
    
    if (this.isLocked) {
      return createDeviceResponse(false, LatticeResponseCode.deviceLocked)
    }
    
    // Validate records
    for (const [key, value] of Object.entries(records)) {
      if (key.length > 63 || value.length > 63) {
        return createDeviceResponse(false, LatticeResponseCode.invalidMsg, undefined, 'Key or value too long')
      }
      
      if (this.kvRecords[key]) {
        return createDeviceResponse(false, LatticeResponseCode.already, undefined, `Record ${key} already exists`)
      }
    }
    
    // Add records
    Object.assign(this.kvRecords, records)
    
    return createDeviceResponse(true, LatticeResponseCode.success)
  }

  /**
   * Handle remove KV records request
   */
  async removeKvRecords(keys: string[]): Promise<DeviceResponse<void>> {
    await simulateDelay(150, 75)
    
    if (!this.isPaired) {
      return createDeviceResponse(false, LatticeResponseCode.pairFailed)
    }
    
    if (!supportsFeature(this.firmwareVersion, [0, 12, 0])) {
      return createDeviceResponse(false, LatticeResponseCode.unsupportedVersion)
    }
    
    if (this.isLocked) {
      return createDeviceResponse(false, LatticeResponseCode.deviceLocked)
    }
    
    for (const key of keys) {
      delete this.kvRecords[key]
    }
    
    return createDeviceResponse(true, LatticeResponseCode.success)
  }

  /**
   * Simulate user approval/rejection
   */
  private async simulateUserApproval(type: string, timeoutMs: number): Promise<boolean> {
    this.userApprovalRequired = true
    
    // For testing/demo purposes, auto-approve after a delay
    await simulateDelay(2000, 1000)
    
    this.userApprovalRequired = false
    
    // Simulate 90% approval rate for demo
    return Math.random() > 0.1
  }

  /**
   * Mock private key derivation
   */
  private derivePrivateKey(path: WalletPath): Buffer {
    // Simplified mock derivation - in real implementation use proper BIP32
    const pathString = path.join('/')
    const seed = Buffer.from(pathString + (this.pairingSecret || 'default'))
    return randomBytes(32) // Mock private key
  }

  // Public getters
  getDeviceId(): string {
    return this.deviceId
  }

  getIsPaired(): boolean {
    return this.isPaired
  }

  getIsLocked(): boolean {
    return this.isLocked
  }

  getFirmwareVersion(): Buffer {
    return this.firmwareVersion
  }

  getActiveWallets(): ActiveWallets {
    return this.activeWallets
  }

  getUserApprovalRequired(): boolean {
    return this.userApprovalRequired
  }

  // Configuration methods
  setLocked(locked: boolean): void {
    this.isLocked = locked
  }

  setAutoApprove(autoApprove: boolean): void {
    this.autoApprove = autoApprove
  }

  unpair(): void {
    this.isPaired = false
    this.pairingSecret = undefined
    this.ephemeralKeyPair = undefined
  }

  reset(): void {
    this.isPaired = false
    this.isLocked = false
    this.pairingSecret = undefined
    this.ephemeralKeyPair = undefined
    this.addressTags = {}
    this.kvRecords = {}
    this.userApprovalRequired = false
  }
}
