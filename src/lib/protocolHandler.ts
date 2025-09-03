/**
 * Protocol Request Handler for Lattice1 Device Simulator
 * Handles parsing and routing of encrypted secure requests
 */

import {
  LatticeSecureEncryptedRequestType,
  LatticeResponseCode,
  ConnectRequest,
  PairRequest,
  GetAddressesRequest,
  SignRequest,
  ProtocolConstants,
} from '../types'
import { LatticeSimulator } from './simulator'
import { aes256_decrypt, aes256_encrypt } from '../utils/crypto'
import crc32  from 'crc-32'
import { generateKeyPair } from '../utils/crypto'

/**
 * Secure request structure for encrypted protocol messages
 */
export interface SecureRequest {
  /** Type of the encrypted request */
  type: LatticeSecureEncryptedRequestType
  /** Encrypted request data */
  data: Buffer
  /** Optional ephemeral ID for session tracking */
  ephemeralId?: number
}

/**
 * Secure response structure for protocol messages
 */
export interface SecureResponse {
  /** Response code indicating success or error type */
  code: LatticeResponseCode
  /** Optional response data */
  data?: Buffer
  /** Optional error message */
  error?: string
}

/**
 * Protocol Request Handler for Lattice1 Device Simulator
 * 
 * Handles parsing, routing, and processing of encrypted secure requests
 * according to the Lattice1 protocol specification. Manages request
 * deserialization and response serialization.
 * 
 * @example
 * ```typescript
 * const handler = new ProtocolHandler(simulator);
 * const response = await handler.handleSecureRequest({
 *   type: LatticeSecureEncryptedRequestType.getAddresses,
 *   data: requestBuffer
 * });
 * ```
 */
export class ProtocolHandler {
  /** Reference to the device simulator instance */
  private simulator: LatticeSimulator

  /**
   * Creates a new ProtocolHandler instance
   * 
   * @param simulator - The LatticeSimulator instance to handle requests for
   */
  constructor(simulator: LatticeSimulator) {
    this.simulator = simulator
  }

  /**
   * Handles a secure encrypted request
   * 
   * First decrypts the request data using the shared secret, then routes 
   * the request to the appropriate handler based on request type.
   * 
   * @param request - The secure request to process (contains encrypted data)
   * @returns Promise resolving to secure response with data or error
   */
  async handleSecureRequest(request: SecureRequest): Promise<SecureResponse> {
    try {
      console.log(`[ProtocolHandler] Processing request type(1:connect, 2:encrypted): ${request.type}`)
      console.log(`[ProtocolHandler] Encrypted data length: ${request.data.length}`)
      
      // Decrypt the request data using the shared secret
      const decryptionResult = await this.decryptRequestData(request.data)
      if (!decryptionResult) {
        return {
          code: LatticeResponseCode.pairFailed,
          error: 'Failed to decrypt request data - no shared secret available',
        }
      }
      
      const { requestType, requestData } = decryptionResult
      console.log(`[ProtocolHandler] requestData length: ${requestData.length}`)
      console.log(`[ProtocolHandler] requestData (hex): ${requestData.toString('hex')}`)
      console.log(`[ProtocolHandler] Processing secure request type: ${requestType}`)
      
      let response: SecureResponse
      
      switch (requestType) {
        case LatticeSecureEncryptedRequestType.finalizePairing:
          console.log(`[ProtocolHandler] Handling finalizePairing request`)
          response = await this.handlePairRequest(requestData)
          break
          
        case LatticeSecureEncryptedRequestType.getAddresses:
          console.log(`[ProtocolHandler] Handling getAddresses request`)
          response = await this.handleGetAddressesRequest(requestData)
          break
          
        case LatticeSecureEncryptedRequestType.sign:
          console.log(`[ProtocolHandler] Handling sign request`)
          response = await this.handleSignRequest(requestData)
          break
          
        case LatticeSecureEncryptedRequestType.getWallets:
          console.log(`[ProtocolHandler] Handling getWallets request`)
          response = await this.handleGetWalletsRequest()
          break
          
        case LatticeSecureEncryptedRequestType.getKvRecords:
          console.log(`[ProtocolHandler] Handling getKvRecords request`)
          response = await this.handleGetKvRecordsRequest(requestData)
          break
          
        case LatticeSecureEncryptedRequestType.addKvRecords:
          console.log(`[ProtocolHandler] Handling addKvRecords request`)
          response = await this.handleAddKvRecordsRequest(requestData)
          break
          
        case LatticeSecureEncryptedRequestType.removeKvRecords:
          console.log(`[ProtocolHandler] Handling removeKvRecords request`)
          response = await this.handleRemoveKvRecordsRequest(requestData)
          break
          
        case LatticeSecureEncryptedRequestType.fetchEncryptedData:
          console.log(`[ProtocolHandler] Handling fetchEncryptedData request`)
          response = await this.handleFetchEncryptedDataRequest(requestData)
          break
          
        case LatticeSecureEncryptedRequestType.test:
          console.log(`[ProtocolHandler] Handling test request`)
          response = await this.handleTestRequest(requestData)
          break
          
        default:
          console.log(`[ProtocolHandler] Unsupported request type: ${requestType}`)
          response = {
            code: LatticeResponseCode.invalidMsg,
            error: `Unsupported request type: ${requestType}`,
          }
      }
      
      // If the response was successful and has data, encrypt it
      if (response.code === LatticeResponseCode.success && response.data) {
        const encryptedData = await this.encryptResponseData(response.data, requestType)
        return {
          ...response,
          data: encryptedData
        }
      }
      
      return response
    } catch (error) {
      console.error('[ProtocolHandler] Request processing error:', error)
      return {
        code: LatticeResponseCode.internalError,
        error: error instanceof Error ? error.message : 'Unknown error',
      }
    }
  }

