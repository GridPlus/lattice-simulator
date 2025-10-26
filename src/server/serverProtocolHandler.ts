/**
 * Protocol Request Handler for Lattice1 Device Simulator
 * Handles parsing and routing of encrypted secure requests
 */

import { createHash } from 'crypto'
import { wordlist } from '@scure/bip39/wordlists/english'
import crc32 from 'crc-32'
import elliptic from 'elliptic'
import {
  requestKvRecords,
  requestAddKvRecords,
  requestRemoveKvRecords,
} from './serverRequestManager'
import { parseSignRequestPayload, SignRequestSchema } from './signRequestParsers'
import { EXTERNAL } from '../shared/constants'
import { debug } from '../shared/debug'
import {
  LatticeSecureEncryptedRequestType,
  LatticeResponseCode,
  ProtocolConstants,
  type ConnectRequest,
  type PairRequest,
  type GetAddressesRequest,
  type SignRequest,
} from '../shared/types'
import { aes256_decrypt, aes256_encrypt, generateKeyPair } from '../shared/utils/crypto'
import type { ServerLatticeSimulator } from './serverSimulator'

const secp256k1 = new elliptic.ec('secp256k1')
const GP_ERRORS = {
  SUCCESS: 0,
  EINVAL: 0xffffffff + 1 - 22,
}

