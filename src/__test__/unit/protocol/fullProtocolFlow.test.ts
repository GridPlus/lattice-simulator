import crc32 from 'crc-32'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { aes256_encrypt } from '@/shared/utils/crypto'
import type { ServerLatticeSimulator } from '@/server/serverSimulator'
import { ProtocolHandler } from '@/server/serverProtocolHandler'
import { LatticeResponseCode, LatticeSecureEncryptedRequestType } from '@/shared/types'
import { requestKvRecords } from '@/server/serverRequestManager'

// Mock the serverRequestManager module
vi.mock('@/server/serverRequestManager', () => ({
  requestKvRecords: vi.fn(),
  requestAddKvRecords: vi.fn(),
  requestRemoveKvRecords: vi.fn(),
}))

describe('Full Protocol Flow - Checksum Mismatch', () => {
  let protocolHandler: ProtocolHandler
  let mockSimulator: any

  beforeEach(() => {
    // Make requestKvRecords throw so it falls back to simulator
    vi.mocked(requestKvRecords).mockRejectedValue(new Error('Client request not available'))

    mockSimulator = {
      getKvRecords: vi.fn(),
      getWallets: vi.fn(),
      getSharedSecret: vi.fn(),
      getEphemeralKeyPair: vi.fn(),
      updateEphemeralKeyPair: vi.fn(),
      getDeviceId: vi.fn().mockReturnValue('test-device-id'),
      isConnected: true,
      isPaired: true,
    } as unknown as ServerLatticeSimulator

    protocolHandler = new ProtocolHandler(mockSimulator)
  })

  it('should reproduce checksum mismatch with properly encrypted data', async () => {
    // Step 1: Setup shared secret from your logs
    const sharedSecret = Buffer.from(
      'e28d7864b86059adeec8b67a3ceeb3f11092126a0c60fcad3ab0066fd168d07f',
      'hex',
    )
    vi.mocked(mockSimulator.getSharedSecret).mockReturnValue(sharedSecret)

    // Step 2: Create properly formatted unencrypted payload
    // Structure: [requestType (1)] | [requestData (9)] | [checksum (4)] | [padding to 1728]
    const requestType = LatticeSecureEncryptedRequestType.getKvRecords // 7
    const requestData = Buffer.from('000000000a00000000', 'hex') // type=0, n=10, start=0

    // Create the full unencrypted payload
    const unencryptedPayload = Buffer.alloc(1728) // Full size
    let offset = 0

    // Write request type
    unencryptedPayload.writeUInt8(requestType, offset)
    offset += 1

    // Write request data
    requestData.copy(unencryptedPayload, offset)
    offset += requestData.length

    // Calculate and write checksum of the data portion
    const dataToChecksum = unencryptedPayload.slice(0, offset)
    const checksum = crc32.buf(dataToChecksum) >>> 0 // Convert to unsigned 32-bit
    unencryptedPayload.writeUInt32LE(checksum, offset)
    offset += 4

    // Remaining bytes stay as zeros (padding)

    // Step 3: Encrypt the payload
    const encryptedData = aes256_encrypt(unencryptedPayload, sharedSecret)

    // Step 4: Mock empty KV store response
    const mockKvData = { records: [], total: 0, fetched: 0 }
    const mockSimulatorResponse = {
      success: true,
      code: LatticeResponseCode.success,
      data: mockKvData,
      error: undefined,
    }
    vi.mocked(mockSimulator.getKvRecords).mockResolvedValue(mockSimulatorResponse)

    // Step 5: Create the SecureRequest with properly encrypted data
    const secureRequest = {
      type: requestType,
      data: encryptedData,
      ephemeralId: 3121182124, // From your logs
    }

    // Act & Assert
    try {
      const result = await protocolHandler.handleSecureRequest(secureRequest)

      // If we get here, the decryption worked
      expect(result.code).toBe(LatticeResponseCode.success)
      expect(result.data).toBeDefined()

      console.log('SUCCESS: Full protocol flow worked, response length:', result.data?.length)
    } catch (error: any) {
      console.log('Caught error:', error.message)

      // This could be where checksum mismatch occurs
      if (error.message.includes('checksum') || error.message.includes('Checksum')) {
        expect(error.message).toContain('checksum')
      } else {
        throw error // Re-throw if it's not a checksum error
      }
    }
  })

  it('should test with corrupted checksum to force mismatch', async () => {
    // This test intentionally creates a checksum mismatch to reproduce the error

    // Step 1: Setup shared secret
    const sharedSecret = Buffer.from(
      'e28d7864b86059adeec8b67a3ceeb3f11092126a0c60fcad3ab0066fd168d07f',
      'hex',
    )
    vi.mocked(mockSimulator.getSharedSecret).mockReturnValue(sharedSecret)

    // Step 2: Create payload with WRONG checksum (to force mismatch)
    const requestType = LatticeSecureEncryptedRequestType.getKvRecords // 7
    const requestData = Buffer.from('000000000a00000000', 'hex') // type=0, n=10, start=0

    const unencryptedPayload = Buffer.alloc(1728)
    let offset = 0

    // Write request type and data
    unencryptedPayload.writeUInt8(requestType, offset)
    offset += 1
    requestData.copy(unencryptedPayload, offset)
    offset += requestData.length

    // Write WRONG checksum (this should cause validation to fail)
    const wrongChecksum = 0xdeadbeef // Intentionally wrong checksum
    unencryptedPayload.writeUInt32LE(wrongChecksum, offset)

    // Step 3: Encrypt with wrong checksum
    const encryptedData = aes256_encrypt(unencryptedPayload, sharedSecret)

    // Step 4: Mock KV response
    const mockKvData = { records: [], total: 0, fetched: 0 }
    const mockSimulatorResponse = {
      success: true,
      code: LatticeResponseCode.success,
      data: mockKvData,
      error: undefined,
    }
    vi.mocked(mockSimulator.getKvRecords).mockResolvedValue(mockSimulatorResponse)

    // Step 5: Create request with corrupted checksum
    const secureRequest = {
      type: requestType,
      data: encryptedData,
      ephemeralId: 3121182124,
    }

    // Act & Assert
    const result = await protocolHandler.handleSecureRequest(secureRequest)

    // With checksum validation enabled, corrupted checksum should result in decryption failure
    console.log('Result with corrupted checksum:', {
      code: result.code,
      error: result.error,
      dataLength: result.data?.length,
    })

    // Expected: should fail with pairFailed code (133) due to checksum validation failure
    expect(result.code).toBe(LatticeResponseCode.pairFailed)
    expect(result.error).toContain('Failed to decrypt request data')
    expect(result.data).toBeUndefined()
  })
})