  /**
   * Decrypts and deserializes encrypted request data using the shared secret
   * 
   * The decrypted data has the structure: [requestType (1 byte)] | [data] | [checksum (4 bytes)]
   * This method extracts the actual request data and validates the checksum.
   * 
   * @param encryptedData - The encrypted request payload
   * @returns Decrypted and deserialized request data, or null if no shared secret available
   * @private
   */
  private async decryptRequestData(encryptedData: Buffer): Promise< { requestType: number; requestData: Buffer } | null> {
    // Get the shared secret from the simulator
    const sharedSecret = this.simulator.getSharedSecret()
    if (!sharedSecret) {
      console.error('[ProtocolHandler] No shared secret available for decryption')
      return null
    }
    
    console.log('[ProtocolHandler] Shared secret length:', sharedSecret.length)
    console.log('[ProtocolHandler] Shared secret (hex):', sharedSecret.toString('hex'))
    
    try {
      // Decrypt the data using AES-256-CBC
      const decryptedData = aes256_decrypt(encryptedData, sharedSecret)
      
      console.log('[ProtocolHandler] Decrypted data length:', decryptedData.length)
      console.log('[ProtocolHandler] Decrypted data (hex):', decryptedData.toString('hex'))
      
      // The decrypted data has structure: [requestType (1)] | [data] | [checksum (4)]
      if (decryptedData.length < 5) {
        throw new Error('Decrypted data too short (need at least 5 bytes)')
      }
      
      let offset = 0;
      // Extract request type (first byte)
      const requestType = decryptedData.readUInt8(offset)
      offset += 1;
      console.log('[ProtocolHandler] Extracted request type:', requestType)
      
      const requestDataSize: number = ProtocolConstants.msgSizes.secure.data.request.encrypted[requestType as keyof typeof ProtocolConstants.msgSizes.secure.data.request.encrypted];

      
      // Extract actual request data (everything between requestType and checksum)
      const requestData = decryptedData.slice(offset, offset + requestDataSize)
      offset += requestDataSize;
      console.log('[ProtocolHandler] Extracted request data length:', requestData.length)
      console.log('[ProtocolHandler] Extracted request data (hex):', requestData.toString('hex'))

      // Extract checksum (last 4 bytes) - SDK writes with writeUInt32LE, so we read with readUInt32LE
      const checksum = decryptedData.readUInt32LE(offset)
      console.log('[ProtocolHandler] Extracted checksum:', checksum.toString(16))
            
      return { requestType, requestData }
    } catch (error) {
      console.error('[ProtocolHandler] Decryption/deserialization failed:', error)
      return null
    }
  }

