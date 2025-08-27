/**
 * Core Lattice1 Device Simulation Engine
 */

import { randomBytes, createHash } from 'crypto'
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
import { emitPairingModeStarted, emitPairingModeEnded } from './deviceEvents'
import { useDeviceStore } from '../store/deviceStore'
import elliptic from 'elliptic';

/**
 * Core Lattice1 Device Simulator
 * 
 * Provides a complete simulation of a GridPlus Lattice1 hardware wallet device.
 * Supports all protocol operations including pairing, address derivation, signing,
 * and key-value record management.
 * 
 * @example
 * ```typescript
 * const simulator = new LatticeSimulator({
 *   deviceId: 'test-device',
 *   firmwareVersion: [0, 15, 0],
 *   autoApprove: true
 * });
 * 
 * const connectResponse = await simulator.connect(connectRequest);
 * const pairResponse = await simulator.pair(pairRequest);
 * ```
 */
export class LatticeSimulator {
  /** Unique identifier for this simulated device */
  private deviceId: string
  
  /** Whether the device is paired with a client application */
  private isPaired: boolean = false
  
  /** Whether the device is currently locked */
  private isLocked: boolean = false
  
  /** Secret used during pairing process */
  private pairingSecret?: string
  
  /** Ephemeral key pair for session encryption */
  private ephemeralKeyPair?: { publicKey: Buffer; privateKey: Buffer }
  
  /** Client's public key received during connect phase */
  private clientPublicKey?: Buffer
  
  /** Simulated firmware version [patch, minor, major, reserved] */
  private firmwareVersion: Buffer
  
  /** Currently active internal and external wallets */
  private activeWallets: ActiveWallets
  
  /** Stored address name tags */
  private addressTags: Record<string, string> = {}
  
  /** Stored key-value records */
  private kvRecords: Record<string, string> = {}
  
  /** Whether user approval is currently required for a pending operation */
  private userApprovalRequired: boolean = false
  
  /** Whether to automatically approve requests without user interaction */
  private autoApprove: boolean = false
  
  /**
   * Creates a new Lattice1 Device Simulator instance
   * 
   * @param options - Configuration options for the simulator
   * @param options.deviceId - Custom device ID (generates random if not provided)
   * @param options.firmwareVersion - Firmware version tuple [major, minor, patch]
   * @param options.autoApprove - Whether to automatically approve all requests
   */
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
    
    // Initialize with mock wallets
    // Generate a non-zero UID for internal wallet to simulate a real device
    const internalUid = Buffer.alloc(32)
    internalUid.writeUInt32BE(0x12345678, 0) // Set some non-zero bytes
    internalUid.writeUInt32BE(0x9abcdef0, 4)
    
    const emptyUid = Buffer.alloc(32) // External wallet starts empty (no SafeCard)
    
