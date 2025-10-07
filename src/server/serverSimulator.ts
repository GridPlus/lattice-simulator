/**
 * Core Lattice1 Device Simulation Engine
 */

import { randomBytes, createHash } from 'crypto'
import { wordlist } from '@scure/bip39/wordlists/english'
import elliptic from 'elliptic'
import { keccak256 } from 'viem/utils'
import {
  emitPairingModeStarted,
  emitPairingModeEnded,
  emitConnectionChanged,
  emitPairingChanged,
  emitKvRecordsAdded,
  emitKvRecordsRemoved,
  emitKvRecordsFetched,
  emitSigningRequestCreated,
  emitSigningRequestCompleted,
} from './serverDeviceEvents'
import { requestWalletAddresses } from './serverRequestManager'
import { SignRequestSchema } from './signRequestParsers'
import { signingService } from '../services/signingService'
import { walletManager } from '../services/walletManager'
import { EXTERNAL } from '../shared/constants'
import {
  buildEthereumSigningPreimage,
  decodeEthereumTxPayload,
  type DecodedEthereumTxPayload,
} from './utils/ethereumTx'
import {
  LatticeResponseCode,
  type DeviceResponse,
  type ConnectRequest,
  type ConnectResponse,
  type PairRequest,
  type GetAddressesRequest,
  type GetAddressesResponse,
  type SignRequest,
  type SignResponse,
  type WalletPath,
  type ActiveWallets,
  type SigningRequest,
  type Wallet,
} from '../shared/types'
import {
  generateDeviceId,
  generateKeyPair,
  detectCoinTypeFromPath,
  simulateDelay,
  createDeviceResponse,
  supportsFeature,
  aes256_encrypt,
} from '../shared/utils'
import { getWalletConfig } from '../shared/walletConfig'

interface MultipartSignSession {
  schema: number
  curve: number
  encoding: number
  hashType: number
  omitPubkey: boolean
  path: WalletPath
  expectedLength: number
  collectedLength: number
  messageChunks: Buffer[]
  decoderChunks: Buffer[]
  nextCode: Buffer
  ethMeta?: DecodedEthereumTxPayload
}

/**
 * SERVER-SIDE ONLY Lattice1 Device Simulator
 *
 * ⚠️  SERVER-SIDE ONLY: This class runs on the Node.js server and should never be imported by client code.
 *
 * Provides a complete simulation of a GridPlus Lattice1 hardware wallet device.
 * Supports all protocol operations including pairing, address derivation, signing,
 * and key-value record management.
 *
 * @example
 * ```typescript
 * // SERVER-SIDE ONLY
 * const simulator = new ServerLatticeSimulator({
 *   deviceId: 'test-device',
 *   firmwareVersion: [0, 15, 0],
 *   autoApprove: true
 * });
 *
 * const connectResponse = await simulator.connect(connectRequest);
 * const pairResponse = await simulator.pair(pairRequest);
 * ```
 */
export class ServerLatticeSimulator {
  /** Unique identifier for this simulated device */
  private deviceId: string

  /** Whether the device is paired with a client application */
  private isPaired: boolean = false

  /** Whether the device is currently locked */
  private isLocked: boolean = false

  /** Ephemeral key pair for session encryption */
  private ephemeralKeyPair?: { publicKey: Buffer; privateKey: Buffer }

  /** Client's public key received during connect phase */
  private clientPublicKey?: Buffer

  /** Simulated firmware version [patch, minor, major, reserved] */
  private firmwareVersion: Buffer

  /** Currently active internal and external wallets */
  private activeWallets: ActiveWallets

  /** Stored key-value records */
  private kvRecords: Record<string, string> = {}
  /** Next available ID for KV records */
  private nextKvRecordId: number = 0
  /** Map from record ID to key for removal by ID */
  private kvRecordIdToKey: Map<number, string> = new Map()

  /** Tracks multipart signing sessions awaiting extra data */
  private multipartSignSessions: Map<string, MultipartSignSession> = new Map()

  /** Whether user approval is currently required for a pending operation */
  private userApprovalRequired: boolean = false

  /** Whether to automatically approve requests without user interaction */
  private autoApprove: boolean = false

  /** Whether the device is currently in pairing mode */
  private isPairingMode: boolean = false

  /** 6-digit pairing code displayed during pairing mode */
  private pairingCode: string

  /** Pairing mode timeout in milliseconds */
  private pairingTimeoutMs: number = 60000

  /** Timestamp when pairing mode was started */
  private pairingStartTime?: number

  /** Timeout ID for pairing mode timeout */
  private pairingTimeoutId?: NodeJS.Timeout

  /** Pending signing requests awaiting user approval */
  private pendingSigningRequests: Map<string, SigningRequest> = new Map()