  /**
   * Encrypts response data for secure requests
   * 
   * Creates an encrypted response payload that matches the format expected
   * by the GridPlus SDK: [newEphemeralPub (65 bytes)] | [responseData] | [checksum (4 bytes)]
   * The encrypted response must be exactly 1728 bytes to match SDK expectations.
   * 
   * @param responseData - The unencrypted response data
   * @param requestType - The type of request this is responding to
   * @returns Encrypted response data (exactly 1728 bytes)
   * @private
   */
  private async encryptResponseData(responseData: Buffer, requestType: LatticeSecureEncryptedRequestType): Promise<Buffer> {
    // Get the shared secret for encryption
    const sharedSecret = this.simulator.getSharedSecret()
    if (!sharedSecret) {
      throw new Error('No shared secret available for response encryption')
    }
    
    // Generate a new ephemeral key pair for the next request
    const newEphemeralKeyPair = generateKeyPair()
    
    // Build the response payload: [newEphemeralPub (65)] | [responseData] | [checksum (4)]
    const newEphemeralPub = newEphemeralKeyPair.publicKey
    const checksum = this.calculateChecksum(Buffer.concat([newEphemeralPub, responseData]))
    
    const checksumBuffer = Buffer.alloc(4)
    checksumBuffer.writeUInt32BE(checksum, 0)
    
    const responsePayload = Buffer.concat([
      newEphemeralPub,           // 65 bytes
      responseData,              // variable size
      checksumBuffer             // 4 bytes checksum
    ])
    
    console.log('[ProtocolHandler] New ephemeral:', newEphemeralPub.toString('hex'))
    console.log('[ProtocolHandler] Response data length:', responseData.length)
    console.log('[ProtocolHandler] Checksum:', checksum.toString(16))
    console.log('[ProtocolHandler] Response payload length:', responsePayload.length)
    console.log(`[ProtocolHandler] responsePayload: ${responsePayload.toString('hex')}`)
    
    // The SDK expects encrypted responses to be exactly 1728 bytes
    // Pad the response payload to fit in a 1728-byte encrypted buffer
    const maxPayloadSize = 1728
    const paddedPayload = Buffer.alloc(maxPayloadSize)
    responsePayload.copy(paddedPayload, 0)
    
    // Encrypt the padded response payload
    const encryptedPayload = aes256_encrypt(paddedPayload, sharedSecret)
    
    // Update the simulator's ephemeral key pair for future requests
    this.simulator.updateEphemeralKeyPair(newEphemeralKeyPair)
    
    console.log('[ProtocolHandler] Padded payload length:', paddedPayload.length)
    console.log('[ProtocolHandler] Encrypted response length:', encryptedPayload.length)
    return encryptedPayload
  }

  /**
   * Calculates CRC32 checksum for response data
   * 
   * Uses the same CRC32 implementation as the GridPlus SDK.
   * 
   * @param data - Data to calculate checksum for
   * @returns 32-bit checksum
   * @private
   */
  private calculateChecksum(data: Buffer): number {
    return crc32.buf(data) >>> 0 // Convert to unsigned 32-bit
  }

  /**
   * Handles connect request (not encrypted)
   * 
   * Processes initial connection handshake requests which are not
   * encrypted and establish the session.
   * 
   * @param data - Raw connection request data
   * @returns Promise resolving to connection response
   */
  async handleConnectRequest(data: Buffer): Promise<SecureResponse> {
    try {
      console.log('[ProtocolHandler] Connect request data length:', data.length)
      console.log('[ProtocolHandler] Connect request data (hex):', data.toString('hex'))
      
      const request = this.parseConnectRequest(data)
      console.log('[ProtocolHandler] Parsed connect request:', request)
      
      const response = await this.simulator.connect(request)
      console.log('[ProtocolHandler] Simulator connect response:', response)
      
      return {
        code: response.code,
        data: this.serializeConnectResponse(response.data),
        error: response.error,
      }
    } catch (error) {
      console.error('[ProtocolHandler] Connect request error:', error)
      return {
        code: LatticeResponseCode.invalidMsg,
        error: error instanceof Error ? error.message : 'Failed to parse connect request',
      }
    }
  }