const WalletJobType = {
  LOAD_SEED: 3,
  EXPORT_SEED: 4,
  DELETE_SEED: 5,
}

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
  private simulator: ServerLatticeSimulator
  /** Cache of known shared secrets keyed by ephemeral id */
  private sharedSecretCache: Map<number, Buffer> = new Map()

  /**
   * Creates a new ProtocolHandler instance
   *
   * @param simulator - The LatticeSimulator instance to handle requests for
   */
  constructor(simulator: ServerLatticeSimulator) {
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
      // Decrypt the request data using the shared secret
      const decryptionResult = await this.decryptRequestData(request.data, request.ephemeralId)
      if (!decryptionResult) {
        return {
          code: LatticeResponseCode.pairFailed,
          error: 'Failed to decrypt request data - no shared secret available',
        }
      }

      const { requestType, requestData } = decryptionResult

      let response: SecureResponse

      switch (requestType) {
        case LatticeSecureEncryptedRequestType.finalizePairing:
          debug.protocol('Handling finalizePairing request')
          response = await this.handlePairRequest(requestData)
          break

        case LatticeSecureEncryptedRequestType.getAddresses:
          debug.protocol('Handling getAddresses request')
          response = await this.handleGetAddressesRequest(requestData)
          break

        case LatticeSecureEncryptedRequestType.sign:
          debug.protocol('Handling sign request')
          response = await this.handleSignRequest(requestData)
          break

        case LatticeSecureEncryptedRequestType.getWallets:
          debug.protocol('Handling getWallets request')
          response = await this.handleGetWalletsRequest()
          break

        case LatticeSecureEncryptedRequestType.getKvRecords:
          debug.protocol('Handling getKvRecords request')
          response = await this.handleGetKvRecordsRequest(requestData)
          break

        case LatticeSecureEncryptedRequestType.addKvRecords:
          debug.protocol('Handling addKvRecords request')
          response = await this.handleAddKvRecordsRequest(requestData)
          break

        case LatticeSecureEncryptedRequestType.removeKvRecords:
          debug.protocol('Handling removeKvRecords request')
          response = await this.handleRemoveKvRecordsRequest(requestData)
          break

        case LatticeSecureEncryptedRequestType.fetchEncryptedData:
          debug.protocol('Handling fetchEncryptedData request')
          response = await this.handleFetchEncryptedDataRequest(requestData)
          break

        case LatticeSecureEncryptedRequestType.test:
          debug.protocol('Handling test request')
          response = await this.handleTestRequest(requestData)
          break

        default:
          debug.protocol('Unsupported request type: %d', requestType)
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
          data: encryptedData,
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
  private async decryptRequestData(
    encryptedData: Buffer,
    ephemeralId?: number,
  ): Promise<{ requestType: number; requestData: Buffer } | null> {
    const primarySecret = this.simulator.getSharedSecret()
    const candidates: Array<{ secret: Buffer; id: number }> = []

    if (primarySecret) {
      candidates.push({
        secret: primarySecret,
        id: this.computeEphemeralId(primarySecret),
      })
    }

    if (ephemeralId !== undefined) {
      const cachedSecret = this.sharedSecretCache.get(ephemeralId)
      if (cachedSecret) {
        candidates.unshift({ secret: cachedSecret, id: ephemeralId })
      }
    }

    const tried = new Set<string>()

    for (const candidate of candidates) {
      const keyHex = candidate.secret.toString('hex')
      if (tried.has(keyHex)) continue
      tried.add(keyHex)

      debug.protocol('Trying shared secret candidate: %s', keyHex)

      try {
        const decryptedData = aes256_decrypt(encryptedData, candidate.secret)

        debug.protocol('Decrypted data length: %d', decryptedData.length)
        debug.protocol('Decrypted data (hex): %s', decryptedData.toString('hex'))

        if (decryptedData.length < 5) {
          throw new Error('Decrypted data too short (need at least 5 bytes)')
        }

        let offset = 0
        const requestType = decryptedData.readUInt8(offset)
        offset += 1
        debug.protocol('Extracted request type: %d', requestType)

        const requestDataSize: number =
          ProtocolConstants.msgSizes.secure.data.request.encrypted[
            requestType as keyof typeof ProtocolConstants.msgSizes.secure.data.request.encrypted
          ]

        const requestData = decryptedData.slice(offset, offset + requestDataSize)
        offset += requestDataSize
        debug.protocol('Extracted request data length: %d', requestData.length)
        debug.protocol('Extracted request data (hex): %s', requestData.toString('hex'))

        const checksum = decryptedData.readUInt32LE(offset)
        debug.protocol('Extracted checksum: %s', checksum.toString(16))

        const dataToValidate = decryptedData.slice(0, offset)
        const calculatedChecksum = crc32.buf(dataToValidate) >>> 0
        debug.protocol('Calculated checksum: %s', calculatedChecksum.toString(16))

        if (checksum !== calculatedChecksum) {
          throw new Error(
            `Checksum mismatch in decrypted request data: received=${checksum}, calculated=${calculatedChecksum}`,
          )
        }
        debug.protocol('Checksum validation passed')

        this.sharedSecretCache.set(candidate.id, candidate.secret)

        return { requestType, requestData }
      } catch (error) {
        console.error('[ProtocolHandler] Decryption attempt failed:', error)
      }
    }

    console.error('[ProtocolHandler] Unable to decrypt request with available shared secrets')
    return null
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
  private async encryptResponseData(
    responseData: Buffer,
    requestType: LatticeSecureEncryptedRequestType,
  ): Promise<Buffer> {
    // Get the shared secret for encryption
    const sharedSecret = this.simulator.getSharedSecret()
    if (!sharedSecret) {
      throw new Error('No shared secret available for response encryption')
    }

    // Reuse the current device ephemeral key to keep shared secrets in sync with SDK
    let responseEphemeralKeyPair = this.simulator.getEphemeralKeyPair()
    if (!responseEphemeralKeyPair) {
      responseEphemeralKeyPair = generateKeyPair()
      this.simulator.updateEphemeralKeyPair(responseEphemeralKeyPair)
    }

    // Build the response payload: [newEphemeralPub (65)] | [responseData] | [checksum (4)]
    const newEphemeralPub = responseEphemeralKeyPair.publicKey
    debug.protocol('Response data(unpadded) length: %d', responseData.length)
    debug.protocol('Response data(unpadded) (hex): %s', responseData.toString('hex'))
    const responseDataSize: number =
      ProtocolConstants.msgSizes.secure.data.response.encrypted[
        requestType as keyof typeof ProtocolConstants.msgSizes.secure.data.response.encrypted
      ]
    debug.protocol(
      'Expected responseDataSize for requestType %d: %d',
      requestType,
      responseDataSize,
    )

    if (responseDataSize === undefined || responseDataSize < 0) {
      throw new Error(
        `Invalid responseDataSize (${responseDataSize}) for requestType ${requestType}`,
      )
    }
    const paddedResponseData = Buffer.concat([
      responseData,
      Buffer.alloc(responseDataSize - responseData.length),
    ])
    // Calculate checksum over [ephemeralPub + responseData] (excluding checksum itself)
    const checksum = this.calculateChecksum(Buffer.concat([newEphemeralPub, paddedResponseData]))

    const checksumBuffer = Buffer.alloc(4)
    checksumBuffer.writeUInt32BE(checksum, 0)

    const responsePayload = Buffer.concat([
      newEphemeralPub, // 65 bytes
      paddedResponseData, // variable size
      checksumBuffer, // 4 bytes checksum
    ])

    debug.protocol('New ephemeral: %s', newEphemeralPub.toString('hex'))

    // The SDK expects encrypted responses to be exactly 1728 bytes
    // Pad the response payload to fit in a 1728-byte encrypted buffer
    const maxPayloadSize = 1728
    const paddedPayload = Buffer.alloc(maxPayloadSize)

    // Copy the response payload (ephemeralPub + responseData + checksum)
    responsePayload.copy(paddedPayload, 0)

    // Verify the checksum is preserved after copying
    const expectedChecksumPosition = 65 + paddedResponseData.length
    const actualChecksum = paddedPayload.readUInt32BE(expectedChecksumPosition)
    debug.protocol('Checksum verification:')
    debug.protocol('  - Expected position: %d', expectedChecksumPosition)
    debug.protocol('  - Expected checksum: %s', checksum.toString(16))
    debug.protocol('  - Actual checksum at position: %s', actualChecksum.toString(16))
    debug.protocol('  - Match: %s', actualChecksum === checksum ? 'YES' : 'NO')

    // Encrypt the padded response payload
    const encryptedPayload = aes256_encrypt(paddedPayload, sharedSecret)

    debug.protocol('Padded payload length: %d', paddedPayload.length)
    debug.protocol('Encrypted response length: %d', encryptedPayload.length)
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

  private computeEphemeralId(sharedSecret: Buffer): number {
    const hash = createHash('sha256').update(sharedSecret).digest()
    return hash.readUInt32BE(0)
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
      debug.protocol('Connect request data length: %d', data.length)
      debug.protocol('Connect request data (hex): %s', data.toString('hex'))

      const request = this.parseConnectRequest(data)
      debug.protocol('Parsed connect request: %O', request)

      const response = await this.simulator.connect(request)
      debug.protocol('Simulator connect response received.')

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
    debug.protocol('handlePairRequest, data: %s', data.toString('hex'))
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
      data: response.data
        ? this.serializeGetAddressesResponse(response.data, request.flag || 0)
        : undefined,
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
    debug.signing('Sign request: %O', request)
    const response = await this.simulator.sign(request)

    return {
      code: response.code,
      data: response.data ? this.serializeSignResponse(response.data, request) : undefined,
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
   * Requests data from client-side storage via RequestManager instead of
   * using simulator's local storage. This allows the client to be the
   * authoritative source of KV data.
   *
   * @param data - Encrypted KV request data
   * @returns Promise resolving to records response
   * @private
   */
  private async handleGetKvRecordsRequest(data: Buffer): Promise<SecureResponse> {
    try {
      const { type, n, start } = this.parseGetKvRecordsRequest(data)
      const deviceId = this.simulator.getDeviceId()

      debug.protocol('Requesting KV records from client for device: %s', deviceId)

      // Request data from client-side storage
      const clientData = await requestKvRecords(deviceId, { type, n, start })

      debug.protocol('Received KV records from client: %O', clientData)

      // Validate that we got the expected data structure
      if (!clientData || typeof clientData !== 'object') {
        return {
          code: LatticeResponseCode.internalError,
          error: 'Invalid data received from client',
        }
      }

      // The client should send data in the same format the simulator expects
      const responseData = {
        records: clientData.records || [],
        total: clientData.total || 0,
        fetched: clientData.fetched || 0,
      }

      return {
        code: LatticeResponseCode.success,
        data: this.serializeKvRecordsResponse(responseData),
      }
    } catch (error) {
      console.error('[ProtocolHandler] Error handling KV records request:', error)

      // If client request fails, fall back to simulator data
      debug.protocol('Falling back to simulator data')
      const { type, n, start } = this.parseGetKvRecordsRequest(data)
      const response = await this.simulator.getKvRecords({ type, n, start })

      return {
        code: response.code,
        data: response.data ? this.serializeKvRecordsResponse(response.data) : undefined,
        error: response.error,
      }
    }
  }

  /**
   * Handles key-value record addition request
   *
   * Requests client to store new key-value pairs via RequestManager.
   *
   * @param data - Encrypted KV addition request data
   * @returns Promise resolving to addition response
   * @private
   */
  private async handleAddKvRecordsRequest(data: Buffer): Promise<SecureResponse> {
    try {
      const records = this.parseAddKvRecordsRequest(data)
      const deviceId = this.simulator.getDeviceId()

      console.log(
        `[ProtocolHandler] Requesting to add KV records via client for device: ${deviceId}`,
      )

      // Request client to add records
      const result = await requestAddKvRecords(deviceId, records)

      console.log('[ProtocolHandler] KV records add result from client:', result)

      return {
        code: result.success ? LatticeResponseCode.success : LatticeResponseCode.internalError,
        data: result.success ? Buffer.alloc(0) : undefined,
        error: result.error,
      }
    } catch (error) {
      console.error('[ProtocolHandler] Error handling add KV records request:', error)

      // Fall back to simulator
      const records = this.parseAddKvRecordsRequest(data)
      const response = await this.simulator.addKvRecords(records)

      return {
        code: response.code,
        data: response.success ? Buffer.alloc(0) : undefined,
        error: response.error,
      }
    }
  }

  /**
   * Handles key-value record removal request
   *
   * Requests client to remove stored key-value pairs via RequestManager.
   *
   * @param data - Encrypted KV removal request data
   * @returns Promise resolving to removal response
   * @private
   */
  private async handleRemoveKvRecordsRequest(data: Buffer): Promise<SecureResponse> {
    try {
      const { type, ids } = this.parseRemoveKvRecordsRequest(data)
      const deviceId = this.simulator.getDeviceId()

      console.log(
        `[ProtocolHandler] Requesting to remove KV records via client for device: ${deviceId}, type: ${type}, ids: ${ids}`,
      )

      // Request client to remove records
      const result = await requestRemoveKvRecords(deviceId, { type, ids })

      console.log('[ProtocolHandler] KV records remove result from client:', result)

      return {
        code: result.success ? LatticeResponseCode.success : LatticeResponseCode.internalError,
        data: result.success ? Buffer.alloc(0) : undefined,
        error: result.error,
      }
    } catch (error) {
      console.error('[ProtocolHandler] Error handling remove KV records request:', error)

      // Fall back to simulator
      const { type, ids } = this.parseRemoveKvRecordsRequest(data)
      const response = await this.simulator.removeKvRecords(type, ids)

      return {
        code: response.code,
        data: response.success ? Buffer.alloc(0) : undefined,
        error: response.error,
      }
    }
  }

  /**
   * Handles encrypted data fetch request
   *
   * Processes requests for fetching encrypted data from device.
   * Supports BLS EIP2335 keystore export.
   *
   * @param data - Encrypted fetch request data
   * @returns Promise resolving to fetch response
   * @private
   */
  private async handleFetchEncryptedDataRequest(data: Buffer): Promise<SecureResponse> {
    try {
      const request = this.parseFetchEncryptedDataRequest(data)
      const response = await this.simulator.fetchEncryptedData(request)

      return {
        code: response.code,
        data: response.data,
        error: response.error,
      }
    } catch (error) {
      console.error('[ProtocolHandler] Error handling fetchEncryptedData request:', error)
      return {
        code: LatticeResponseCode.internalError,
        error: error instanceof Error ? error.message : 'Failed to fetch encrypted data',
      }
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
    try {
      if (data.length < 6) {
        throw new Error('Invalid test request payload length')
      }

      const payloadLength = data.readUInt16BE(4)
      const payload = data.slice(6, 6 + payloadLength)

      console.log('[ProtocolHandler] Raw wallet job payload:', payload.toString('hex'))

      if (payload.length < 40) {
        throw new Error('Invalid wallet job payload length')
      }

      const jobType = payload.readUInt32LE(36)

      console.log('[ProtocolHandler] Wallet job request', {
        payloadLength,
        jobType,
      })

      switch (jobType) {
        case WalletJobType.EXPORT_SEED: {
          const exportResponse = await this.simulator.exportSeed()

          if (!exportResponse.success || !exportResponse.data) {
            return {
              code: exportResponse.code,
              error: exportResponse.error || 'Failed to export seed',
            }
          }

          const { seed, wordIndices, numWords } = exportResponse.data
          const wordBuf = Buffer.alloc(24 * 4)
          wordIndices.forEach((idx, i) => {
            wordBuf.writeUInt32LE(idx >>> 0, i * 4)
          })
          const numWordsBuf = Buffer.alloc(4)
          numWordsBuf.writeUInt32LE(numWords, 0)

          const resultData = Buffer.concat([seed, wordBuf, numWordsBuf])
          const responsePayload = Buffer.alloc(6 + resultData.length)
          responsePayload.writeUInt32LE(GP_ERRORS.SUCCESS >>> 0, 0)
          responsePayload.writeUInt16LE(resultData.length, 4)
          resultData.copy(responsePayload, 6)

          return {
            code: LatticeResponseCode.success,
            data: responsePayload,
          }
        }

        case WalletJobType.DELETE_SEED: {
          const iface = payload.readUInt8(40)
          console.log('[ProtocolHandler] Handling delete seed job', { iface })
          const deleteResponse = await this.simulator.deleteSeed()

          if (!deleteResponse.success) {
            return {
              code: deleteResponse.code,
              error: deleteResponse.error || 'Failed to delete seed',
            }
          }

          const responsePayload = Buffer.alloc(6)
          responsePayload.writeUInt32LE(GP_ERRORS.SUCCESS >>> 0, 0)
          responsePayload.writeUInt16LE(0, 4)

          return {
            code: LatticeResponseCode.success,
            data: responsePayload,
          }
        }

        case WalletJobType.LOAD_SEED: {
          console.log('[ProtocolHandler] Handling load seed job', { payload })
          const iface = payload.readUInt8(40)
          let offset = 41

          const seed = payload.slice(offset, offset + 64)
          offset += 64

          const exportability = payload.readUInt8(offset)
          offset += 1

          let mnemonic: string | undefined

          if (payload.length >= offset + 100) {
            const wordSection = payload.slice(offset, offset + 100)
            const wordCount = wordSection.readUInt32LE(96)

            if (wordCount > 0 && wordCount <= 24) {
              const words: string[] = []
              for (let i = 0; i < wordCount; i++) {
                const wordIdx = wordSection.readUInt32LE(i * 4)
                if (wordIdx >= 0 && wordIdx < wordlist.length) {
                  words.push(wordlist[wordIdx])
                }
              }
              if (words.length === wordCount) {
                mnemonic = words.join(' ')
              }
            }
          }

          const loadResponse = await this.simulator.loadSeed({
            iface,
            seed,
            exportability,
            mnemonic,
          })

          console.log('[ProtocolHandler] Load seed result', {
            iface,
            exportability,
            hasMnemonic: !!mnemonic,
            success: loadResponse.success,
            error: loadResponse.error,
          })

          if (!loadResponse.success) {
            return {
              code: loadResponse.code,
              error: loadResponse.error || 'Failed to load seed',
            }
          }

          const responsePayload = Buffer.alloc(6)
          responsePayload.writeUInt32LE(GP_ERRORS.SUCCESS >>> 0, 0)
          responsePayload.writeUInt16LE(0, 4)

          return {
            code: LatticeResponseCode.success,
            data: responsePayload,
          }
        }

        default: {
          console.warn(`[ProtocolHandler] Unsupported wallet job type encountered: ${jobType}`)
          console.warn(`[ProtocolHandler] Unsupported wallet job type: ${jobType}`)
          const errorPayload = Buffer.alloc(6)
          errorPayload.writeUInt32LE(GP_ERRORS.EINVAL >>> 0, 0)
          errorPayload.writeUInt16LE(0, 4)
          return {
            code: LatticeResponseCode.invalidMsg,
            data: errorPayload,
            error: `Unsupported wallet job type: ${jobType}`,
          }
        }
      }
    } catch (error) {
      console.error('[ProtocolHandler] Test request processing error:', error)
      const errorPayload = Buffer.alloc(6)
      errorPayload.writeUInt32LE(GP_ERRORS.EINVAL >>> 0, 0)
      errorPayload.writeUInt16LE(0, 4)
      return {
        code: LatticeResponseCode.internalError,
        data: errorPayload,
        error: error instanceof Error ? error.message : 'Failed to process test request',
      }
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

    if (data.length !== 99) {
      throw new Error(`Invalid finalizePairing payload size: ${data.length}, expected 99 bytes`)
    }

    let offset = 0

    // Parse app name (25 bytes, null-terminated)
    const nameBuf = data.slice(offset, offset + 25)
    offset += 25

    // Extract app name by finding null terminator
    const nullIndex = nameBuf.indexOf(0)
    const appName =
      nullIndex >= 0
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
      derSignature, // Add this for signature verification
    }
  }

  private parseGetAddressesRequest(data: Buffer): GetAddressesRequest {
    // Match the SDK's encodeGetAddressesRequest format:
    // wallet.uid (32) + pathDepth_IterIdx (1) + startPath (20) + countVal|flagVal (1) = 54 bytes total
    if (data.length < 54) {
      throw new Error(`Invalid getAddresses request: expected 54 bytes, got ${data.length}`)
    }

    let offset = 0

    // Skip wallet.uid (32 bytes) - not needed for parsing in simulator
    offset += 32

    // Parse pathDepth_IterIdx (1 byte)
    const pathDepth_IterIdx = data.readUInt8(offset)
    offset += 1

    const pathLength = pathDepth_IterIdx & 0x0f

    // Parse startPath (20 bytes = 5 × 4-byte values)
    const startPath: number[] = []
    for (let i = 0; i < 5; i++) {
      const val = data.readUInt32BE(offset)
      offset += 4

      // Only include non-zero values up to pathLength
      if (i < pathLength) {
        startPath.push(val)
      }
    }

    // Parse countVal|flagVal (1 byte)
    const countVal_flagVal = data.readUInt8(offset)
    const n = countVal_flagVal & 0x0f
    const flag = (countVal_flagVal >> 4) & 0x0f

    return { startPath, n, flag }
  }

  private parseSignRequest(data: Buffer): SignRequest {
    let offset = 0

    // Parse the SDK format: hasExtraPayloads (1) + schema (1) + wallet.uid (32) + reqPayload (variable)
    console.log(`[ProtocolHandler] Parsing sign request, data length: ${data.length}`)

    // Parse hasExtraPayloads flag (1 byte)
    const hasExtraPayloads = data.readUInt8(offset)
    offset += 1

    // Parse schema (1 byte)
    const schema = data.readUInt8(offset)
    offset += 1

    // Skip wallet.uid (32 bytes) - not needed for parsing in simulator
    offset += 32

    // The remaining data is the reqPayload which contains the actual signing request
    const reqPayload = data.slice(offset)

    console.log(
      `[ProtocolHandler] SDK envelope: hasExtraPayloads=${hasExtraPayloads}, schema=${schema}, payloadLength=${reqPayload.length}`,
    )

    // Use the factory-based parser for structured parsing
    const parsedRequest = parseSignRequestPayload(reqPayload, hasExtraPayloads > 0, schema)

    // Derive whether additional payload frames are required even if the flag is unset.
    const declaredLength =
      typeof (parsedRequest as any).messageLength === 'number'
        ? ((parsedRequest as any).messageLength as number)
        : null
    const chunkLength = parsedRequest.data.length
    const parserDetectedPrehash = Boolean((parsedRequest as any).isPrehashed)

    let expectsExtraPayloads = hasExtraPayloads > 0

    if (
      !expectsExtraPayloads &&
      !parserDetectedPrehash &&
      declaredLength !== null &&
      chunkLength < declaredLength
    ) {
      expectsExtraPayloads = true
      debug.signing('Overriding hasExtraPayloads due to length mismatch', {
        declaredLength,
        chunkLength,
        previousFlag: hasExtraPayloads,
      })
    }

    debug.signing('Sign request multipart analysis', {
      originalFlag: hasExtraPayloads,
      expectsExtraPayloads,
      parserDetectedPrehash,
      declaredLength,
      chunkLength,
      schema,
      curve: parsedRequest.curve,
    })

    const signRequest: SignRequest = {
      ...parsedRequest,
      hasExtraPayloads: expectsExtraPayloads,
      rawPayload: reqPayload,
    }

    console.log('[ProtocolHandler] Final signRequest.curve:', signRequest.curve)

    if (schema === SignRequestSchema.EXTRA_DATA) {
      signRequest.nextCode = reqPayload.slice(0, 8)
    }

    return signRequest
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

    console.log(
      `[ProtocolHandler] Parsed getKvRecords request: type=${type}, n=${n}, start=${start}`,
    )

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

  private parseRemoveKvRecordsRequest(data: Buffer): { type: number; ids: number[] } {
    // Match the SDK's encodeRemoveKvRecordsRequest format:
    // Buffer structure: [type (4 bytes LE)] + [numIds (1 byte)] + [ids... (4 bytes each LE)]
    if (data.length < 5) {
      throw new Error('Invalid removeKvRecords request: insufficient data')
    }

    let offset = 0

    // Read type (4 bytes, little-endian)
    const type = data.readUInt32LE(offset)
    offset += 4

    // Read number of IDs (1 byte)
    const numIds = data.readUInt8(offset)
    offset += 1

    // Validate minimum data length for IDs
    if (data.length < 5 + numIds * 4) {
      throw new Error(
        `Invalid removeKvRecords request: expected ${5 + numIds * 4} bytes, got ${data.length}`,
      )
    }

    // Read IDs (4 bytes each, little-endian)
    const ids: number[] = []
    for (let i = 0; i < numIds; i++) {
      const id = data.readUInt32LE(offset)
      ids.push(id)
      offset += 4
    }

    console.log(
      `[ProtocolHandler] Parsed removeKvRecords request: type=${type}, numIds=${numIds}, ids=${ids}`,
    )

    return { type, ids }
  }

  private parseFetchEncryptedDataRequest(data: Buffer): {
    schema: number
    walletUID: Buffer
    path: number[]
    params?: { c?: number }
  } {
    // Parse fetch encrypted data request
    // Format: schema (1) | walletUID (32) | pathLength (1) | path (5 * u32 LE) | params (4)
    if (data.length < 1 + 32 + 1 + 5 * 4) {
      throw new Error('Invalid fetchEncryptedData request: insufficient data')
    }

    let offset = 0

    // Read schema (1 byte)
    const schema = data.readUInt8(offset)
    offset += 1

    // Read wallet UID (32 bytes)
    const walletUID = data.slice(offset, offset + 32)
    offset += 32

    // Read path length (1 byte)
    const pathLength = data.readUInt8(offset)
    offset += 1

    // Read path (5x4 bytes)
    const path: number[] = []
    for (let i = 0; i < 5; i++) {
      const segment = data.readUInt32LE(offset)
      offset += 4
      if (i < pathLength) {
        path.push(segment)
      }
    }

    // Read params if available
    const params: { c?: number } = {}
    if (data.length >= offset + 4) {
      // For EIP2335, params include iteration count 'c' (4 bytes LE)
      const c = data.readUInt32LE(offset)
      if (c > 0) {
        params.c = c
      }
    }

    console.log(
      `[ProtocolHandler] Parsed fetchEncryptedData request: schema=${schema}, path=[${path.join(',')}], params=${JSON.stringify(params)}`,
    )

    return { schema, walletUID, path, params }
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

    // Encrypted wallet data (144 bytes) - only meaningful once paired
    if (data.isPaired) {
      if (!Buffer.isBuffer(data.encryptedWalletData)) {
        throw new Error('Encrypted wallet data missing for paired device')
      }
      if (data.encryptedWalletData.length !== 144) {
        throw new Error(
          `Encrypted wallet data must be 144 bytes, received ${data.encryptedWalletData.length}`,
        )
      }
      data.encryptedWalletData.copy(response, offset)
    } else {
      // Unpaired or no wallet data - fill with zeros
      response.fill(0, offset, offset + 144)
    }
    offset += 144

    console.log(`[ProtocolHandler] Built connect response: ${response.length} bytes`)
    return response
  }

  private serializeGetAddressesResponse(data: any, flag: number): Buffer {
    const addresses = data.addresses as string[]
    const publicKeys = data.publicKeys as Buffer[]

    // Check if we need to return public keys based on flag
    const arePubkeys =
      flag === 3 /* secp256k1Pubkey */ ||
      flag === 4 /* ed25519Pubkey */ ||
      flag === 5 /* bls12_381Pubkey */

    // Get the response data length from protocol constants
    const respDataLength =
      ProtocolConstants.msgSizes.secure.data.response.encrypted[
        LatticeSecureEncryptedRequestType.getAddresses
      ]
    const response = Buffer.alloc(respDataLength)
    let offset = 0

    // Calculate max addresses that can fit in the response
    const maxAddresses = arePubkeys
      ? Math.floor((respDataLength - 1) / 65)
      : Math.floor(respDataLength / 129)
    const addressesToProcess = Math.min(addresses.length, maxAddresses)

    console.log(
      `[ProtocolHandler] Serializing ${addressesToProcess} addresses (max: ${maxAddresses}, available: ${respDataLength} bytes)`,
    )
    console.log(`[ProtocolHandler] isPubkeys: ${arePubkeys}, flag: ${flag}`)

    if (arePubkeys) {
      // For public key responses, add count byte first
      response.writeUInt8(flag & 0xff, offset)
      offset += 1

      // Write public keys as raw bytes (65 bytes each for secp256k1, 32 for ed25519, 48 for bls12_381)
      for (let i = 0; i < addressesToProcess; i++) {
        if (publicKeys && publicKeys[i]) {
          const pubKey = Buffer.isBuffer(publicKeys[i])
            ? publicKeys[i]
            : Buffer.from(String(publicKeys[i]), 'hex')

          // Write appropriate length based on curve type
          if (flag === 4 /* ed25519Pubkey */) {
            // Ed25519: 32 bytes, but still allocate 65 bytes for compatibility
            pubKey.slice(0, 32).copy(response, offset)
            offset += 65 // Always advance by 65 bytes as expected by decoder
          } else if (flag === 5 /* bls12_381Pubkey */) {
            // BLS12-381: 48 bytes, but still allocate 65 bytes for compatibility
            pubKey.slice(0, 48).copy(response, offset)
            offset += 65 // Always advance by 65 bytes as expected by decoder
          } else {
            // secp256k1: 65 bytes
            pubKey.slice(0, 65).copy(response, offset)
            offset += 65
          }
        } else {
          // Empty public key - just advance offset
          offset += 65
        }
      }
    } else {
      // For address responses, write fixed-length null-terminated strings
      const addrStrLen = 129 // ProtocolConstants.addrStrLen

      for (let i = 0; i < addressesToProcess; i++) {
        const address = addresses[i]
        const addrBuf = Buffer.from(address, 'utf8')
        // Copy address string and null-terminate
        addrBuf.copy(response, offset, 0, Math.min(addrBuf.length, addrStrLen - 1))
        // Ensure null termination
        response[offset + Math.min(addrBuf.length, addrStrLen - 1)] = 0
        offset += addrStrLen
      }
    }

    return response.slice(0, respDataLength)
  }

  private serializeSignResponse(data: any, request?: any): Buffer {
    // The response format varies by currency/schema type and must match SDK's decodeSignResponse exactly

    console.log('[ProtocolHandler] serializeSignResponse input:', {
      hasSignature: !!data?.signature,
      hasFormat: !!data?.format,
      hasMetadata: !!data?.metadata,
      format: data?.format,
      schema: data?.schema ?? request?.schema,
      signatureType: typeof data?.signature,
      signatureLength: data?.signature?.length,
      metadataKeys: data?.metadata ? Object.keys(data.metadata) : 'none',
      data: JSON.stringify(data),
    })

    if (data?.nextCode) {
      const nextCodeBuf = Buffer.alloc(8, 0)
      data.nextCode.copy(nextCodeBuf, 0, 0, Math.min(data.nextCode.length, 8))
      return nextCodeBuf
    }

    const resolvedSchema = data?.schema ?? request?.schema
    const resolvedRequest: any = {
      ...(request || {}),
      schema: resolvedSchema,
    }

    if (data?.omitPubkey !== undefined) {
      resolvedRequest.omitPubkey = data.omitPubkey
    }

    // Handle Bitcoin transaction format (schema 0)
    if (resolvedSchema === 0) {
      console.log('[ProtocolHandler] Processing Bitcoin transaction')
      // Bitcoin transaction response format: [PKH (20)] + [signatures (760)] + [pubkeys (n * 33)]
      console.log('[ProtocolHandler] Constructing full Bitcoin transaction response format')

      const derSigLen = 74
      const compressedPubLength = 33
      const pkhLen = 20
      const sigsLen = 760

      // For Bitcoin, we only have a single signature from SignResponse
      // We need to create the full format expected by SDK
      const responseSize = pkhLen + sigsLen + compressedPubLength // 1 pubkey
      const response = Buffer.alloc(responseSize)

      let offset = 0

      // Add change recipient PKH (20 bytes) - fill with zeros as placeholder
      response.fill(0, offset, offset + pkhLen)
      offset += pkhLen

      // Add signature to signatures section (760 bytes)
      // Place the single signature at the first slot
      if (
        Buffer.isBuffer(data.signature) &&
        data.signature.length > 0 &&
        data.signature[0] === 0x30
      ) {
        // Copy DER signature to first signature slot
        data.signature.copy(response, offset, 0, Math.min(data.signature.length, derSigLen))
      }
      offset += sigsLen // Skip entire signature section

      // Add pubkey at SDK expected position
      // SDK calculates: pubStart = 0 * compressedPubLength + sigsLen = 760
      const pubkeyOffset = 0 * compressedPubLength + sigsLen // = 760
      if (data.metadata?.publicKey) {
        const pubkeyBuf = Buffer.from(data.metadata.publicKey, 'hex')
        pubkeyBuf.copy(response, pubkeyOffset, 0, Math.min(pubkeyBuf.length, compressedPubLength))
      } else {
        // Fill with zeros if no public key available
        response.fill(0, pubkeyOffset, pubkeyOffset + compressedPubLength)
      }

      console.log(
        `[ProtocolHandler] Created Bitcoin transaction response: ${response.length} bytes with 1 signature and 1 pubkey placeholder`,
      )
      return response
    }

    // Handle Ethereum transactions and messages (schemas 1, 2, 3)
    // Schema 3 = ETH_MSG (personal_sign, EIP-712)
    if (resolvedSchema === 1 || resolvedSchema === 2 || resolvedSchema === 3) {
      console.log(
        `[ProtocolHandler] Processing Ethereum transaction/message (schema ${resolvedSchema})`,
      )
      // SDK expects: [DER signature (74 bytes)] + [signer address (20 bytes)]
      const derSigLen = 74
      const response = Buffer.alloc(derSigLen + 20)

      // Use the signature from SignResponse
      if (data.signature) {
        const derSignature = this.ensureDerSignature(data.signature)
        derSignature.copy(response, 0, 0, Math.min(derSignature.length, derSigLen))
      }

      // Add signer address (20 bytes)
      if (data.metadata?.signer) {
        const signerBuf =
          typeof data.metadata.signer === 'string'
            ? Buffer.from(data.metadata.signer.replace('0x', ''), 'hex')
            : Buffer.from(data.metadata.signer)
        signerBuf.copy(response, derSigLen, 0, 20)
      } else {
        // Fill with zeros if no signer address available
        response.fill(0, derSigLen, derSigLen + 20)
      }

      console.log(
        `[ProtocolHandler] Created Ethereum transaction response: ${response.length} bytes`,
      )
      return response
    }

    if (resolvedSchema === SignRequestSchema.GENERIC) {
      console.log('[ProtocolHandler] Processing generic signing response')
      return this.serializeGenericSigningResponse(data, resolvedRequest)
    }

    // Handle basic signature format (for generic/raw signatures)
    if (data.signature) {
      console.log('[ProtocolHandler] Processing basic signature format')
      return data.signature as Buffer
    }

    // Fallback: return empty buffer for unsupported formats
    console.warn('[ProtocolHandler] Unknown sign response format, returning empty buffer')
    return Buffer.alloc(0)
  }

  private serializeGenericSigningResponse(data: any, request: SignRequest): Buffer {
    const includePubkey = !request.omitPubkey
    console.log('[ProtocolHandler] serializeGenericSigningResponse metadata snapshot', {
      includePubkey,
      metadata: data?.metadata,
      signatureType: typeof data?.signature,
      signatureLength:
        data?.signature && (Buffer.isBuffer(data.signature) || typeof data.signature === 'string')
          ? Buffer.isBuffer(data.signature)
            ? data.signature.length
            : (data.signature.length ?? null)
          : null,
    })
    const isEd25519 = request.curve === 1
    const isBls = request.curve === EXTERNAL.SIGNING.CURVES.BLS12_381_G2

    console.log('[ProtocolHandler] serializeGenericSigningResponse', {
      omitPubkey: request.omitPubkey,
      hasMetadata: !!data.metadata,
      metadataKeys: data.metadata ? Object.keys(data.metadata) : 'none',
      publicKey: data.metadata?.publicKey,
      publicKeyCompressed: data.metadata?.publicKeyCompressed,
      signatureLength: (data.signature as any)?.length,
      curveType: request.curve,
      isEd25519,
      isBls,
      dataKeys: Object.keys(data),
      requestKeys: Object.keys(request),
      messagePrehash: data.messagePrehash ? data.messagePrehash.toString('hex') : 'undefined',
    })

    const messagePrehashSection = data.messagePrehash
      ? Buffer.from(data.messagePrehash).slice(0, 32)
      : null

    if (isBls) {
      const pubkeySection = includePubkey ? this.getBlsPubkeyBuffer(data) : Buffer.alloc(48)
      const signatureSection = this.getBlsSignatureBuffer(data.signature)

      console.log('[ProtocolHandler] BLS generic signing response', {
        pubkeyLength: pubkeySection.length,
        signatureLength: signatureSection.length,
      })

      return messagePrehashSection
        ? Buffer.concat([pubkeySection, signatureSection, messagePrehashSection])
        : Buffer.concat([pubkeySection, signatureSection])
    }

    // For Ed25519, pubkey is 32 bytes; for secp256k1, it's 65 bytes
    const pubkeySection = includePubkey
      ? isEd25519
        ? this.getEd25519PubkeyBuffer(data)
        : this.getUncompressedPubkeyBuffer(data)
      : isEd25519
        ? Buffer.alloc(32)
        : this.buildEmptyPubkeySection()

    // For Ed25519 (curve type 1), use raw signature format (no DER encoding)
    // Ed25519 signatures are always 64 bytes (32 bytes R + 32 bytes S)
    const signatureSection = isEd25519
      ? Buffer.from(data.signature as Buffer)
      : this.ensureDerSignature(data.signature as Buffer)

    console.log('[ProtocolHandler] Generic signing signature info', {
      rawType: typeof data.signature,
      rawLength: (data.signature as any)?.length,
      isEd25519,
      pubkeyLength: pubkeySection.length,
      finalLength: signatureSection.length,
      finalPrefix: signatureSection.slice(0, 5).toString('hex'),
      pubkeyFirstByte: pubkeySection[0],
      pubkeyPrefix: pubkeySection.slice(0, 4).toString('hex'),
    })

    const responseBuffer = messagePrehashSection
      ? Buffer.concat([pubkeySection, signatureSection, messagePrehashSection])
      : Buffer.concat([pubkeySection, signatureSection])

    return responseBuffer
  }

  private buildEmptyPubkeySection(): Buffer {
    const empty = Buffer.alloc(65)
    empty.writeUInt8(0x04, 0)
    return empty
  }

  private getEd25519PubkeyBuffer(data: any): Buffer {
    const metadata = data.metadata || {}
    const pubkey = metadata.publicKey

    if (!pubkey) {
      console.warn('[ProtocolHandler] Missing Ed25519 public key, returning zeros')
      return Buffer.alloc(32)
    }

    const pubkeyBuf =
      typeof pubkey === 'string'
        ? Buffer.from(pubkey.startsWith('0x') ? pubkey.slice(2) : pubkey, 'hex')
        : Buffer.from(pubkey)

    // Ed25519 public keys are 32 bytes
    if (pubkeyBuf.length === 32) {
      return pubkeyBuf
    }

    // If longer, take first 32 bytes
    if (pubkeyBuf.length > 32) {
      return pubkeyBuf.slice(0, 32)
    }

    // If shorter, pad with zeros
    const padded = Buffer.alloc(32)
    pubkeyBuf.copy(padded, 0)
    return padded
  }

  private getUncompressedPubkeyBuffer(data: any): Buffer {
    const metadata = data.metadata || {}
    const candidatePubkeys = [metadata.publicKey, metadata.publicKeyCompressed]

    for (const candidate of candidatePubkeys) {
      if (candidate) {
        console.log('[ProtocolHandler] Attempting to normalize pubkey candidate', {
          type: typeof candidate,
          length:
            typeof candidate === 'string'
              ? candidate.length
              : candidate instanceof Uint8Array
                ? candidate.length
                : Buffer.isBuffer(candidate)
                  ? candidate.length
                  : null,
          sample:
            typeof candidate === 'string'
              ? `${candidate.slice(0, 8)}...`
              : Buffer.from(candidate as any)
                  .slice(0, 4)
                  .toString('hex'),
        })
      }
      const normalized = this.normalizePublicKey(candidate)
      if (normalized) {
        console.log('[ProtocolHandler] Using normalized pubkey', {
          length: normalized.length,
          prefix: normalized.slice(0, 4).toString('hex'),
        })
        return normalized
      }
    }

    console.warn(
      '[ProtocolHandler] Missing public key metadata in signing response, returning placeholder',
    )
    return this.buildEmptyPubkeySection()
  }

  private normalizePublicKey(pubkey?: string | Buffer): Buffer | null {
    if (!pubkey) {
      return null
    }

    let pubkeyBuf: Buffer
    if (typeof pubkey === 'string') {
      const sanitized = pubkey.startsWith('0x') ? pubkey.slice(2) : pubkey
      if (!sanitized.length) {
        return null
      }
      pubkeyBuf = Buffer.from(sanitized, 'hex')
    } else {
      pubkeyBuf = Buffer.from(pubkey)
    }

    if (pubkeyBuf.length === 65) {
      return pubkeyBuf
    }

    if (pubkeyBuf.length === 64) {
      const withPrefix = Buffer.alloc(65)
      withPrefix.writeUInt8(0x04, 0)
      pubkeyBuf.copy(withPrefix, 1)
      return withPrefix
    }

    if (pubkeyBuf.length === 33) {
      try {
        const key = secp256k1.keyFromPublic(Array.from(pubkeyBuf))
        return Buffer.from(key.getPublic(false, 'array'))
      } catch (error) {
        console.error('[ProtocolHandler] Failed to decompress public key:', error)
        return null
      }
    }

    return null
  }

  private ensureDerSignature(signatureInput: Buffer | Uint8Array | string): Buffer {
    if (!signatureInput) {
      return Buffer.alloc(0)
    }

    const toBuffer = (value: Buffer | Uint8Array | string): Buffer => {
      if (Buffer.isBuffer(value)) {
        return Buffer.from(value)
      }
      if (typeof value === 'string') {
        const sanitized = value.startsWith('0x') ? value.slice(2) : value
        return Buffer.from(sanitized, 'hex')
      }
      return Buffer.from(value)
    }

    let signature = toBuffer(signatureInput)

    if (signature.length === 0) {
      return signature
    }

    if (this.isDerEncodedSignature(signature)) {
      return signature
    }

    if (signature.length === 65 || signature.length === 66) {
      const recoveryByte = signature[signature.length - 1]
      if (recoveryByte <= 3) {
        signature = signature.slice(0, signature.length - 1)
      }
    }

    if (signature.length === 64) {
      return this.createDERSignature(signature.slice(0, 32), signature.slice(32))
    }

    console.warn('[ProtocolHandler] Unexpected signature format, returning raw bytes', {
      length: signature.length,
      startsWith: signature[0],
    })
    return signature
  }

  private getBlsPubkeyBuffer(data: any): Buffer {
    const metadata = data.metadata || {}
    const pubkey = metadata.publicKey

    if (!pubkey) {
      console.warn('[ProtocolHandler] Missing BLS public key, returning zeros')
      return Buffer.alloc(48)
    }

    const pubkeyBuf =
      typeof pubkey === 'string'
        ? Buffer.from(pubkey.startsWith('0x') ? pubkey.slice(2) : pubkey, 'hex')
        : Buffer.from(pubkey)

    if (pubkeyBuf.length >= 48) {
      return pubkeyBuf.slice(0, 48)
    }

    const padded = Buffer.alloc(48)
    pubkeyBuf.copy(padded, 0)
    return padded
  }

  private getBlsSignatureBuffer(signatureInput: Buffer | Uint8Array | string): Buffer {
    if (!signatureInput) {
      return Buffer.alloc(96)
    }

    let signature: Buffer
    if (Buffer.isBuffer(signatureInput)) {
      signature = Buffer.from(signatureInput)
    } else if (typeof signatureInput === 'string') {
      const sanitized = signatureInput.startsWith('0x') ? signatureInput.slice(2) : signatureInput
      signature = Buffer.from(sanitized, 'hex')
    } else {
      signature = Buffer.from(signatureInput)
    }

    if (signature.length === 96) {
      return signature
    }

    if (signature.length > 96) {
      return signature.slice(0, 96)
    }

    const padded = Buffer.alloc(96)
    signature.copy(padded, 0)
    return padded
  }

  private isDerEncodedSignature(signature: Buffer): boolean {
    if (signature.length < 4 || signature[0] !== 0x30) {
      return false
    }

    let offset = 1
    let length = signature[offset++]

    if (length & 0x80) {
      const lengthOfLength = length & 0x7f
      if (
        lengthOfLength === 0 ||
        lengthOfLength > 4 ||
        offset + lengthOfLength > signature.length
      ) {
        return false
      }
      length = 0
      for (let i = 0; i < lengthOfLength; i++) {
        length = (length << 8) | signature[offset++]
      }
    }

    if (signature.length !== offset + length) {
      return false
    }

    if (signature[offset++] !== 0x02) {
      return false
    }

    const rLen = signature[offset++]
    if (offset + rLen > signature.length) {
      return false
    }
    offset += rLen

    if (signature[offset++] !== 0x02) {
      return false
    }

    const sLen = signature[offset++]
    if (offset + sLen !== signature.length) {
      return false
    }

    return true
  }

  /**
   * Creates a proper DER-encoded signature from r and s components
   * @param r - r component as hex string
   * @param s - s component as hex string
   * @returns DER-encoded signature buffer
   */
  private createDERSignature(rInput: Buffer | string, sInput: Buffer | string): Buffer {
    const toBuffer = (value: Buffer | string) => {
      if (Buffer.isBuffer(value)) {
        return Buffer.from(value)
      }
      const sanitized = value.startsWith('0x') ? value.slice(2) : value
      return Buffer.from(sanitized, 'hex')
    }

    const normalizeComponent = (component: Buffer) => {
      let normalized = Buffer.from(component)

      while (normalized.length > 1 && normalized[0] === 0x00) {
        normalized = normalized.slice(1)
      }

      if (normalized[0] & 0x80) {
        normalized = Buffer.concat([Buffer.from([0x00]), normalized])
      }

      return normalized
    }

    const r = normalizeComponent(toBuffer(rInput))
    const s = normalizeComponent(toBuffer(sInput))

    const sequence = Buffer.concat([
      Buffer.from([0x02, r.length]),
      r,
      Buffer.from([0x02, s.length]),
      s,
    ])

    const encodeLength = (length: number) => {
      if (length <= 0x7f) {
        return Buffer.from([length])
      }

      const bytes: number[] = []
      let remaining = length
      while (remaining > 0) {
        bytes.unshift(remaining & 0xff)
        remaining >>= 8
      }
      return Buffer.from([0x80 | bytes.length, ...bytes])
    }

    const lengthBytes = encodeLength(sequence.length)
    return Buffer.concat([Buffer.from([0x30]), lengthBytes, sequence])
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

    // Validate that the required wallet data exists
    if (!data.internal || !data.external) {
      console.error('[ProtocolHandler] Missing wallet data:', {
        hasInternal: !!data.internal,
        hasExternal: !!data.external,
      })
      throw new Error('Invalid activeWallets data: missing internal or external wallet')
    }

    if (!data.internal.uid || !data.external.uid) {
      console.error('[ProtocolHandler] Missing wallet UIDs:', {
        internalUid: data.internal.uid,
        externalUid: data.external.uid,
      })
      throw new Error('Invalid activeWallets data: missing wallet UIDs')
    }

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
    if (
      data.external.name &&
      typeof data.external.name === 'string' &&
      data.external.name.length > 0
    ) {
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

  private serializeKvRecordsResponse(data: {
    records: Array<{ id: number; type: number; caseSensitive: boolean; key: string; val: string }>
    total: number
    fetched: number
  }): Buffer {
    // Match the SDK's decodeGetKvRecordsResponse format:
    // nTotal (4 bytes BE) + nFetched (1 byte) + records array
    // Each record: id (4 bytes BE) + type (4 bytes BE) + caseSensitive (1 byte) + key (max 64 bytes) + val (max 64 bytes)

    const { records, total, fetched } = data
    const maxKeySize = 64 // kvKeyMaxStrSz from firmware constants
    const maxValSize = 64 // kvValMaxStrSz from firmware constants

    // Calculate total size: 4 + 1 + records * (4 + 4 + 1 + 1 + maxKeySize + 1 + maxValSize)
    const recordSize = 4 + 4 + 1 + 1 + maxKeySize + 1 + maxValSize
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

    console.log(
      `[ProtocolHandler] Serialized KV records response: total=${total}, fetched=${fetched}, size=${offset} bytes`,
    )

    return response.slice(0, offset)
  }
}