  /** Promise resolvers for pending signing requests */
  private pendingSigningPromises: Map<
    string,
    {
      resolve: (value: DeviceResponse<SignResponse>) => void
      reject: (reason?: any) => void
    }
  > = new Map()

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
    pairingCode?: string
  }) {
    this.deviceId = options?.deviceId || generateDeviceId()
    this.autoApprove = options?.autoApprove || false
    this.pairingCode = options?.pairingCode || '12345678'

    // Wallet addresses will be derived on-demand when requested by client

    // Set firmware version [patch, minor, major, reserved]
    const [major, minor, patch] = options?.firmwareVersion || [0, 15, 0]
    this.firmwareVersion = Buffer.from([patch, minor, major, 0])

    // Initialize with mock wallets
    // Generate a non-zero UID for internal wallet to simulate a real device
    const internalUid = Buffer.alloc(32)
    internalUid.writeUInt32BE(0x12345678, 0) // Set some non-zero bytes
    internalUid.writeUInt32BE(0x9abcdef0, 4)

    const emptyUid = Buffer.alloc(32) // External wallet starts empty (no SafeCard)

    // Store UIDs as hex strings for better serialization and debugging
    // Protocol handler will convert back to Buffers when needed for SDK compatibility
    this.activeWallets = {
      internal: {
        uid: internalUid.toString('hex'),
        external: false,
        name: 'Internal Wallet',
        capabilities: 0,
      },
      external: {
        uid: emptyUid.toString('hex'),
        external: true,
        name: '',
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

    const encryptedWalletData = this.isPaired
      ? this.encryptActiveWallets(this.clientPublicKey)
      : undefined

    // If device is not paired, enter pairing mode for 60 seconds
    if (!this.isPaired) {
      console.log('[Simulator] Device not paired, entering pairing mode...')
      this.enterPairingMode()
    }

    // Always include activeWallets in connect response, even if not paired
    // The SDK expects this structure to be present
    console.log('[Simulator] Connect response - isPaired:', this.isPaired)
    console.log(
      '[Simulator] Connect response - activeWallets:',
      JSON.stringify(this.activeWallets, null, 2),
    )

    const response: ConnectResponse = {
      isPaired: this.isPaired,
      firmwareVersion: this.firmwareVersion,
      ephemeralPub: this.ephemeralKeyPair.publicKey,
      activeWallets: this.activeWallets, // Always include, even when not paired
      encryptedWalletData,
    }

    return createDeviceResponse(true, LatticeResponseCode.success, response)
  }

  /**
   * Handles device pairing request (finalizePairing)
   *
   * Simulates the pairing process where a client application establishes
   * a trusted connection with the device. Validates the DER signature from
   * the finalizePairing request against the expected hash created from
   * public key, app name, and pairing secret.
   *
   * @param request - Pairing request containing app name and DER signature
   * @returns Promise resolving to boolean indicating successful pairing
   * @throws {DeviceResponse} When device is already paired, locked, or invalid request
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
      return createDeviceResponse<boolean>(
        false,
        LatticeResponseCode.pairFailed,
        undefined,
        'No connection established',
      )
    }

    // Check if device is in pairing mode
    if (!this.isPairingMode) {
      return createDeviceResponse(
        false,
        LatticeResponseCode.pairFailed,
        false,
        'Device not in pairing mode',
      )
    }

    // Validate finalizePairing request with DER signature
    if (request.derSignature) {
      console.log('[Simulator] Validating finalizePairing signature...')

      // Use the simulator's internal pairing code for validation
      if (!this.pairingCode) {
        return createDeviceResponse(
          false,
          LatticeResponseCode.pairFailed,
          false,
          'No pairing code available',
        )
      }

      // Implement real signature validation
      try {
        // 1. Use the client public key that was stored during connect
        if (!this.clientPublicKey) {
          throw new Error('No client public key available')
        }

        // 2. Create app name buffer (25 bytes) like SDK does
        const nameBuf = Buffer.alloc(25)
        nameBuf.write(request.appName)

        // 3. Generate the same hash that was signed by the SDK
        const hash = this.generateAppSecret(
          this.clientPublicKey,
          nameBuf,
          Buffer.from(this.pairingCode),
        )

        // 4. Verify the signature against the hash
        const isValid = this.verifySignature(request.derSignature, hash, this.clientPublicKey)

        if (!isValid) {
          console.log('[Simulator] Signature verification failed')
          return createDeviceResponse(
            false,
            LatticeResponseCode.pairFailed,
            false,
            'Invalid signature',
          )
        }

        console.log('[Simulator] Signature validation passed')
      } catch (error) {
        console.error('[Simulator] Signature validation error:', error)
        return createDeviceResponse(
          false,
          LatticeResponseCode.pairFailed,
          false,
          'Signature validation failed',
        )
      }

      // Successful pairing
      this.isPaired = true

      // Exit pairing mode and emit events
      this.exitPairingMode()

      // Emit connection and pairing events
      try {
        emitConnectionChanged(this.deviceId, true)
        emitPairingChanged(this.deviceId, true)
      } catch (error) {
        console.error('[Simulator] Failed to emit connection/pairing events:', error)
      }

      console.log('[Simulator] Device successfully paired via finalizePairing!')

      return createDeviceResponse(true, LatticeResponseCode.success, true)
    }

    // If no DER signature, this is not a valid finalizePairing request
    return createDeviceResponse(
      false,
      LatticeResponseCode.pairFailed,
      false,
      'Invalid finalizePairing request - no signature provided',
    )
  }

  private encryptActiveWallets(clientPublicKey?: Buffer): Buffer | undefined {
    if (!clientPublicKey || !this.ephemeralKeyPair) {
      return undefined
    }

    try {
      const ec = new elliptic.ec('p256')
      const deviceKey = ec.keyFromPrivate(this.ephemeralKeyPair.privateKey)
      const clientKey = ec.keyFromPublic(clientPublicKey)
      const sharedSecret = Buffer.from(deviceKey.derive(clientKey.getPublic()).toArray('be', 32))

      const walletPayload = this.buildWalletDescriptorPayload()
      return aes256_encrypt(walletPayload, sharedSecret)
    } catch (error) {
      console.error('[Simulator] Failed to encrypt wallet data:', error)
      return undefined
    }
  }

  private buildWalletDescriptorPayload(): Buffer {
    const payload = Buffer.alloc(144)
    this.writeWalletDescriptor(payload, 0, this.activeWallets?.internal)
    this.writeWalletDescriptor(payload, 71, this.activeWallets?.external)
    // Last two bytes remain zero to satisfy SDK padding checks
    return payload
  }

  private writeWalletDescriptor(target: Buffer, offset: number, wallet?: Wallet) {
    if (!wallet) {
      return
    }
    const uidBuf = wallet.uid ? Buffer.from(wallet.uid, 'hex') : Buffer.alloc(0)
    uidBuf.copy(target, offset, 0, Math.min(uidBuf.length, 32))
    target.writeUInt32BE(wallet.capabilities ?? 0, offset + 32)
    if (wallet.name) {
      const nameBuf = Buffer.from(wallet.name, 'utf8')
      nameBuf.slice(0, 35).copy(target, offset + 36)
    }
  }

  /**
   * Parses DER signature to extract r and s values
   *
   * @param derSignature - DER-encoded signature buffer
   * @returns Object containing r and s values as 32-byte buffers
   */
  private parseDERSignature(derSignature: Buffer): { r: Buffer; s: Buffer } {
    // DER signature format: 0x30 [length] 0x02 [r_length] [r] 0x02 [s_length] [s]
    if (derSignature.length < 8 || derSignature[0] !== 0x30) {
      throw new Error('Invalid DER signature format')
    }

    let offset = 2 // Skip 0x30 and length byte

    // Parse r value
    if (derSignature[offset] !== 0x02) {
      throw new Error('Invalid DER signature: missing r value')
    }
    const rLength = derSignature[offset + 1]
    offset += 2
    let r = derSignature.slice(offset, offset + rLength)
    offset += rLength

    // Parse s value
    if (derSignature[offset] !== 0x02) {
      throw new Error('Invalid DER signature: missing s value')
    }
    const sLength = derSignature[offset + 1]
    offset += 2
    let s = derSignature.slice(offset, offset + sLength)

    // Remove leading zeros and ensure 32-byte length
    r = Buffer.from(this.normalizeSignatureComponent(r))
    s = Buffer.from(this.normalizeSignatureComponent(s))

    return { r, s }
  }

  /**
   * Normalizes signature component to 32 bytes
   *
   * @param component - Signature component (r or s)
   * @returns 32-byte normalized component
   */
  private normalizeSignatureComponent(component: Buffer): Buffer {
    // Remove leading zeros
    let normalized = component
    while (normalized.length > 1 && normalized[0] === 0x00) {
      normalized = normalized.slice(1)
    }

    // Ensure 32-byte length
    if (normalized.length > 32) {
      throw new Error('Signature component too large')
    }

    // Pad with zeros if needed
    if (normalized.length < 32) {
      const padding = Buffer.alloc(32 - normalized.length)
      normalized = Buffer.concat([padding, normalized])
    }

    return normalized
  }

  /**
   * Validates the format of signature components
   *
   * @param r - R component of the signature
   * @param s - S component of the signature
   * @returns True if signature format is valid
   */
  private validateSignatureFormat(r: Buffer, s: Buffer): boolean {
    try {
      // Check that r and s are 32 bytes each
      if (r.length !== 32 || s.length !== 32) {
        console.log(`[Simulator] Invalid signature component lengths: r=${r.length}, s=${s.length}`)
        return false
      }

      // Check that r and s are not zero
      const rIsZero = r.every(byte => byte === 0)
      const sIsZero = s.every(byte => byte === 0)

      if (rIsZero || sIsZero) {
        console.log('[Simulator] Signature components cannot be zero')
        return false
      }

      // Check that r and s are not equal to the curve order (for P-256)
      // P-256 curve order is 0xFFFFFFFF00000000FFFFFFFFFFFFFFFFBCE6FAADA7179E84F3B9CAC2FC632551
      const p256Order = Buffer.from(
        'FFFFFFFF00000000FFFFFFFFFFFFFFFFBCE6FAADA7179E84F3B9CAC2FC632551',
        'hex',
      )

      if (r.equals(p256Order) || s.equals(p256Order)) {
        console.log('[Simulator] Signature components cannot equal curve order')
        return false
      }

      return true
    } catch (error) {
      console.error('[Simulator] Signature format validation error:', error)
      return false
    }
  }

  /**
   * Validates that signature components are within valid ranges
   *
   * @param r - R component of the signature
   * @param s - S component of the signature
   * @returns True if signature components are valid
   */
  private validateSignatureComponents(r: Buffer, s: Buffer): boolean {
    try {
      // Check that r and s are within the valid range for P-256
      // They should be positive integers less than the curve order

      // Convert to BigInt for comparison
      const rBigInt = BigInt('0x' + r.toString('hex'))
      const sBigInt = BigInt('0x' + s.toString('hex'))
      const p256OrderBigInt = BigInt(
        '0xFFFFFFFF00000000FFFFFFFFFFFFFFFFBCE6FAADA7179E84F3B9CAC2FC632551',
      )

      if (rBigInt >= p256OrderBigInt || sBigInt >= p256OrderBigInt) {
        console.log('[Simulator] Signature components exceed curve order')
        return false
      }

      if (rBigInt <= BigInt(0) || sBigInt <= BigInt(0)) {
        console.log('[Simulator] Signature components must be positive')
        return false
      }

      return true
    } catch (error) {
      console.error('[Simulator] Signature component validation error:', error)
      return false
    }
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
      console.log('[Simulator] Invalid derivation path:', request.startPath)
      return createDeviceResponse<GetAddressesResponse>(
        false,
        LatticeResponseCode.invalidMsg,
        undefined,
        'Invalid derivation path',
      )
    }

    if (request.n > 10) {
      return createDeviceResponse<GetAddressesResponse>(
        false,
        LatticeResponseCode.invalidMsg,
        undefined,
        'Too many addresses requested',
      )
    }

    // Detect coin type from path
    const coinType = detectCoinTypeFromPath(request.startPath)
    if (coinType === 'UNKNOWN') {
      return createDeviceResponse<GetAddressesResponse>(
        false,
        LatticeResponseCode.invalidMsg,
        undefined,
        'Unsupported derivation path',
      )
    }

    // Use proper request/response pattern to get real addresses from client-side wallet derivation
    console.log('[Simulator] Requesting wallet addresses from client via WebSocket')

    try {
      // Import request manager here to avoid circular dependencies

      // Send request to client and wait for real wallet addresses
      const addressResponse = await requestWalletAddresses(this.deviceId, {
        startPath: request.startPath,
        count: request.n,
        coinType,
        flag: request.flag,
      })

      console.log('[Simulator] Received wallet addresses from client:', addressResponse)

      const response: GetAddressesResponse = {
        addresses: addressResponse.addresses.map(addr => addr.address),
      }

      // Add public keys if requested
      if (request.flag === EXTERNAL.GET_ADDR_FLAGS.SECP256K1_PUB) {
        response.publicKeys = addressResponse.addresses.map(addr => addr.publicKey)
      }

      return createDeviceResponse(true, LatticeResponseCode.success, response)
    } catch (error) {
      console.error('[Simulator] Error getting wallet addresses from client:', error)
      return createDeviceResponse<GetAddressesResponse>(
        false,
        LatticeResponseCode.internalError,
        undefined,
        'Failed to derive wallet addresses',
      )
    }
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
      return createDeviceResponse<SignResponse>(
        false,
        LatticeResponseCode.invalidMsg,
        undefined,
        'No data to sign',
      )
    }
    const isExtraDataRequest = request.schema === SignRequestSchema.EXTRA_DATA

    if (!isExtraDataRequest && (!request.path || request.path.length === 0)) {
      console.log('[Simulator] Invalid derivation request.path:', request.path)
      return createDeviceResponse<SignResponse>(
        false,
        LatticeResponseCode.invalidMsg,
        undefined,
        'Invalid derivation path',
      )
    }

    if (isExtraDataRequest) {
      return this.handleExtraDataSignRequest(request)
    }

    if (request.hasExtraPayloads) {
      return await this.handleMultipartBaseRequest(request)
    }

    // Check if auto-approve is disabled - create pending request for user approval
    if (!this.autoApprove) {
      const pendingRequest = await this.createSigningRequest(request)

      // Create a Promise that will be resolved when user approves/rejects
      return new Promise<DeviceResponse<SignResponse>>((resolve, reject) => {
        // Store the promise resolvers
        this.pendingSigningPromises.set(pendingRequest.id, { resolve, reject })

        console.log(
          `[Simulator] Created pending signing request ${pendingRequest.id}, waiting for user approval...`,
        )

        // Set a timeout to auto-reject if no response within timeout period
        setTimeout(() => {
          if (this.pendingSigningPromises.has(pendingRequest.id)) {
            this.pendingSigningPromises.delete(pendingRequest.id)
            this.pendingSigningRequests.delete(pendingRequest.id)
            resolve(
              createDeviceResponse<SignResponse>(
                false,
                LatticeResponseCode.userDeclined,
                undefined,
                'Request timed out',
              ),
            )
          }
        }, pendingRequest.timeoutMs || 300000) // 5 minutes default timeout
      })
    }

    return this.executeSigning(request)
  }

  private generateNextCode(): Buffer {
    return randomBytes(8)
  }

  private extractGenericRequestInfo(request: SignRequest) {
    if (!request.rawPayload) {
      throw new Error('Missing raw payload for multipart signing request')
    }

    const payload = request.rawPayload

    if (request.schema === SignRequestSchema.ETHEREUM_TRANSACTION) {
      const meta = decodeEthereumTxPayload(payload, {
        hasExtraPayloads: request.hasExtraPayloads ?? false,
      })
      const messageChunk = meta.dataChunk.slice(0, Math.min(meta.dataLength, meta.dataChunk.length))
      const remainingChunk = meta.remainingChunk
      const path: WalletPath =
        request.path && request.path.length > 0
          ? (request.path as WalletPath)
          : (meta.path as WalletPath)

      const defaultHashType = meta.prehash
        ? EXTERNAL.SIGNING.HASHES.NONE
        : EXTERNAL.SIGNING.HASHES.KECCAK256

      return {
        encoding: request.encoding ?? EXTERNAL.SIGNING.ENCODINGS.EVM,
        hashType: request.hashType ?? defaultHashType,
        curve: request.curve ?? EXTERNAL.SIGNING.CURVES.SECP256K1,
        path,
        omitPubkey: request.omitPubkey ?? false,
        messageLength: meta.dataLength,
        messageChunk,
        remainingChunk,
        ethMeta: meta,
      }
    }

    let offset = 0

    const encoding = payload.readUInt32LE(offset)
    offset += 4
    const hashType = payload.readUInt8(offset)
    offset += 1
    const curve = payload.readUInt8(offset)
    offset += 1

    const pathLength = payload.readUInt32LE(offset)
    offset += 4
    const path: WalletPath = []
    for (let i = 0; i < 5; i++) {
      const segment = payload.readUInt32LE(offset)
      offset += 4
      if (i < pathLength) {
        path.push(segment)
      }
    }

    const omitPubkeyFlag = payload.readUInt8(offset)
    offset += 1

    if (payload.length < offset + 2) {
      throw new Error('Malformed signing request payload')
    }

    const messageLength = payload.readUInt16LE(offset)
    offset += 2

    const baseChunk = payload.slice(offset)
    const messageChunkLength = Math.min(messageLength, baseChunk.length)
    const messageChunk = baseChunk.slice(0, messageChunkLength)
    const remainingChunk = baseChunk.slice(messageChunkLength)

    return {
      encoding,
      hashType,
      curve,
      path,
      omitPubkey: omitPubkeyFlag === 1,
      messageLength,
      messageChunk,
      remainingChunk,
    }
  }

  private async handleMultipartBaseRequest(
    request: SignRequest,
  ): Promise<DeviceResponse<SignResponse>> {
    try {
      const info = this.extractGenericRequestInfo(request)

      // Check if all data is already present in the first request
      const isComplete = info.messageLength === info.messageChunk.length

      console.log('[Simulator] handleMultipartBaseRequest check:', {
        messageLength: info.messageLength,
        chunkLength: info.messageChunk.length,
        isComplete,
        schema: request.schema,
      })

      if (isComplete) {
        // Data is complete, sign immediately instead of creating multipart session
        console.log('[Simulator] Data complete in first request, signing immediately')

        let signingPayload = info.messageChunk
        let hashType = request.hashType ?? info.hashType

        if (info.ethMeta) {
          signingPayload = Buffer.from(
            buildEthereumSigningPreimage(info.ethMeta, info.messageChunk),
          )
          if (info.ethMeta.prehash) {
            hashType = EXTERNAL.SIGNING.HASHES.NONE
          }
        }

        const finalRequest: SignRequest = {
          data: signingPayload,
          path: (request.path && request.path.length > 0 ? request.path : info.path) as WalletPath,
          schema: request.schema,
          curve: request.curve ?? info.curve,
          encoding: request.encoding ?? info.encoding,
          hashType,
          omitPubkey: request.omitPubkey ?? info.omitPubkey,
        }

        return await this.executeSigning(finalRequest)
      }

      // Data incomplete, create multipart session
      const nextCode = this.generateNextCode()

      const session: MultipartSignSession = {
        schema: request.schema,
        curve: request.curve ?? info.curve,
        encoding: request.encoding ?? info.encoding,
        hashType: request.hashType ?? info.hashType,
        omitPubkey: request.omitPubkey ?? info.omitPubkey,
        path: (request.path && request.path.length > 0 ? request.path : info.path) as WalletPath,
        expectedLength: info.messageLength,
        collectedLength: info.messageChunk.length,
        messageChunks: [info.messageChunk],
        decoderChunks: info.remainingChunk.length ? [info.remainingChunk] : [],
        nextCode,
        ethMeta: info.ethMeta,
      }

      if (process.env.DEBUG_SIGNING === '1') {
        console.debug('[Simulator] Initialized multipart signing session', {
          nextCode: nextCode.toString('hex'),
          expectedLength: session.expectedLength,
          initialChunkLength: info.messageChunk.length,
          initialDecoderBytes: info.remainingChunk.length,
          schema: request.schema,
        })
      }

      this.multipartSignSessions.set(nextCode.toString('hex'), session)

      return createDeviceResponse<SignResponse>(true, LatticeResponseCode.success, {
        nextCode,
        schema: request.schema,
        omitPubkey: session.omitPubkey,
      })
    } catch (error) {
      console.error('[Simulator] Failed to process multipart signing request:', error)
      return createDeviceResponse<SignResponse>(
        false,
        LatticeResponseCode.invalidMsg,
        undefined,
        'Failed to process multipart signing request',
      )
    }
  }

  private async handleExtraDataSignRequest(
    request: SignRequest,
  ): Promise<DeviceResponse<SignResponse>> {
    const payload = request.rawPayload ?? request.data
    if (!payload || payload.length < 12) {
      return createDeviceResponse<SignResponse>(
        false,
        LatticeResponseCode.invalidMsg,
        undefined,
        'Invalid extra data payload',
      )
    }

    const providedNextCode = (request.nextCode ?? payload.slice(0, 8)) as Buffer
    const sessionKey = providedNextCode.toString('hex')
    const session = this.multipartSignSessions.get(sessionKey)

    if (!session) {
      console.warn('[Simulator] Received extra data for unknown session', sessionKey)
      return createDeviceResponse<SignResponse>(
        false,
        LatticeResponseCode.invalidMsg,
        undefined,
        'Unknown multipart signing session',
      )
    }

    this.multipartSignSessions.delete(sessionKey)

    let offset = 8
    const frameLength = payload.readUInt32LE(offset)
    offset += 4
    const frame = payload.slice(offset, offset + frameLength)

    const remaining = Math.max(session.expectedLength - session.collectedLength, 0)
    const messageChunk =
      remaining > 0 ? frame.slice(0, Math.min(frame.length, remaining)) : Buffer.alloc(0)

    if (process.env.DEBUG_SIGNING === '1') {
      console.debug('[Simulator] Processing extra data frame', {
        session: sessionKey,
        frameLength,
        messageChunkLength: messageChunk.length,
        decoderChunkLength: frame.length - messageChunk.length,
        collectedBefore: session.collectedLength,
        expectedLength: session.expectedLength,
        hasMoreFrames: request.hasExtraPayloads,
      })
    }

    if (messageChunk.length) {
      session.messageChunks.push(messageChunk)
      session.collectedLength += messageChunk.length
    }

    if (frame.length > messageChunk.length) {
      const decoderChunk = frame.slice(messageChunk.length)
      if (decoderChunk.length) {
        session.decoderChunks.push(decoderChunk)
      }
    }

    if (request.hasExtraPayloads) {
      const newNextCode = this.generateNextCode()
      session.nextCode = newNextCode
      this.multipartSignSessions.set(newNextCode.toString('hex'), session)

      if (process.env.DEBUG_SIGNING === '1') {
        console.debug('[Simulator] Awaiting additional payload frames', {
          session: sessionKey,
          nextCode: newNextCode.toString('hex'),
          collectedLength: session.collectedLength,
          expectedLength: session.expectedLength,
        })
      }

      return createDeviceResponse<SignResponse>(true, LatticeResponseCode.success, {
        nextCode: newNextCode,
        schema: session.schema,
        omitPubkey: session.omitPubkey,
      })
    }

    const message = Buffer.concat(session.messageChunks)
    const effectiveLength = session.expectedLength
      ? Math.min(session.expectedLength, message.length)
      : message.length
    const fullData = message.slice(0, effectiveLength)

    let signingPayload = fullData
    let hashType = session.hashType

    if (session.ethMeta) {
      signingPayload = Buffer.from(buildEthereumSigningPreimage(session.ethMeta, fullData))
      if (session.ethMeta.prehash) {
        hashType = EXTERNAL.SIGNING.HASHES.NONE
      }
    }

    if (process.env.DEBUG_SIGNING === '1') {
      console.debug('[Simulator] Finalizing multipart signing session', {
        session: sessionKey,
        collectedLength: session.collectedLength,
        expectedLength: session.expectedLength,
        messageToSignLength: signingPayload.length,
        decoderBytes: session.decoderChunks.reduce((sum, chunk) => sum + chunk.length, 0),
        messageKeccak: keccak256(signingPayload),
      })
    }

    const finalRequest: SignRequest = {
      data: signingPayload,
      path: session.path,
      schema: session.schema,
      curve: session.curve,
      encoding: session.encoding,
      hashType,
      omitPubkey: session.omitPubkey,
    }

    const response = await this.executeSigning(finalRequest)

    if (response.data) {
      response.data.schema = session.schema
      response.data.omitPubkey = session.omitPubkey
      response.data.path = session.path
    }

    return response
  }

  private async executeSigning(request: SignRequest): Promise<DeviceResponse<SignResponse>> {
    try {
      console.log('[Simulator] Using enhanced signing service for crypto signing')

      const signingRequest = {
        path: request.path,
        data: request.data,
        curve: request.curve,
        encoding: request.encoding,
        hashType: request.hashType,
        schema: request.schema,
        isTransaction: true,
        omitPubkey: request.omitPubkey,
        rawPayload: request.rawPayload,
      }

      if (!signingService.validateSigningRequest(signingRequest)) {
        return createDeviceResponse<SignResponse>(
          false,
          LatticeResponseCode.invalidMsg,
          undefined,
          'Invalid signing request parameters',
        )
      }

      if (!walletManager.isInitialized()) {
        console.warn('[Simulator] Wallet manager not initialized, initializing now...')
        await walletManager.initialize()
      }

      const walletAccounts = walletManager.getAllWalletAccounts()
      const signatureResult = await signingService.signData(signingRequest, walletAccounts)

      console.log('[Simulator] Enhanced signing completed:', {
        signatureFormat: signatureResult.format,
        signatureLength: signatureResult.signature.length,
        recovery: signatureResult.recovery,
        metadata: signatureResult.metadata,
      })

      const response: SignResponse = {
        signature: signatureResult.signature,
        recovery: signatureResult.recovery,
        metadata: signatureResult.metadata,
        schema: request.schema,
        omitPubkey: request.omitPubkey,
        curve: request.curve,
        encoding: request.encoding,
        hashType: request.hashType,
        path: request.path,
      }

      return createDeviceResponse(true, LatticeResponseCode.success, response)
    } catch (error) {
      console.error('[Simulator] Enhanced signing failed:', error)
      console.warn('[Simulator] Falling back to mock signing')
      const privateKey = this.derivePrivateKey(request.path)
      const mockSignature = this.mockSign(request.data, privateKey)

      const response: SignResponse = {
        signature: mockSignature,
        recovery: request.curve === EXTERNAL.SIGNING.CURVES.SECP256K1 ? 0 : undefined,
        metadata: {
          publicKey: undefined,
        },
        schema: request.schema,
        omitPubkey: request.omitPubkey,
        curve: request.curve,
        encoding: request.encoding,
        hashType: request.hashType,
        path: request.path,
      }

      return createDeviceResponse(true, LatticeResponseCode.success, response)
    }
  }

  /**
   * Exports the current wallet seed and mnemonic
   */
  async exportSeed(): Promise<
    DeviceResponse<{ seed: Buffer; wordIndices: number[]; numWords: number }>
  > {
    const config = await getWalletConfig()
    const seedBuffer = Buffer.from(config.seed)
    const seed =
      seedBuffer.length >= 64
        ? seedBuffer.slice(0, 64)
        : Buffer.concat([seedBuffer, Buffer.alloc(64 - seedBuffer.length)])

    const mnemonicWords = config.mnemonic.trim().split(/\s+/)
    const wordIndices = Array.from({ length: 24 }, (_, idx) => {
      const word = mnemonicWords[idx]
      if (!word) return 0
      const wordIndex = wordlist.indexOf(word)
      return wordIndex >= 0 ? wordIndex : 0
    })

    const numWords = mnemonicWords.length

    return createDeviceResponse(true, LatticeResponseCode.success, {
      seed,
      wordIndices,
      numWords,
    })
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
  async getKvRecords(params: { type: number; n: number; start: number }): Promise<
    DeviceResponse<{
      records: Array<{ id: number; type: number; caseSensitive: boolean; key: string; val: string }>
      total: number
      fetched: number
    }>
  > {
    await simulateDelay(150, 75)

    if (!this.isPaired) {
      return createDeviceResponse(false, LatticeResponseCode.pairFailed, {
        records: [],
        total: 0,
        fetched: 0,
      })
    }

    if (!supportsFeature(this.firmwareVersion, [0, 12, 0])) {
      return createDeviceResponse(false, LatticeResponseCode.unsupportedVersion, {
        records: [],
        total: 0,
        fetched: 0,
      })
    }

    const { type, n, start } = params

    // Validate parameters according to SDK expectations
    // According to validateGetKvRequest: n must be >= 1 and <= kvActionMaxNum
    const maxRecords = 10 // kvActionMaxNum from firmware constants (matches SDK)

    if (n < 1) {
      return createDeviceResponse(
        false,
        LatticeResponseCode.invalidMsg,
        { records: [], total: 0, fetched: 0 },
        'Must request at least one record',
      )
    }

    if (n > maxRecords) {
      return createDeviceResponse(
        false,
        LatticeResponseCode.invalidMsg,
        { records: [], total: 0, fetched: 0 },
        `Too many records requested: ${n}, max allowed: ${maxRecords}`,
      )
    }

    // Additional validation according to SDK's validateGetKvRequest
    if (type !== 0 && !type) {
      return createDeviceResponse(
        false,
        LatticeResponseCode.invalidMsg,
        { records: [], total: 0, fetched: 0 },
        'You must specify a type',
      )
    }

    if (start !== 0 && !start) {
      return createDeviceResponse(
        false,
        LatticeResponseCode.invalidMsg,
        { records: [], total: 0, fetched: 0 },
        'You must specify a start index',
      )
    }

    // Get all records of the specified type
    const allRecords = Object.entries(this.kvRecords)
      .filter(() => {
        // For now, we'll return all records regardless of type
        // In a real implementation, type would be used to filter records
        return true
      })
      .map(([key, value], index) => ({
        id: start + index,
        type: type,
        caseSensitive: false,
        key: key,
        val: value,
      }))

    // Apply pagination
    const total = allRecords.length

    // Validate start index
    if (start >= total) {
      return createDeviceResponse(true, LatticeResponseCode.success, {
        records: [],
        total,
        fetched: 0,
      })
    }

    const fetched = Math.min(n, total - start)
    const records = allRecords.slice(start, start + fetched)

    console.log(
      `[Simulator] getKvRecords: type=${type}, n=${n}, start=${start}, total=${total}, fetched=${fetched}`,
    )

    // Emit event for frontend clients
    try {
      emitKvRecordsFetched(this.deviceId, {
        records,
        total,
        fetched,
        type,
        start,
        n,
      })
    } catch (error) {
      console.error('[Simulator] Failed to emit kv_records_fetched event:', error)
    }

    return createDeviceResponse(true, LatticeResponseCode.success, {
      records,
      total,
      fetched,
    })
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
      return createDeviceResponse(false, LatticeResponseCode.pairFailed, undefined)
    }

    if (!supportsFeature(this.firmwareVersion, [0, 12, 0])) {
      return createDeviceResponse(false, LatticeResponseCode.unsupportedVersion, undefined)
    }

    if (this.isLocked) {
      return createDeviceResponse(false, LatticeResponseCode.deviceLocked, undefined)
    }

    // Validate records according to SDK requirements
    const recordCount = Object.keys(records).length

    if (recordCount < 1) {
      return createDeviceResponse(
        false,
        LatticeResponseCode.invalidMsg,
        undefined,
        'Must provide at least one record',
      )
    }

    if (recordCount > 10) {
      // kvActionMaxNum from firmware constants (matches SDK)
      return createDeviceResponse(
        false,
        LatticeResponseCode.invalidMsg,
        undefined,
        `Too many records: ${recordCount}, max allowed: 10`,
      )
    }

    // Validate individual records
    for (const [key, value] of Object.entries(records)) {
      if (key.length > 63 || value.length > 63) {
        return createDeviceResponse(
          false,
          LatticeResponseCode.invalidMsg,
          undefined,
          'Key or value too long',
        )
      }

      if (this.kvRecords[key]) {
        return createDeviceResponse(
          false,
          LatticeResponseCode.already,
          undefined,
          `Record ${key} already exists`,
        )
      }
    }

    // Assign stable IDs to new records
    for (const [key] of Object.entries(records)) {
      const recordId = this.nextKvRecordId++
      this.kvRecordIdToKey.set(recordId, key)
      console.log(`[Simulator] addKvRecords: Assigned ID ${recordId} to key "${key}"`)
    }

    // Add records
    Object.assign(this.kvRecords, records)

    console.log(`[Simulator] addKvRecords: Added ${recordCount} records successfully`)
    console.log('[Simulator] Records added:', Object.keys(records))

    // Emit event for frontend clients
    try {
      emitKvRecordsAdded(this.deviceId, {
        records: Object.entries(records).map(([key, value]) => ({ key, value })),
        count: recordCount,
      })
    } catch (error) {
      console.error('[Simulator] Failed to emit kv_records_added event:', error)
    }

    return createDeviceResponse(true, LatticeResponseCode.success)
  }

  /**
   * Handles request to remove key-value records
   *
   * Removes stored key-value pairs from the device by ID. Silently succeeds
   * for IDs that don't exist.
   *
   * @param type - Type of records to remove (0 for all, 1 for specific type)
   * @param ids - Array of record IDs to remove
   * @returns Promise resolving to success status
   * @throws {DeviceResponse} When device is not paired, locked, or feature unsupported
   */
  async removeKvRecords(type: number, ids: number[]): Promise<DeviceResponse<void>> {
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

    // Remove records by ID
    const removedRecords: Array<{ id: number; key: string }> = []

    for (const id of ids) {
      const key = this.kvRecordIdToKey.get(id)
      if (key) {
        console.log(`[Simulator] removeKvRecords: Removing record ID ${id} with key "${key}"`)
        delete this.kvRecords[key]
        this.kvRecordIdToKey.delete(id)
        removedRecords.push({ id, key })
      } else {
        console.log(`[Simulator] removeKvRecords: Record ID ${id} not found`)
      }
    }

    // Emit event for frontend clients
    if (removedRecords.length > 0) {
      try {
        emitKvRecordsRemoved(this.deviceId, {
          removedRecords,
          count: removedRecords.length,
          type,
        })
      } catch (error) {
        console.error('[Simulator] Failed to emit kv_records_removed event:', error)
      }
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
  private async simulateUserApproval(): Promise<boolean> {
    this.userApprovalRequired = true

    // For testing/demo purposes, auto-approve after a delay
    await simulateDelay(2000, 1000)

    this.userApprovalRequired = false

    // Simulate 90% approval rate for demo
    return Math.random() > 0.1
  }

  /**
   * Generates deterministic mock addresses without crypto operations
   *
   * Creates simple deterministic addresses based on path and coin type
   * that don't require crypto functions that fail on the server side.
   *
   * @param startPath - Starting BIP-44 derivation path
   * @param count - Number of addresses to generate
   * @param coinType - Cryptocurrency type
   * @returns Array of mock address info
   * @private
   */
  private generateDeterministicMockAddresses(
    startPath: WalletPath,
    count: number,
    coinType: string,
  ): Array<{ path: number[]; address: string; publicKey: Buffer; index: number }> {
    const addresses = []

    for (let i = 0; i < count; i++) {
      const index = startPath[4] + i
      const fullPath = [...startPath.slice(0, -1), index]

      // Generate deterministic mock addresses based on path and coin type
      let address: string
      const pathStr = fullPath.join('/')
      const seed = `${this.deviceId}-${pathStr}-${coinType}`

      // Simple deterministic address generation
      switch (coinType) {
        case 'ETH':
          // Generate a deterministic Ethereum address
          const ethHash = this.simpleHash(seed) % 0xfffffffffffff // 20 bytes
          address = '0x' + ethHash.toString(16).padStart(40, '0')
          break
        case 'BTC':
          // Generate a deterministic Bitcoin address
          const btcHash = this.simpleHash(seed + 'btc')
          address = 'bc1q' + btcHash.toString(36).substring(0, 32).padEnd(32, '0')
          break
        case 'SOL':
          // Generate a deterministic Solana address
          const solHash = this.simpleHash(seed + 'sol')
          address = solHash.toString(16).padStart(44, '0').substring(0, 44)
          break
        default:
          address = `mock_${coinType.toLowerCase()}_${index}_${this.deviceId.substring(0, 8)}`
      }

      // Generate mock public key (32 bytes)
      const pubKeyHash = this.simpleHash(seed + 'pubkey')
      const publicKey = Buffer.alloc(65)
      publicKey[0] = 0x04 // Uncompressed key prefix
      publicKey.writeUInt32BE(pubKeyHash, 1)
      publicKey.writeUInt32BE(pubKeyHash >> 32, 5)

      addresses.push({
        path: fullPath,
        address,
        publicKey,
        index,
      })
    }

    return addresses
  }

  /**
   * Simple hash function for deterministic mock address generation
   * @private
   */
  private simpleHash(str: string): number {
    let hash = 0
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i)
      hash = (hash << 5) - hash + char
      hash = hash & hash // Convert to 32-bit integer
    }
    return Math.abs(hash)
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
    Buffer.from(pathString + (this.pairingCode || 'default')) // Use path for derivation
    return randomBytes(32) // Mock private key
  }

  /**
   * Generates mock signature (fallback)
   *
   * Creates a deterministic signature for simulation purposes when
   * enhanced signing fails.
   *
   * @param data - Data to sign
   * @param privateKey - Private key for signing
   * @returns 64-byte signature buffer
   * @private
   */
  private mockSign(data: Buffer, privateKey: Buffer): Buffer {
    const hash = createHash('sha256')
      .update(Buffer.concat([data, privateKey]))
      .digest()

    // Return a 64-byte signature (32 bytes r + 32 bytes s)
    return Buffer.concat([hash, createHash('sha256').update(hash).digest()])
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
   * Gets the current ephemeral key pair used for encrypted messaging
   */
  getEphemeralKeyPair(): { publicKey: Buffer; privateKey: Buffer } | undefined {
    return this.ephemeralKeyPair
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
      console.log(
        '[Simulator] Our private key (hex):',
        this.ephemeralKeyPair.privateKey.toString('hex'),
      )

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
   * Sets the pairing status
   *
   * @param paired - Whether the device is paired
   */
  setIsPaired(paired: boolean): void {
    this.isPaired = paired
    console.log('[Simulator] Set isPaired to:', paired)
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
   * Sets the device info
   *
   * @param deviceInfo - Device information to set
   */
  setDeviceInfo(deviceInfo: any): void {
    if (deviceInfo.deviceId) this.deviceId = deviceInfo.deviceId
    if (deviceInfo.firmwareVersion) {
      // Ensure firmwareVersion is a Buffer (handle case where it's serialized as Array)
      this.firmwareVersion = Buffer.isBuffer(deviceInfo.firmwareVersion)
        ? deviceInfo.firmwareVersion
        : Buffer.from(deviceInfo.firmwareVersion)
    }
    if (deviceInfo.isLocked !== undefined) this.isLocked = deviceInfo.isLocked
    console.log('[Simulator] Set device info:', deviceInfo)
  }

  /**
   * Sets the active wallets
   *
   * @param wallets - Active wallets to set (UIDs should be hex strings, names should be strings)
   */
  setActiveWallets(wallets: ActiveWallets): void {
    this.activeWallets = wallets
    console.log('[Simulator] Set active wallets:', wallets)
  }

  /**
   * Unpairs the device from any connected clients
   *
   * Clears pairing status, secrets, and ephemeral keys.
   */
  unpair(): void {
    this.isPaired = false
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
    this.ephemeralKeyPair = undefined
    this.isPairingMode = false
    this.pairingCode = '12345678'
    this.pairingStartTime = undefined
    this.pairingTimeoutId = undefined
    this.kvRecords = {}
    this.nextKvRecordId = 0
    this.kvRecordIdToKey.clear()
    this.userApprovalRequired = false
  }

  /**
   * Sets KV records directly (for state synchronization)
   *
   * This method is used to restore KV records from client state
   * during server startup or state synchronization.
   *
   * @param records - Map of key-value records to set
   */
  setKvRecordsDirectly(records: Record<string, string>): void {
    console.log('[Simulator] Setting KV records directly:', Object.keys(records))
    this.kvRecords = { ...records }

    // Update the next ID counter to avoid conflicts
    this.nextKvRecordId = Object.keys(records).length

    // Rebuild the ID to key mapping
    this.kvRecordIdToKey.clear()
    Object.keys(records).forEach((key, index) => {
      this.kvRecordIdToKey.set(index, key)
    })

    console.log(
      '[Simulator] KV records set successfully, count:',
      Object.keys(this.kvRecords).length,
    )
  }

  /**
   * Enters pairing mode with a 6-digit code for 60 seconds
   */
  enterPairingMode(): void {
    if (this.isPairingMode) {
      console.log('[Simulator] Already in pairing mode')
      return
    }

    this.isPairingMode = true
    this.pairingStartTime = Date.now()

    console.log('[Simulator] Entered pairing mode with code:', this.pairingCode)
    console.log('[Simulator] Pairing mode will timeout in 60 seconds')

    // Emit pairing mode started event (fire-and-forget)
    emitPairingModeStarted(
      this.deviceId,
      this.pairingCode,
      this.pairingTimeoutMs,
      this.pairingStartTime,
    )

    // Set up timeout to exit pairing mode after 60 seconds
    this.pairingTimeoutId = setTimeout(() => {
      if (this.isPairingMode && this.pairingStartTime) {
        const elapsed = Date.now() - this.pairingStartTime
        if (elapsed >= this.pairingTimeoutMs) {
          console.log('[Simulator] Pairing mode timed out after 60 seconds')
          this.exitPairingMode()
        }
      }
    }, this.pairingTimeoutMs)
  }

  /**
   * Exits pairing mode
   */
  exitPairingMode(): void {
    if (!this.isPairingMode) {
      console.log('[Simulator] Not in pairing mode')
      return
    }

    console.log('[Simulator] exitPairingMode called')

    // Clear the pairing timeout if it exists
    if (this.pairingTimeoutId) {
      clearTimeout(this.pairingTimeoutId)
      console.log('[Simulator] Cleared pairing mode timeout')
    }

    // Reset pairing mode state
    this.isPairingMode = false
    this.pairingCode = '12345678'
    this.pairingStartTime = undefined
    this.pairingTimeoutId = undefined

    // Emit pairing mode ended event (fire-and-forget)
    emitPairingModeEnded(this.deviceId)

    console.log('[Simulator] exitPairingMode completed')
  }

  /**
   * Validates a pairing code
   */
  validatePairingCode(code: string): boolean {
    return this.isPairingMode && this.pairingCode === code
  }

  /**
   * Creates a signing request for user approval
   *
   * Converts a raw sign request into a structured signing request
   * that will be displayed to the user for approval.
   *
   * @param request - Raw signing request from protocol
   * @returns Promise resolving to pending signing request
   * @private
   */
  private async createSigningRequest(request: SignRequest): Promise<SigningRequest> {
    // Detect coin type and transaction type
    const coinType = detectCoinTypeFromPath(request.path)
    const transactionType = request.schema === 1 ? 'message' : 'transaction' // Simplified detection

    // Generate unique ID for this request
    const requestId = `sign_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`

    // Extract metadata for display (this would be enhanced in a real implementation)
    const metadata = await this.extractTransactionMetadata(request, coinType as any)

    const signingRequest: SigningRequest = {
      id: requestId,
      type: 'SIGN',
      timestamp: Date.now(),
      timeoutMs: 300000, // 5 minutes timeout
      data: {
        path: request.path,
        data: request.data,
        curve: request.curve,
        encoding: request.encoding,
        hashType: request.hashType,
        schema: request.schema,
        coinType: coinType as any,
        transactionType,
      },
      metadata,
    }

    // Store the pending request
    this.pendingSigningRequests.set(requestId, signingRequest)

    console.log(`[Simulator] Created signing request: ${requestId}`)
    console.log(`[Simulator] Coin: ${coinType}, Type: ${transactionType}`)

    // Emit event to notify clients about the new signing request
    try {
      emitSigningRequestCreated(this.deviceId, signingRequest)
    } catch (error) {
      console.error('[Simulator] Failed to emit signing_request_created event:', error)
    }

    return signingRequest
  }

  /**
   * Extracts transaction metadata for display
   *
   * Analyzes the transaction data to extract human-readable information
   * like addresses, amounts, and transaction purpose.
   *
   * @param request - Raw signing request
   * @param coinType - Detected cryptocurrency type
   * @returns Promise resolving to metadata object
   * @private
   */
  private async extractTransactionMetadata(
    request: SignRequest,
    coinType: 'ETH' | 'BTC' | 'SOL',
  ): Promise<SigningRequest['metadata']> {
    // This is a simplified implementation
    // In a real implementation, you would parse the transaction data
    // to extract addresses, amounts, gas prices, etc.

    const metadata: SigningRequest['metadata'] = {
      description: `${coinType} ${request.schema === 1 ? 'message' : 'transaction'} signing`,
    }

    // For Ethereum, we might parse transaction fields
    if (coinType === 'ETH') {
      metadata.tokenSymbol = 'ETH'
      // Could parse RLP-encoded transaction to get to/from/value
      // For now, just add placeholder metadata
      metadata.description = request.schema === 1 ? 'Sign message' : 'Send ETH transaction'
    }

    // For Bitcoin, we might parse transaction inputs/outputs
    if (coinType === 'BTC') {
      metadata.tokenSymbol = 'BTC'
      metadata.description = 'Send BTC transaction'
    }

    // For Solana, we might parse instruction data
    if (coinType === 'SOL') {
      metadata.tokenSymbol = 'SOL'
      metadata.description = 'Sign Solana transaction'
    }

    return metadata
  }

  /**
   * Approves a pending signing request
   *
   * Performs the actual cryptographic signing for an approved request
   * and returns the signature to the client.
   *
   * @param requestId - ID of the request to approve
   * @returns Promise resolving to signature response
   */
  async approveSigningRequest(requestId: string): Promise<DeviceResponse<SignResponse>> {
    const signingRequest = this.pendingSigningRequests.get(requestId)

    if (!signingRequest) {
      return createDeviceResponse<SignResponse>(
        false,
        LatticeResponseCode.invalidMsg,
        undefined,
        'Signing request not found',
      )
    }

    try {
      // Use enhanced signing service for real cryptographic signatures
      console.log(`[Simulator] Approving signing request: ${requestId}`)

      // Prepare signing request for service
      const serviceRequest = {
        path: signingRequest.data.path,
        data: signingRequest.data.data,
        curve: signingRequest.data.curve,
        encoding: signingRequest.data.encoding,
        hashType: signingRequest.data.hashType,
        schema: signingRequest.data.schema,
        isTransaction: signingRequest.data.transactionType === 'transaction',
      }

      // Validate signing request
      if (!signingService.validateSigningRequest(serviceRequest)) {
        return createDeviceResponse<SignResponse>(
          false,
          LatticeResponseCode.invalidMsg,
          undefined,
          'Invalid signing request parameters',
        )
      }

      // Ensure wallet manager is initialized
      if (!walletManager.isInitialized()) {
        console.warn('[Simulator] Wallet manager not initialized, initializing now...')
        await walletManager.initialize()
      }

      // Get wallet accounts for signing
      const walletAccounts = walletManager.getAllWalletAccounts()

      // Sign the data
      const signatureResult = await signingService.signData(serviceRequest, walletAccounts)

      console.log(`[Simulator] Enhanced signing completed for request ${requestId}:`, {
        signatureFormat: signatureResult.format,
        signatureLength: signatureResult.signature.length,
        signature: signatureResult.signature.toString('hex'),
        recovery: signatureResult.recovery,
        metadata: signatureResult.metadata,
      })

      // Remove from pending requests
      this.pendingSigningRequests.delete(requestId)

      const response: SignResponse = {
        signature: signatureResult.signature,
        recovery: signatureResult.recovery,
        metadata: signatureResult.metadata,
      }

      const deviceResponse = createDeviceResponse(true, LatticeResponseCode.success, response)

      // Resolve the waiting promise if it exists
      const promiseResolver = this.pendingSigningPromises.get(requestId)
      if (promiseResolver) {
        this.pendingSigningPromises.delete(requestId)
        promiseResolver.resolve(deviceResponse)
      }

      // Emit completion event
      try {
        emitSigningRequestCompleted(this.deviceId, {
          requestId,
          status: 'approved',
          response: deviceResponse,
        })
      } catch (error) {
        console.error('[Simulator] Failed to emit signing_request_completed event:', error)
      }

      return deviceResponse
    } catch (error) {
      console.error(`[Simulator] Enhanced signing failed for request ${requestId}:`, error)

      // Remove from pending requests even on error
      this.pendingSigningRequests.delete(requestId)

      return createDeviceResponse<SignResponse>(
        false,
        LatticeResponseCode.invalidMsg,
        undefined,
        'Signing failed: ' + (error as Error).message,
      )
    }
  }

  /**
   * Rejects a pending signing request
   *
   * Removes the request from pending queue and returns rejection response.
   *
   * @param requestId - ID of the request to reject
   * @returns Promise resolving to rejection response
   */
  async rejectSigningRequest(requestId: string): Promise<DeviceResponse<null>> {
    const signingRequest = this.pendingSigningRequests.get(requestId)

    if (!signingRequest) {
      return createDeviceResponse<null>(
        false,
        LatticeResponseCode.invalidMsg,
        null,
        'Signing request not found',
      )
    }

    console.log(`[Simulator] Rejecting signing request: ${requestId}`)

    // Remove from pending requests
    this.pendingSigningRequests.delete(requestId)

    const deviceResponse = createDeviceResponse<SignResponse>(
      false,
      LatticeResponseCode.userDeclined,
      undefined,
      'User rejected transaction',
    )

    // Resolve the waiting promise if it exists
    const promiseResolver = this.pendingSigningPromises.get(requestId)
    if (promiseResolver) {
      this.pendingSigningPromises.delete(requestId)
      promiseResolver.resolve(deviceResponse)
    }

    // Emit completion event
    try {
      emitSigningRequestCompleted(this.deviceId, {
        requestId,
        status: 'rejected',
        response: deviceResponse,
      })
    } catch (error) {
      console.error('[Simulator] Failed to emit signing_request_completed event:', error)
    }

    return createDeviceResponse(
      false,
      LatticeResponseCode.userDeclined,
      null,
      'User rejected transaction',
    )
  }

  /**
   * Gets all pending signing requests
   *
   * @returns Array of pending signing requests
   */
  getPendingSigningRequests(): SigningRequest[] {
    return Array.from(this.pendingSigningRequests.values())
  }

  /**
   * Generates app secret hash (same as SDK's generateAppSecret)
   *
   * @param publicKey - Public key buffer
   * @param appName - App name buffer (25 bytes)
   * @param pairingCode - Pairing code buffer
   * @returns Hash buffer
   */
  private generateAppSecret(publicKey: Buffer, appName: Buffer, pairingCode: Buffer): Buffer {
    // Create the pre-image by concatenating: publicKey + appName + pairingCode
    const preImage = Buffer.concat([publicKey, appName, pairingCode])

    // Hash the pre-image using SHA-256
    const hash = createHash('sha256').update(preImage).digest()

    return hash
  }

  /**
   * Verifies DER signature against hash and public key
   *
   * @param derSignature - DER-encoded signature
   * @param hash - Hash that was signed
   * @param publicKey - Public key for verification
   * @returns True if signature is valid
   */
  private verifySignature(derSignature: Buffer, hash: Buffer, publicKey: Buffer): boolean {
    try {
      // 1. Parse DER signature to get r, s values
      const { r, s } = this.parseDERSignature(derSignature)

      // 2. Create elliptic curve instance
      const ec = new elliptic.ec('p256')

      // 3. Create key pair from public key
      const keyPair = ec.keyFromPublic(publicKey)

      // 4. Verify the signature
      const isValid = keyPair.verify(hash, { r, s })

      return isValid
    } catch (error) {
      console.error('[Simulator] Signature verification error:', error)
      return false
    }
  }
}