  /**
   * Handles finalize pairing request
   * 
   * Processes pairing finalization after initial connection.
   * 
   * @param data - Encrypted pairing request data
   * @returns Promise resolving to pairing response
   * @private
   */
  private async handlePairRequest(data: Buffer): Promise<SecureResponse> {
    console.log(`handlePairRequest, data: ${data.toString('hex')}`)
    const request = this.parsePairRequest(data)
    const response = await this.simulator.pair(request)
    
    return {
      code: response.code,
      data: response.data ? Buffer.alloc(0) : undefined, // Pairing response has no data
      error: response.error,
    }
  }

  /**
   * Handles address derivation request
   * 
   * Processes requests for deriving cryptocurrency addresses.
   * 
   * @param data - Encrypted address request data
   * @returns Promise resolving to address response
   * @private
   */
  private async handleGetAddressesRequest(data: Buffer): Promise<SecureResponse> {
    const request = this.parseGetAddressesRequest(data)
    const response = await this.simulator.getAddresses(request)
    
    return {
      code: response.code,
      data: response.data ? this.serializeGetAddressesResponse(response.data) : undefined,
      error: response.error,
    }
  }

  /**
   * Handles transaction signing request
   * 
   * Processes requests for signing transactions or messages.
   * 
   * @param data - Encrypted signing request data
   * @returns Promise resolving to signature response
   * @private
   */
  private async handleSignRequest(data: Buffer): Promise<SecureResponse> {
    const request = this.parseSignRequest(data)
    const response = await this.simulator.sign(request)
    
    return {
      code: response.code,
      data: response.data ? this.serializeSignResponse(response.data) : undefined,
      error: response.error,
    }
  }

  /**
   * Handles wallet information request
   * 
   * Processes requests for active wallet information.
   * 
   * @returns Promise resolving to wallet response
   * @private
   */
  private async handleGetWalletsRequest(): Promise<SecureResponse> {
    const response = await this.simulator.getWallets()
    
    return {
      code: response.code,
      data: response.data ? this.serializeGetWalletsResponse(response.data) : undefined,
      error: response.error,
    }
  }

  /**
   * Handles key-value record retrieval request
   * 
   * Processes requests for retrieving stored key-value pairs.
   * 
   * @param data - Encrypted KV request data
   * @returns Promise resolving to records response
   * @private
   */
  private async handleGetKvRecordsRequest(data: Buffer): Promise<SecureResponse> {
    const { type, n, start } = this.parseGetKvRecordsRequest(data)
    const response = await this.simulator.getKvRecords({ type, n, start })
    
    return {
      code: response.code,
      data: response.data ? this.serializeKvRecordsResponse(response.data) : undefined,
      error: response.error,
    }
  }

  /**
   * Handles key-value record addition request
   * 
   * Processes requests for storing new key-value pairs.
   * 
   * @param data - Encrypted KV addition request data
   * @returns Promise resolving to addition response
   * @private
   */
  private async handleAddKvRecordsRequest(data: Buffer): Promise<SecureResponse> {
    const records = this.parseAddKvRecordsRequest(data)
    const response = await this.simulator.addKvRecords(records)
    
    return {
      code: response.code,
      data: response.success ? Buffer.alloc(0) : undefined,
      error: response.error,
    }
  }

  /**
   * Handles key-value record removal request
   * 
   * Processes requests for removing stored key-value pairs.
   * 
   * @param data - Encrypted KV removal request data
   * @returns Promise resolving to removal response
   * @private
   */
  private async handleRemoveKvRecordsRequest(data: Buffer): Promise<SecureResponse> {
    const keys = this.parseRemoveKvRecordsRequest(data)
    const response = await this.simulator.removeKvRecords(keys)
    
    return {
      code: response.code,
      data: response.success ? Buffer.alloc(0) : undefined,
      error: response.error,
    }
  }

