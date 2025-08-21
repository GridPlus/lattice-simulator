/**
 * Protocol Request Handler for Lattice1 Device Simulator
 * Handles parsing and routing of encrypted secure requests
 */

import {
  LatticeSecureEncryptedRequestType,
  LatticeResponseCode,
  DeviceResponse,
  ConnectRequest,
  PairRequest,
  GetAddressesRequest,
  SignRequest,
} from '../types'
import { LatticeSimulator } from './simulator'
import { createDeviceResponse, getRequestTypeName } from '../utils'

export interface SecureRequest {
  type: LatticeSecureEncryptedRequestType
  data: Buffer
  ephemeralId?: number
}

export interface SecureResponse {
  code: LatticeResponseCode
  data?: Buffer
  error?: string
}

export class ProtocolHandler {
  private simulator: LatticeSimulator

  constructor(simulator: LatticeSimulator) {
    this.simulator = simulator
  }

  /**
   * Handle a secure encrypted request
   */
  async handleSecureRequest(request: SecureRequest): Promise<SecureResponse> {
    try {
      console.log(`[ProtocolHandler] Processing ${getRequestTypeName(request.type)} request`)
      
      switch (request.type) {
        case LatticeSecureEncryptedRequestType.finalizePairing:
          return await this.handlePairRequest(request.data)
          
        case LatticeSecureEncryptedRequestType.getAddresses:
          return await this.handleGetAddressesRequest(request.data)
          
        case LatticeSecureEncryptedRequestType.sign:
          return await this.handleSignRequest(request.data)
          
        case LatticeSecureEncryptedRequestType.getWallets:
          return await this.handleGetWalletsRequest()
          
        case LatticeSecureEncryptedRequestType.getKvRecords:
          return await this.handleGetKvRecordsRequest(request.data)
          
        case LatticeSecureEncryptedRequestType.addKvRecords:
          return await this.handleAddKvRecordsRequest(request.data)
          
        case LatticeSecureEncryptedRequestType.removeKvRecords:
          return await this.handleRemoveKvRecordsRequest(request.data)
          
        case LatticeSecureEncryptedRequestType.fetchEncryptedData:
          return await this.handleFetchEncryptedDataRequest(request.data)
          
        case LatticeSecureEncryptedRequestType.test:
          return await this.handleTestRequest(request.data)
          
        default:
          return {
            code: LatticeResponseCode.invalidMsg,
            error: `Unsupported request type: ${request.type}`,
          }
      }
    } catch (error) {
      console.error('[ProtocolHandler] Request processing error:', error)
      return {
        code: LatticeResponseCode.internalError,
        error: error instanceof Error ? error.message : 'Unknown error',
      }
    }
  }

  /**
   * Handle connect request (not encrypted)
   */
  async handleConnectRequest(data: Buffer): Promise<SecureResponse> {
    try {
      const request = this.parseConnectRequest(data)
      const response = await this.simulator.connect(request)
      
      return {
        code: response.code,
        data: this.serializeConnectResponse(response.data),
        error: response.error,
      }
    } catch (error) {
      return {
        code: LatticeResponseCode.invalidMsg,
        error: error instanceof Error ? error.message : 'Failed to parse connect request',
      }
    }
  }

  /**
   * Handle finalize pairing request
   */
  private async handlePairRequest(data: Buffer): Promise<SecureResponse> {
    const request = this.parsePairRequest(data)
    const response = await this.simulator.pair(request)
    
    return {
      code: response.code,
      data: response.data ? Buffer.alloc(0) : undefined, // Pairing response has no data
      error: response.error,
    }
  }

  /**
   * Handle get addresses request
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
   * Handle signing request
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
   * Handle get wallets request
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
   * Handle get KV records request
   */
  private async handleGetKvRecordsRequest(data: Buffer): Promise<SecureResponse> {
    const keys = this.parseGetKvRecordsRequest(data)
    const response = await this.simulator.getKvRecords(keys)
    
    return {
      code: response.code,
      data: response.data ? this.serializeKvRecordsResponse(response.data) : undefined,
      error: response.error,
    }
  }

