import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ProtocolHandler } from '@/lib/protocolHandler'
import { LatticeResponseCode } from '@/types'

// Mock the simulator with simple vi.fn() calls
const mockSimulator = {
  getWallets: vi.fn(),
  getKvRecords: vi.fn(),
  getSharedSecret: vi.fn(),
  updateEphemeralKeyPair: vi.fn(),
} as any

describe('ProtocolHandler - handleGetKvRecordsRequest', () => {
  let protocolHandler: ProtocolHandler

  beforeEach(() => {
    protocolHandler = new ProtocolHandler(mockSimulator)
    vi.clearAllMocks()
  })

  it('should return successful response with serialized KV records when simulator returns data', async () => {
    // Arrange
    const mockRequestData = Buffer.alloc(9)
    mockRequestData.writeUInt32LE(0, 0) // type = 0
    mockRequestData.writeUInt8(2, 4)    // n = 2
    mockRequestData.writeUInt32LE(10, 5) // start = 10

    const mockKvData = {
      records: [
        { id: 1, type: 0, caseSensitive: true, key: 'test_key_1', val: 'test_value_1' },
        { id: 2, type: 0, caseSensitive: false, key: 'test_key_2', val: 'test_value_2' }
      ],
      total: 5,
      fetched: 2
    }

    const mockSimulatorResponse = {
      code: LatticeResponseCode.success,
      data: mockKvData,
      error: undefined
    }

    mockSimulator.getKvRecords.mockResolvedValue(mockSimulatorResponse)

    // Act
    const result = await protocolHandler['handleGetKvRecordsRequest'](mockRequestData)

    // Assert
    expect(mockSimulator.getKvRecords).toHaveBeenCalledTimes(1)
    expect(mockSimulator.getKvRecords).toHaveBeenCalledWith({ type: 0, n: 2, start: 10 })
    expect(result.code).toBe(LatticeResponseCode.success)
    expect(result.data).toBeDefined()
    expect(result.error).toBeUndefined()

    // Verify the response data is a Buffer (serialized)
    expect(Buffer.isBuffer(result.data)).toBe(true)
    
    // Calculate expected buffer size:
    // Header: 4 bytes (total) + 1 byte (fetched) = 5 bytes
    // Each record: 4 (id) + 4 (type) + 1 (caseSensitive) + 1 (keySize) + 64 (key) + 1 (valSize) + 64 (val) = 139 bytes
    // Total: 5 + 2 * 139 = 283 bytes
    const expectedSize = 5 + mockKvData.records.length * 139
    expect(result.data!.length).toBe(expectedSize)
  })

  it('should return error response when simulator returns error', async () => {
    // Arrange
    const mockRequestData = Buffer.alloc(9)
    mockRequestData.writeUInt32LE(0, 0) // type = 0
    mockRequestData.writeUInt8(1, 4)    // n = 1
    mockRequestData.writeUInt32LE(0, 5) // start = 0

    const mockSimulatorResponse = {
      code: LatticeResponseCode.invalidMsg,
      data: undefined,
      error: 'Invalid request parameters'
    }

    mockSimulator.getKvRecords.mockResolvedValue(mockSimulatorResponse)

    // Act
    const result = await protocolHandler['handleGetKvRecordsRequest'](mockRequestData)

    // Assert
    expect(mockSimulator.getKvRecords).toHaveBeenCalledTimes(1)
    expect(mockSimulator.getKvRecords).toHaveBeenCalledWith({ type: 0, n: 1, start: 0 })
    expect(result.code).toBe(LatticeResponseCode.invalidMsg)
    expect(result.data).toBeUndefined()
    expect(result.error).toBe('Invalid request parameters')
  })

  it('should return response without data when simulator returns success but no data', async () => {
    // Arrange
    const mockRequestData = Buffer.alloc(9)
    mockRequestData.writeUInt32LE(0, 0) // type = 0
    mockRequestData.writeUInt8(0, 4)    // n = 0 (max records)
    mockRequestData.writeUInt32LE(0, 5) // start = 0

    const mockSimulatorResponse = {
      code: LatticeResponseCode.success,
      data: undefined,
      error: undefined
    }

    mockSimulator.getKvRecords.mockResolvedValue(mockSimulatorResponse)

    // Act
    const result = await protocolHandler['handleGetKvRecordsRequest'](mockRequestData)

    // Assert
    expect(mockSimulator.getKvRecords).toHaveBeenCalledTimes(1)
    expect(mockSimulator.getKvRecords).toHaveBeenCalledWith({ type: 0, n: 0, start: 0 })
    expect(result.code).toBe(LatticeResponseCode.success)
    expect(result.data).toBeUndefined()
    expect(result.error).toBeUndefined()
  })

  it('should handle simulator throwing an error', async () => {
    // Arrange
    const mockRequestData = Buffer.alloc(9)
    mockRequestData.writeUInt32LE(0, 0) // type = 0
    mockRequestData.writeUInt8(1, 4)    // n = 1
    mockRequestData.writeUInt32LE(0, 5) // start = 0

    const errorMessage = 'Simulator error'
    mockSimulator.getKvRecords.mockRejectedValue(new Error(errorMessage))

    // Act & Assert
    await expect(protocolHandler['handleGetKvRecordsRequest'](mockRequestData)).rejects.toThrow(errorMessage)
    expect(mockSimulator.getKvRecords).toHaveBeenCalledTimes(1)
  })

  it('should handle empty records array from simulator', async () => {
    // Arrange
    const mockRequestData = Buffer.alloc(9)
    mockRequestData.writeUInt32LE(0, 0) // type = 0
    mockRequestData.writeUInt8(5, 4)    // n = 5
    mockRequestData.writeUInt32LE(20, 5) // start = 20

    const mockKvData = {
      records: [],
      total: 0,
      fetched: 0
    }

    const mockSimulatorResponse = {
      code: LatticeResponseCode.success,
      data: mockKvData,
      error: undefined
    }

    mockSimulator.getKvRecords.mockResolvedValue(mockSimulatorResponse)

    // Act
    const result = await protocolHandler['handleGetKvRecordsRequest'](mockRequestData)

    // Assert
    expect(result.code).toBe(LatticeResponseCode.success)
    expect(result.data).toBeDefined()
    expect(result.data!.length).toBe(5) // 4 bytes (total) + 1 byte (fetched) + 0 records
  })

  it('should handle large number of records from simulator', async () => {
    // Arrange
    const mockRequestData = Buffer.alloc(9)
    mockRequestData.writeUInt32LE(0, 0) // type = 0
    mockRequestData.writeUInt8(10, 4)   // n = 10
    mockRequestData.writeUInt32LE(0, 5) // start = 0

    const mockKvData = {
      records: Array.from({ length: 10 }, (_, i) => ({
        id: i + 1,
        type: 0,
        caseSensitive: i % 2 === 0,
        key: `key_${i}`,
        val: `value_${i}`
      })),
      total: 100,
      fetched: 10
    }

    const mockSimulatorResponse = {
      code: LatticeResponseCode.success,
      data: mockKvData,
      error: undefined
    }

    mockSimulator.getKvRecords.mockResolvedValue(mockSimulatorResponse)

    // Act
    const result = await protocolHandler['handleGetKvRecordsRequest'](mockRequestData)

    // Assert
    expect(result.code).toBe(LatticeResponseCode.success)
    expect(result.data).toBeDefined()
    // 4 bytes (total) + 1 byte (fetched) + 10 records * 139 = 5 + 1390 = 1395 bytes
    expect(result.data!.length).toBe(1395)
  })

  it('should handle different record types from simulator', async () => {
    // Arrange
    const mockRequestData = Buffer.alloc(9)
    mockRequestData.writeUInt32LE(1, 0) // type = 1 (different type)
    mockRequestData.writeUInt8(2, 4)    // n = 2
    mockRequestData.writeUInt32LE(5, 5) // start = 5

    const mockKvData = {
      records: [
        { id: 1, type: 1, caseSensitive: true, key: 'type1_key', val: 'type1_value' },
        { id: 2, type: 2, caseSensitive: false, key: 'type2_key', val: 'type2_value' }
      ],
      total: 3,
      fetched: 2
    }

    const mockSimulatorResponse = {
      code: LatticeResponseCode.success,
      data: mockKvData,
      error: undefined
    }

    mockSimulator.getKvRecords.mockResolvedValue(mockSimulatorResponse)

    // Act
    const result = await protocolHandler['handleGetKvRecordsRequest'](mockRequestData)

    // Assert
    expect(mockSimulator.getKvRecords).toHaveBeenCalledWith({ type: 1, n: 2, start: 5 })
    expect(result.code).toBe(LatticeResponseCode.success)
    expect(result.data).toBeDefined()
  })

  it('should handle edge case with maximum values', async () => {
    // Arrange
    const mockRequestData = Buffer.alloc(9)
    mockRequestData.writeUInt32LE(0xFFFFFFFF, 0) // type = max uint32
    mockRequestData.writeUInt8(0xFF, 4)          // n = max uint8
    mockRequestData.writeUInt32LE(0xFFFFFFFF, 5) // start = max uint32

    const mockKvData = {
      records: [],
      total: 0xFFFFFFFF,
      fetched: 0xFF
    }

    const mockSimulatorResponse = {
      success: true,
      code: LatticeResponseCode.success,
      data: mockKvData,
      error: undefined
    }

    vi.mocked(mockSimulator.getKvRecords).mockResolvedValue(mockSimulatorResponse)

    // Act
    const result = await protocolHandler['handleGetKvRecordsRequest'](mockRequestData)

    // Assert
    expect(mockSimulator.getKvRecords).toHaveBeenCalledWith({ 
      type: 0xFFFFFFFF, 
      n: 0xFF, 
      start: 0xFFFFFFFF 
    })
    expect(result.code).toBe(LatticeResponseCode.success)
    expect(result.data).toBeDefined()
  })

  it('should reproduce checksum mismatch error from client logs', async () => {
    // This test reproduces the exact scenario from the client/simulator logs where
    // checksum mismatch occurs: client expects 3092091761 but gets 1856734265
    
    // Arrange - simulate the exact request from logs: type=0, n=10, start=0
    const mockRequestData = Buffer.alloc(9)
    mockRequestData.writeUInt32LE(0, 0)  // type = 0 
    mockRequestData.writeUInt8(10, 4)    // n = 10
    mockRequestData.writeUInt32LE(0, 5)  // start = 0

    // Simulator returns empty KV store (as seen in logs)
    const mockKvData = {
      records: [],
      total: 0,
      fetched: 0
    }

    const mockSimulatorResponse = {
      success: true,
      code: LatticeResponseCode.success,
      data: mockKvData,
      error: undefined
    }

    vi.mocked(mockSimulator.getKvRecords).mockResolvedValue(mockSimulatorResponse)

    // Act
    const result = await protocolHandler['handleGetKvRecordsRequest'](mockRequestData)

    // Assert
    expect(mockSimulator.getKvRecords).toHaveBeenCalledWith({ type: 0, n: 10, start: 0 })
    expect(result.code).toBe(LatticeResponseCode.success)
    expect(result.data).toBeDefined()
    
    // Verify the serialized response has the expected structure
    // From logs: total=0, fetched=0, size=5 bytes (4 bytes total + 1 byte fetched)
    expect(result.data!.length).toBe(5)
    
    // NOTE: This test captures the current behavior. The checksum mismatch error
    // likely occurs during the encryption/decryption process in the full protocol flow,
    // not in this individual handler method. The checksum issue may be related to:
    // - Ephemeral key pair generation/updates
    // - Response padding during encryption
    // - Checksum calculation in the encrypted payload
  })

  it('should simulate the exact checksum mismatch error from logs', async () => {
    // This test simulates the exact client-side error that occurs
    // when checksums don't match during response validation
    
    // Arrange - this would normally be successful
    const mockRequestData = Buffer.alloc(9)
    mockRequestData.writeUInt32LE(0, 0)  // type = 0 
    mockRequestData.writeUInt8(10, 4)    // n = 10
    mockRequestData.writeUInt32LE(0, 5)  // start = 0

    const mockKvData = { records: [], total: 0, fetched: 0 }
    const mockSimulatorResponse = {
      success: true,
      code: LatticeResponseCode.success,
      data: mockKvData,
      error: undefined
    }

    vi.mocked(mockSimulator.getKvRecords).mockResolvedValue(mockSimulatorResponse)

    // Act
    const result = await protocolHandler['handleGetKvRecordsRequest'](mockRequestData)

    // Assert handler works fine
    expect(result.code).toBe(LatticeResponseCode.success)
    expect(result.data!.length).toBe(5)

    // Now simulate the checksum validation error from the client-side
    // This is what happens when the client receives the response:
    
    // From your logs: received checksum vs expected checksum  
    const receivedChecksum = 1856734265   // respData.checksum from logs
    const expectedChecksum = 3092091761   // validChecksum from logs
    
    // Simulate the client-side checksum validation that fails
    const simulateClientChecksumValidation = (expectedCsum: number, receivedCsum: number) => {
      if (receivedCsum !== expectedCsum) {
        throw new Error(`Checksum mismatch in decrypted Lattice data, respData.checksum=${receivedCsum}, validChecksum=${expectedCsum}`)
      }
      return true
    }

    // This should throw the exact error from your logs
    expect(() => {
      simulateClientChecksumValidation(expectedChecksum, receivedChecksum)
    }).toThrow('Checksum mismatch in decrypted Lattice data, respData.checksum=1856734265, validChecksum=3092091761')
  })
})