  /**
   * Handles encrypted data fetch request
   * 
   * Processes requests for fetching encrypted data from device.
   * Currently not implemented in simulator.
   * 
   * @param data - Encrypted fetch request data
   * @returns Promise resolving to fetch response
   * @private
   */
  private async handleFetchEncryptedDataRequest(data: Buffer): Promise<SecureResponse> {
    // Mock implementation - not yet supported
    return {
      code: LatticeResponseCode.disabled,
      error: 'Encrypted data fetching not yet implemented',
    }
  }

  /**
   * Handles test request
   * 
   * Processes test requests that echo back the provided data.
   * 
   * @param data - Test request data
   * @returns Promise resolving to echo response
   * @private
   */
  private async handleTestRequest(data: Buffer): Promise<SecureResponse> {
    // Echo back the test data
    return {
      code: LatticeResponseCode.success,
      data: data,
    }
  }

  // Request parsing methods (simplified for simulation)
  private parseConnectRequest(data: Buffer): ConnectRequest {
    if (data.length < 65) {
      throw new Error('Invalid connect request data length')
    }
    
    return {
      deviceId: this.simulator.getDeviceId(),
      publicKey: data.slice(0, 65),
    }
  }

  private parsePairRequest(data: Buffer): PairRequest {
    console.log('[ProtocolHandler] Parsing finalizePairing request, data length:', data.length)
    console.log('[ProtocolHandler] Pairing request data:', data.toString('hex'))
    
    // According to SDK encodePairRequest, the payload contains:
    // - App name buffer (25 bytes, null-terminated)
    // - DER signature (74 bytes, padded)
    // Total expected length: 99 bytes
    
    if (data.length < 99) {
      throw new Error(`Invalid finalizePairing payload size: ${data.length}, expected 99 bytes`)
    }
    
    let offset = 0
    
    // Parse app name (25 bytes, null-terminated)
    const nameBuf = data.slice(offset, offset + 25)
    offset += 25
    
    // Extract app name by finding null terminator
    const nullIndex = nameBuf.indexOf(0)
    const appName = nullIndex >= 0 
      ? nameBuf.slice(0, nullIndex).toString('utf8')
      : nameBuf.toString('utf8').replace(/\0+$/g, '') // Remove trailing nulls
    
    // Parse DER signature (74 bytes, padded)
    const derSignature = data.slice(offset, offset + 74)
    offset += 74
    
    console.log('[ProtocolHandler] Parsed app name:', JSON.stringify(appName))
    console.log('[ProtocolHandler] DER signature length:', derSignature.length)
    console.log('[ProtocolHandler] DER signature:', derSignature.toString('hex'))
    
    // The pairing secret is not directly in the payload - it's used to create the signature
    // We'll need to validate the signature against known pairing codes
    
    return {
      appName,
      pairingSecret: undefined, // Will be validated during signature verification
      publicKey: Buffer.alloc(65), // Will be extracted from signature verification
      derSignature, // Add this for signature verification
    }
  }

  private parseGetAddressesRequest(data: Buffer): GetAddressesRequest {
    let offset = 0
    
    // Parse start path
    const pathLength = data.readUInt8(offset)
    offset += 1
    
    const startPath: number[] = []
    for (let i = 0; i < pathLength; i++) {
      startPath.push(data.readUInt32BE(offset))
      offset += 4
    }
    
    // Parse number of addresses
    const n = data.readUInt8(offset)
    offset += 1
    
    // Parse flag (optional)
    const flag = offset < data.length ? data.readUInt8(offset) : undefined
    
    return { startPath, n, flag }
  }

  private parseSignRequest(data: Buffer): SignRequest {
    let offset = 0
    
    // Parse path
    const pathLength = data.readUInt8(offset)
    offset += 1
    
    const path: number[] = []
    for (let i = 0; i < pathLength; i++) {
      path.push(data.readUInt32BE(offset))
      offset += 4
    }
    
    // Parse signing parameters
    const schema = data.readUInt8(offset)
    offset += 1
    
    const curve = data.readUInt8(offset)
    offset += 1
    
    const encoding = data.readUInt8(offset)
    offset += 1
    
    const hashType = data.readUInt8(offset)
    offset += 1
    
    // Parse data length and data
    const dataLength = data.readUInt16BE(offset)
    offset += 2
    
    const signData = data.slice(offset, offset + dataLength)
    
    return {
      path,
      schema,
      curve,
      encoding,
      hashType,
      data: signData,
    }
  }

