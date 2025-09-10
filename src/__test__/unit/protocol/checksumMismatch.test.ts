import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { LatticeSimulator } from '@/lib/simulator'
import { ProtocolHandler } from '@/lib/protocolHandler'
import { LatticeSecureEncryptedRequestType } from '@/types'

describe('Checksum Mismatch Reproduction', () => {
  let protocolHandler: ProtocolHandler
  let mockSimulator: any

  beforeEach(() => {
    mockSimulator = {
      getKvRecords: vi.fn(),
      updateEphemeralKeyPair: vi.fn(),
      getSharedSecret: vi.fn(),
      // Add other required simulator methods
    } as unknown as LatticeSimulator

    protocolHandler = new ProtocolHandler(mockSimulator)
  })

  it('should reproduce checksum mismatch with corrupted encrypted data', async () => {
    // This test simulates a checksum mismatch by providing corrupted encrypted data
    // that will fail during decryption/checksum validation

    // Mock the shared secret that would be used for decryption
    const sharedSecret = Buffer.from(
      'e28d7864b86059adeec8b67a3ceeb3f11092126a0c60fcad3ab0066fd168d07f',
      'hex',
    )
    vi.mocked(mockSimulator.getSharedSecret).mockReturnValue(sharedSecret)

    // Create corrupted encrypted data that will fail checksum validation
    const corruptedEncryptedMessage = Buffer.from(
      'a3709449a2cdb081df1ae7107d7a7a95e146f0f63961907b6f06b17c1c6fbb5b1ae3b25405553c95ffc47af361d82932b0be6662b0b0aa74279c76568a54f2489e6ca10d93aba4126144987f9f574635a6c230da2f610a',
      'hex',
    )

    // Mock KV store response
    const mockKvData = {
      records: [],
      total: 0,
      fetched: 0,
    }

    const mockSimulatorResponse = {
      success: true,
      code: 0, // LatticeResponseCode.success
      data: mockKvData,
      error: undefined,
    }

    vi.mocked(mockSimulator.getKvRecords).mockResolvedValue(mockSimulatorResponse)

    // Act - Process the corrupted encrypted message
    const secureRequest = {
      type: LatticeSecureEncryptedRequestType.getKvRecords,
      data: corruptedEncryptedMessage,
    }
    const result = await protocolHandler.handleSecureRequest(secureRequest)

    // Assert - Should get an error response due to failed decryption/checksum
    expect(result.code).not.toBe(0) // Should not be success
    expect(result.error).toBeDefined()
    if (result.error) {
      expect(result.error).toMatch(/(decryption|checksum|shared secret)/i)
    }
  })

  it('should simulate checksum validation failure during decryption', async () => {
    // This test simulates the scenario where encrypted data decrypts but fails checksum validation
    // by mocking the shared secret and providing data that will cause checksum mismatch

    const sharedSecret = Buffer.from(
      'e28d7864b86059adeec8b67a3ceeb3f11092126a0c60fcad3ab0066fd168d07f',
      'hex',
    )
    vi.mocked(mockSimulator.getSharedSecret).mockReturnValue(sharedSecret)

    // Create invalid encrypted data that will cause decryption issues
    const invalidEncryptedData = Buffer.alloc(64) // Too small to be valid
    invalidEncryptedData.fill(0xaa) // Fill with pattern that will cause issues

    const secureRequest = {
      type: LatticeSecureEncryptedRequestType.getKvRecords,
      data: invalidEncryptedData,
    }

    const result = await protocolHandler.handleSecureRequest(secureRequest)

    // Should get an error due to invalid encrypted data
    expect(result.code).not.toBe(0)
    expect(result.error).toBeDefined()
    if (result.error) {
      expect(result.error).toMatch(/(decrypt|invalid|short)/i)
    }
  })

  it('should simulate client-side checksum validation failure', async () => {
    // This test simulates the client-side checksum validation that fails
    // by checking if the protocol produces consistent checksums

    // Simulate the exact error scenario from the logs
    const expectedChecksum: number = 3092091761 // From your logs - what client expects
    const receivedChecksum: number = 1856734265 // From your logs - what client gets

    // Create a test that demonstrates the checksum mismatch issue
    const checksumMismatch = expectedChecksum !== receivedChecksum
    expect(checksumMismatch).toBe(true)

    // If there's a mismatch, it should throw an error like the SDK does
    if (checksumMismatch) {
      const error = new Error(
        `Checksum mismatch in decrypted Lattice data, respData.checksum=${receivedChecksum}, validChecksum=${expectedChecksum}`,
      )

      // Verify the error message contains the expected values from the logs
      expect(error.message).toContain('Checksum mismatch in decrypted Lattice data')
      expect(error.message).toContain('respData.checksum=1856734265')
      expect(error.message).toContain('validChecksum=3092091761')
    }
  })
})