  /**
   * Handle add KV records request
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
   * Handle remove KV records request
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
   * Handle fetch encrypted data request
   */
  private async handleFetchEncryptedDataRequest(data: Buffer): Promise<SecureResponse> {
    // Mock implementation - not yet supported
    return {
      code: LatticeResponseCode.disabled,
      error: 'Encrypted data fetching not yet implemented',
    }
  }

  /**
   * Handle test request
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
    // Simplified parsing - in real implementation would parse name, signature, etc.
    let offset = 0
    
    // Skip version and other metadata
    offset += 4
    
    // Parse app name length and name
    const nameLen = data.readUInt8(offset)
    offset += 1
    
    const appName = data.slice(offset, offset + nameLen).toString('utf8')
    offset += nameLen
    
    // Parse pairing secret if present
    let pairingSecret: string | undefined
    if (offset < data.length) {
      const secretLen = data.readUInt8(offset)
      offset += 1
      if (secretLen > 0) {
        pairingSecret = data.slice(offset, offset + secretLen).toString('utf8')
      }
    }
    
    return {
      appName,
      pairingSecret,
      publicKey: Buffer.alloc(65), // Mock
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

  private parseGetKvRecordsRequest(data: Buffer): string[] {
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

  private parseAddKvRecordsRequest(data: Buffer): Record<string, string> {
    const records: Record<string, string> = {}
    let offset = 0
    
    const numRecords = data.readUInt8(offset)
    offset += 1
    
    for (let i = 0; i < numRecords; i++) {
      const keyLen = data.readUInt8(offset)
      offset += 1
      
      const key = data.slice(offset, offset + keyLen).toString('utf8')
      offset += keyLen
      
      const valueLen = data.readUInt8(offset)
      offset += 1
      
      const value = data.slice(offset, offset + valueLen).toString('utf8')
      offset += valueLen
      
      records[key] = value
    }
    
    return records
  }

  private parseRemoveKvRecordsRequest(data: Buffer): string[] {
    return this.parseGetKvRecordsRequest(data) // Same format
  }

  // Response serialization methods (simplified for simulation)
  private serializeConnectResponse(data: any): Buffer {
    // Simplified serialization - in real implementation would follow exact protocol
    const response = Buffer.alloc(300)
    let offset = 0
    
    // Pairing status
    response.writeUInt8(data.isPaired ? 1 : 0, offset)
    offset += 1
    
    // Ephemeral public key
    data.ephemeralPub.copy(response, offset)
    offset += 65
    
    // Firmware version
    data.firmwareVersion.copy(response, offset)
    offset += 4
    
    return response.slice(0, offset)
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

  private serializeGetWalletsResponse(data: any): Buffer {
    // Simplified wallet serialization
    const response = Buffer.alloc(200)
    let offset = 0
    
    // Internal wallet
    data.internal.uid.copy(response, offset)
    offset += 32
    
    response.writeUInt8(data.internal.external ? 1 : 0, offset)
    offset += 1
    
    // External wallet
    data.external.uid.copy(response, offset + 32)
    offset += 32
    
    response.writeUInt8(data.external.external ? 1 : 0, offset)
    offset += 1
    
    return response.slice(0, offset)
  }

  private serializeKvRecordsResponse(data: Record<string, string>): Buffer {
    const records = Object.entries(data)
    const response = Buffer.alloc(records.length * 128) // Estimate
    let offset = 0
    
    response.writeUInt8(records.length, offset)
    offset += 1
    
    for (const [key, value] of records) {
      const keyBuf = Buffer.from(key, 'utf8')
      const valueBuf = Buffer.from(value, 'utf8')
      
      response.writeUInt8(keyBuf.length, offset)
      offset += 1
      keyBuf.copy(response, offset)
      offset += keyBuf.length
      
      response.writeUInt8(valueBuf.length, offset)
      offset += 1
      valueBuf.copy(response, offset)
      offset += valueBuf.length
    }
    
    return response.slice(0, offset)
  }
}