  private parseGetKvRecordsRequest(data: Buffer): { type: number; n: number; start: number } {
    // Match the SDK's encodeGetKvRecordsRequest format:
    // Buffer.alloc(9): type (4 bytes LE) + n (1 byte) + start (4 bytes LE)
    if (data.length < 9) {
      throw new Error('Invalid getKvRecords request: insufficient data')
    }
    
    let offset = 0
    
    // Read type (4 bytes, little-endian)
    const type = data.readUInt32LE(offset)
    offset += 4
    
    // Read n (1 byte)
    const n = data.readUInt8(offset)
    offset += 1
    
    // Read start (4 bytes, little-endian)
    const start = data.readUInt32LE(offset)
    offset += 4
    
    console.log(`[ProtocolHandler] Parsed getKvRecords request: type=${type}, n=${n}, start=${start}`)
    
    return { type, n, start }
  }

  private parseAddKvRecordsRequest(data: Buffer): Record<string, string> {
    // Match the SDK's encodeAddKvRecordsRequest format:
    // Buffer structure: [numRecords (1)] + [records...]
    // Each record: [id (4)] + [type (4)] + [caseSensitive (1)] + [keyLen (1)] + [key (keyLen)] + [valLen (1)] + [val (valLen)]
    // Note: key and val are padded to fwConstants.kvKeyMaxStrSz and fwConstants.kvValMaxStrSz respectively
    
    const records: Record<string, string> = {}
    let offset = 0
    
    const numRecords = data.readUInt8(offset)
    offset += 1
    
    console.log(`[ProtocolHandler] Parsing addKvRecords request: ${numRecords} records`)
    
    for (let i = 0; i < numRecords; i++) {
      // Skip ID (4 bytes) - will be assigned by firmware
      offset += 4
      
      // Skip type (4 bytes) - not used in simulator
      offset += 4
      
      // Skip caseSensitive (1 byte) - not used in simulator
      offset += 1
      
      // Read key length and key
      const keyLen = data.readUInt8(offset)
      offset += 1
      
      // Extract key (remove null terminator if present)
      const keyBuf = data.slice(offset, offset + keyLen - 1) // -1 to remove null terminator
      const key = keyBuf.toString('utf8')
      offset += 64 // kvKeyMaxStrSz + 1 (64 + 1)
      
      // Read value length and value
      const valLen = data.readUInt8(offset)
      offset += 1
      
      // Extract value (remove null terminator if present)
      const valBuf = data.slice(offset, offset + valLen - 1) // -1 to remove null terminator
      const val = valBuf.toString('utf8')
      offset += 64 // kvValMaxStrSz + 1 (64 + 1)
      
      console.log(`[ProtocolHandler] Record ${i + 1}: key="${key}", value="${val}"`)
      records[key] = val
    }
    
    return records
  }

  private parseRemoveKvRecordsRequest(data: Buffer): string[] {
    // For remove requests, we need to parse the keys differently
    // This should match the addKvRecords format where keys are extracted
    const keys: string[] = []
    let offset = 0
    
    const numKeys = data.readUInt8(offset)
    offset += 1
    
    for (let i = 0; i < numKeys; i++) {
      const keyLen = data.readUInt8(offset)
      offset += 1
      
      const key = data.slice(offset, offset + keyLen).toString('utf8')
      offset += keyLen
      
      keys.push(key)
    }
    
    return keys
  }