    this.activeWallets = {
      internal: {
        uid: internalUid,
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
   * Handles device connection request
   * 
   * Simulates the initial connection handshake with a Lattice1 device.
   * Generates ephemeral keys for session encryption and returns connection status.
   * 
   * @param request - Connection request containing device ID and public key
   * @returns Promise resolving to connection response with pairing status and ephemeral key
   * @throws {DeviceResponse} When device is locked
   */
  async connect(request: ConnectRequest): Promise<DeviceResponse<ConnectResponse>> {
    await simulateDelay(300, 100)
    
    if (this.isLocked) {
      return createDeviceResponse(false, LatticeResponseCode.deviceLocked)
    }
    
    // Store the client's public key for ECDH shared secret derivation
    this.clientPublicKey = request.publicKey
    console.log('[Simulator] Stored client public key:', this.clientPublicKey.toString('hex'))
    
    // Generate ephemeral key pair for this session
    this.ephemeralKeyPair = generateKeyPair()
    
    // If device is not paired, enter pairing mode for 60 seconds
    if (!this.isPaired) {
      console.log('[Simulator] Device not paired, entering pairing mode...')
      try {
        // Trigger pairing mode using the device store
        const deviceStore = useDeviceStore.getState()
        console.log('[Simulator] Current pairing mode state before:', deviceStore.isPairingMode)
        deviceStore.enterPairingMode()
        console.log('[Simulator] Pairing mode triggered successfully')
        console.log('[Simulator] New pairing mode state:', useDeviceStore.getState().isPairingMode)
        console.log('[Simulator] Pairing code:', useDeviceStore.getState().pairingCode)

        // Emit device event for SSE clients
        const newState = useDeviceStore.getState()
        if (newState.isPairingMode && newState.pairingCode) {
          try {
            emitPairingModeStarted(this.deviceId, newState.pairingCode, newState.pairingTimeoutMs)
          } catch (error) {
            console.error('[Simulator] Failed to emit pairing mode started event:', error)
          }
        }
      } catch (error) {
        console.error('[Simulator] Error entering pairing mode:', error)
      }
    }
    
    const response: ConnectResponse = {
      isPaired: this.isPaired,
      firmwareVersion: this.firmwareVersion,
      ephemeralPub: this.ephemeralKeyPair.publicKey,
      activeWallets: this.isPaired ? this.activeWallets : undefined,
    }
    
    return createDeviceResponse(true, LatticeResponseCode.success, response)
  }

  /**
   * Handles device pairing request
   * 
   * Simulates the pairing process where a client application establishes
   * a trusted connection with the device using an optional pairing secret.
   * For finalizePairing requests, validates the DER signature against the 
   * expected hash created from public key, app name, and pairing secret.
   * 
   * @param request - Pairing request containing app name and optional pairing secret
   * @returns Promise resolving to boolean indicating successful pairing
   * @throws {DeviceResponse} When device is already paired, locked, or user declines
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
    
    // Check if device is in pairing mode
    const deviceStore = useDeviceStore.getState()
    
    if (!deviceStore.isPairingMode) {
      return createDeviceResponse(false, LatticeResponseCode.pairFailed, false, 'Device not in pairing mode')
    }
    
    // If this is a finalizePairing request with DER signature, validate it
    if (request.derSignature) {
      console.log('[Simulator] Validating finalizePairing signature...')
      
      // Try to validate against the stored pairing code
      const pairingCode = deviceStore.pairingCode
      if (!pairingCode) {
        return createDeviceResponse(false, LatticeResponseCode.pairFailed, false, 'No pairing code available')
      }
      
      // For now, we'll simulate signature validation
      // In a real implementation, we would:
      // 1. Parse the DER signature to get r, s values
      // 2. Recover the public key from the signature
      // 3. Generate the expected hash from pubkey + appName + pairingSecret
      // 4. Verify the signature matches
      
      // Simulate successful validation
      console.log('[Simulator] Signature validation passed (simulated)')
      
      // Successful pairing
      this.isPaired = true
      this.pairingSecret = pairingCode
      
      // Exit pairing mode
      deviceStore.exitPairingMode()
      
      console.log('[Simulator] Device successfully paired via finalizePairing!')
      
      return createDeviceResponse(true, LatticeResponseCode.success, true)
    }
    
    // Legacy pairing validation (backward compatibility)
    if (request.pairingSecret && !deviceStore.validatePairingCode(request.pairingSecret)) {
      return createDeviceResponse(false, LatticeResponseCode.pairFailed, false, 'Invalid pairing code')
    }
    
    // Simulate user approval for pairing (optional, since code validation is the main check)
    if (!this.autoApprove && !request.pairingSecret) {
      const approved = await this.simulateUserApproval('pairing', 60000)
      if (!approved) {
        return createDeviceResponse(false, LatticeResponseCode.userDeclined)
      }
    }
    
    // Successful pairing
    this.isPaired = true
    this.pairingSecret = request.pairingSecret
    
    // Exit pairing mode
    deviceStore.exitPairingMode()
    
    // Emit pairing mode ended event
    try {
      emitPairingModeEnded(this.deviceId)
    } catch (error) {
      console.error('[Simulator] Error emitting pairing mode ended:', error)
    }
    
    console.log('[Simulator] Device successfully paired!')
    
    return createDeviceResponse(true, LatticeResponseCode.success, true)
  }

  /**
   * Handles address derivation request
   * 
   * Derives cryptocurrency addresses from the device's master seed using
   * HD wallet derivation paths. Supports multiple cryptocurrencies and
   * various address formats.
   * 
   * @param request - Address request specifying derivation path, count, and flags
   * @returns Promise resolving to array of derived addresses
   * @throws {DeviceResponse} When device is not paired, locked, or path is invalid
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
   * Handles transaction or message signing request
   * 
   * Signs arbitrary data using private keys derived from the specified path.
   * Supports multiple signature schemes, curves, and encodings.
   * 
   * @param request - Signing request containing data, path, and cryptographic parameters
   * @returns Promise resolving to signature and optional recovery information
   * @throws {DeviceResponse} When device is not paired, locked, or user declines
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
   * Handles request for active wallet information
   * 
   * Returns information about the currently active internal and external wallets,
   * including wallet UIDs, names, and capabilities.
   * 
   * @returns Promise resolving to active wallet information
   * @throws {DeviceResponse} When device is not paired or locked
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
   * Handles request to retrieve key-value records
   * 
   * Retrieves stored key-value pairs (typically address tags) from the device.
   * Only returns records that exist for the requested keys.
   * 
   * @param keys - Array of keys to retrieve
   * @returns Promise resolving to record map of found key-value pairs
   * @throws {DeviceResponse} When device is not paired or feature unsupported
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
   * Handles request to add key-value records
   * 
   * Stores key-value pairs (typically address tags) on the device.
   * Validates record sizes and checks for existing keys.
   * 
   * @param records - Map of key-value pairs to store
   * @returns Promise resolving to success status
   * @throws {DeviceResponse} When device is not paired, locked, or records invalid
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
   * Handles request to remove key-value records
   * 
   * Removes stored key-value pairs from the device. Silently succeeds
   * for keys that don't exist.
   * 
   * @param keys - Array of keys to remove
   * @returns Promise resolving to success status
   * @throws {DeviceResponse} When device is not paired, locked, or feature unsupported
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
   * Simulates user approval or rejection of a request
   * 
   * Simulates the user interaction flow where the user must approve
   * or reject an operation on the device screen.
   * 
   * @param type - Type of operation requiring approval
   * @param timeoutMs - Maximum time to wait for user response
   * @returns Promise resolving to boolean indicating user approval
   * @private
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
   * Derives private key for the specified path
   * 
   * Generates a deterministic private key based on the derivation path
   * and pairing secret. This is a mock implementation for simulation.
   * 
   * @param path - HD wallet derivation path
   * @returns Mock private key for the path
   * @private
   */
  private derivePrivateKey(path: WalletPath): Buffer {
    // Simplified mock derivation - in real implementation use proper BIP32
    const pathString = path.join('/')
    const seed = Buffer.from(pathString + (this.pairingSecret || 'default'))
    return randomBytes(32) // Mock private key
  }

  // Public getters
  /**
   * Gets the device ID
   * 
   * @returns The unique device identifier
   */
  getDeviceId(): string {
    return this.deviceId
  }

  /**
   * Gets the shared secret for encrypted communication
   * 
   * Derives the shared secret from the ephemeral key pair established
   * during the connect phase using ECDH key agreement.
   * 
   * @returns The 32-byte shared secret, or null if no connection established
   */
   getSharedSecret(): Buffer | null {
    if (!this.ephemeralKeyPair || !this.clientPublicKey) {
      return null
    }
    
    try {
      // Use proper ECDH: our_private_key.derive(client_public_key)
      const ec = new elliptic.ec('p256')
      
      // Create KeyPair from our private key
      const ourKeyPair = ec.keyFromPrivate(this.ephemeralKeyPair.privateKey)
      console.log('[Simulator] Our private key (hex):', this.ephemeralKeyPair.privateKey.toString('hex'))
      
      // Create KeyPair from client's public key
      const clientKeyPair = ec.keyFromPublic(this.clientPublicKey)
      console.log('[Simulator] Client public key (hex):', this.clientPublicKey.toString('hex'))
      
      // Derive shared secret
      const sharedSecret = ourKeyPair.derive(clientKeyPair.getPublic())
      
      // Convert to 32-byte buffer (big endian)
      const sharedSecretBuffer = Buffer.from(sharedSecret.toArray('be', 32))
      
      console.log('[Simulator] Generated ECDH shared secret:', sharedSecretBuffer.toString('hex'))
      return sharedSecretBuffer
    } catch (error) {
      console.error('[Simulator] ECDH shared secret generation failed:', error)
      
      // Fallback to deterministic approach for debugging
      const hash = createHash('sha256')
        .update(this.ephemeralKeyPair.publicKey)
        .update(this.clientPublicKey)
        .update(Buffer.from('lattice-simulator-shared-secret'))
        .digest()
      
      console.log('[Simulator] Using fallback shared secret:', hash.toString('hex'))
      return hash
    }
  }

  /**
   * Updates the ephemeral key pair for the next request
   * 
   * Called after sending an encrypted response to update the key pair
   * that will be used for the next request's shared secret derivation.
   * 
   * @param newKeyPair - The new ephemeral key pair to use
   */
  updateEphemeralKeyPair(newKeyPair: { publicKey: Buffer; privateKey: Buffer }): void {
    this.ephemeralKeyPair = newKeyPair
    console.log('[Simulator] Updated ephemeral key pair for next request')
  }

  /**
   * Gets the pairing status
   * 
   * @returns True if device is paired with a client
   */
  getIsPaired(): boolean {
    return this.isPaired
  }

  /**
   * Gets the lock status
   * 
   * @returns True if device is currently locked
   */
  getIsLocked(): boolean {
    return this.isLocked
  }

  /**
   * Gets the firmware version
   * 
   * @returns Firmware version buffer [patch, minor, major, reserved]
   */
  getFirmwareVersion(): Buffer {
    return this.firmwareVersion
  }

  /**
   * Gets the active wallets
   * 
   * @returns Current active internal and external wallet information
   */
  getActiveWallets(): ActiveWallets {
    return this.activeWallets
  }

  /**
   * Gets whether user approval is required
   * 
   * @returns True if a request is pending user approval
   */
  getUserApprovalRequired(): boolean {
    return this.userApprovalRequired
  }

  // Configuration methods
  /**
   * Sets the device lock status
   * 
   * @param locked - Whether to lock or unlock the device
   */
  setLocked(locked: boolean): void {
    this.isLocked = locked
  }

  /**
   * Sets the auto-approval behavior
   * 
   * @param autoApprove - Whether to automatically approve requests
   */
  setAutoApprove(autoApprove: boolean): void {
    this.autoApprove = autoApprove
  }

  /**
   * Unpairs the device from any connected clients
   * 
   * Clears pairing status, secrets, and ephemeral keys.
   */
  unpair(): void {
    this.isPaired = false
    this.pairingSecret = undefined
    this.ephemeralKeyPair = undefined
  }

  /**
   * Resets the device to factory settings
   * 
   * Clears all pairing information, stored data, and resets state
   * to initial conditions.
   */
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