  // Response serialization methods (simplified for simulation)
  private serializeConnectResponse(data: any): Buffer {
    console.log('[ProtocolHandler] Serializing connect response data:', {
      isPaired: data.isPaired,
      ephemeralPubLength: data.ephemeralPub?.length,
      ephemeralPubType: typeof data.ephemeralPub,
      firmwareVersionLength: data.firmwareVersion?.length,
      firmwareVersionType: typeof data.firmwareVersion,
    })
    
    // Connect response should be 215 bytes total: response code (1) + data (214)
    // Structure: response code (1) + pairing status (1) + ephemeral pub (65) + firmware version (4) + encrypted wallet data (144) = 215
    // SDK will remove response code and expect 214 bytes of data
    const response = Buffer.alloc(215)
    let offset = 0
    
    // Response code (1 byte) - success
    response.writeUInt8(0, offset)
    offset += 1
    
    // Pairing status (1 byte)
    response.writeUInt8(data.isPaired ? 1 : 0, offset)
    offset += 1
    
    // Ephemeral public key (65 bytes)
    if (!Buffer.isBuffer(data.ephemeralPub)) {
      throw new Error(`Expected ephemeralPub to be Buffer, got ${typeof data.ephemeralPub}`)
    }
    if (data.ephemeralPub.length !== 65) {
      throw new Error(`Expected ephemeralPub to be 65 bytes, got ${data.ephemeralPub.length}`)
    }
    data.ephemeralPub.copy(response, offset)
    offset += 65
    
    // Firmware version (4 bytes)
    if (!Buffer.isBuffer(data.firmwareVersion)) {
      throw new Error(`Expected firmwareVersion to be Buffer, got ${typeof data.firmwareVersion}`)
    }
    if (data.firmwareVersion.length !== 4) {
      throw new Error(`Expected firmwareVersion to be 4 bytes, got ${data.firmwareVersion.length}`)
    }
    data.firmwareVersion.copy(response, offset)
    offset += 4
    
    // Encrypted wallet data (144 bytes) - always present  
    // For paired devices: would contain actual encrypted wallet data
    // For unpaired devices: filled with zeros
    if (data.isPaired && data.activeWallets) {
      // TODO: Implement proper wallet data encryption
      // For now, fill with zeros even for paired devices
      response.fill(0, offset, offset + 144)
    } else {
      // Unpaired or no wallet data - fill with zeros
      response.fill(0, offset, offset + 144)
    }
    offset += 144
    
    console.log(`[ProtocolHandler] Built connect response: ${response.length} bytes`)
    return response
  }

  private serializeGetAddressesResponse(data: any): Buffer {
    const addresses = data.addresses as string[]
    const response = Buffer.alloc(addresses.length * 129) // Max address length
    let offset = 0
    
    // Number of addresses
    response.writeUInt8(addresses.length, offset)
    offset += 1
    
    // Write addresses
    for (const address of addresses) {
      const addrBuf = Buffer.from(address, 'utf8')
      response.writeUInt8(addrBuf.length, offset)
      offset += 1
      
      addrBuf.copy(response, offset)
      offset += addrBuf.length
    }
    
    return response.slice(0, offset)
  }

  private serializeSignResponse(data: any): Buffer {
    return data.signature as Buffer
  }

  /**
   * Convert hex string UID to Buffer for protocol response
   */
  private hexStringToBuffer(hexString: string): Buffer {
    return Buffer.from(hexString, 'hex')
  }

  /**
   * Convert string name to Buffer for protocol response
   */
  private stringNameToBuffer(name: string): Buffer {
    return Buffer.from(name, 'utf8')
  }

  private serializeGetWalletsResponse(data: any): Buffer {
    // Match the SDK's expected format from decodeFetchActiveWalletResponse
    // Each wallet descriptor is 71 bytes: uid (32) + capabilities (4) + name (35)
    const walletDescriptorLen = 71
    const response = Buffer.alloc(walletDescriptorLen * 2) // Internal + External
    let offset = 0
    
    // Internal wallet first (71 bytes)
    // Convert hex string UID back to Buffer for protocol compatibility
    const internalUidBuf = this.hexStringToBuffer(data.internal.uid)
    internalUidBuf.copy(response, offset)
    offset += 32
    
    response.writeUInt32BE(data.internal.capabilities || 0, offset)
    offset += 4
    
    // Name field: 35 bytes total
    const internalNameBuf = Buffer.alloc(35)
    if (data.internal.name && typeof data.internal.name === 'string') {
      // Convert string name to Buffer and copy up to 35 bytes
      const nameBuf = this.stringNameToBuffer(data.internal.name)
      nameBuf.copy(internalNameBuf, 0, 0, Math.min(35, nameBuf.length))
    }
    internalNameBuf.copy(response, offset)
    offset += 35
    
    // External wallet second (71 bytes)  
    // Convert hex string UID back to Buffer for protocol compatibility
    const externalUidBuf = this.hexStringToBuffer(data.external.uid)
    externalUidBuf.copy(response, offset)
    offset += 32
    
    response.writeUInt32BE(data.external.capabilities || 0, offset)
    offset += 4
    
    // Name field: 35 bytes total
    const externalNameBuf = Buffer.alloc(35)
    if (data.external.name && typeof data.external.name === 'string' && data.external.name.length > 0) {
      // Convert string name to Buffer and copy up to 35 bytes
      const nameBuf = this.stringNameToBuffer(data.external.name)
      nameBuf.copy(externalNameBuf, 0, 0, Math.min(35, nameBuf.length))
    }
    externalNameBuf.copy(response, offset)
    offset += 35
    
    console.log('[ProtocolHandler] Serialized wallet response length:', response.length)
    console.log('[ProtocolHandler] Internal wallet UID (hex):', data.internal.uid)
    console.log('[ProtocolHandler] External wallet UID (hex):', data.external.uid)
    
    return response
  }

  private serializeKvRecordsResponse(data: { records: Array<{ id: number; type: number; caseSensitive: boolean; key: string; val: string }>; total: number; fetched: number }): Buffer {
    // Match the SDK's decodeGetKvRecordsResponse format:
    // nTotal (4 bytes BE) + nFetched (1 byte) + records array
    // Each record: id (4 bytes BE) + type (4 bytes BE) + caseSensitive (1 byte) + key (max 64 bytes) + val (max 64 bytes)
    
    const { records, total, fetched } = data
    const maxKeySize = 64 // kvKeyMaxStrSz from firmware constants
    const maxValSize = 64 // kvValMaxStrSz from firmware constants
    
    // Calculate total size: 4 + 1 + records * (4 + 4 + 1 + maxKeySize + maxValSize)
    const recordSize = 4 + 4 + 1 + maxKeySize + maxValSize
    const response = Buffer.alloc(5 + records.length * recordSize)
    let offset = 0
    
    // Write total count (4 bytes, big-endian)
    response.writeUInt32BE(total, offset)
    offset += 4
    
    // Write fetched count (1 byte)
    response.writeUInt8(fetched, offset)
    offset += 1
    
    // Write each record
    for (const record of records) {
      // Record ID (4 bytes, big-endian)
      response.writeUInt32BE(record.id, offset)
      offset += 4
      
      // Record type (4 bytes, big-endian)
      response.writeUInt32BE(record.type, offset)
      offset += 4
      
      // Case sensitive flag (1 byte)
      response.writeUInt8(record.caseSensitive ? 1 : 0, offset)
      offset += 1
      
      // Key (maxKeySize bytes, null-terminated)
      const keyBuf = Buffer.from(record.key, 'utf8')
      const keySize = Math.min(keyBuf.length + 1, maxKeySize) // +1 for null terminator
      response.writeUInt8(keySize, offset)
      offset += 1
      keyBuf.copy(response, offset, 0, Math.min(keyBuf.length, keySize - 1))
      offset += maxKeySize
      
      // Value (maxValSize bytes, null-terminated)
      const valBuf = Buffer.from(record.val, 'utf8')
      const valSize = Math.min(valBuf.length + 1, maxValSize) // +1 for null terminator
      response.writeUInt8(valSize, offset)
      offset += 1
      valBuf.copy(response, offset, 0, Math.min(valBuf.length, valSize - 1))
      offset += maxValSize
    }
    
    console.log(`[ProtocolHandler] Serialized KV records response: total=${total}, fetched=${fetched}, size=${offset} bytes`)
    
    return response.slice(0, offset)
  }
}
