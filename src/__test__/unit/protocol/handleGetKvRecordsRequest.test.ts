import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ProtocolHandler } from '@/lib/protocolHandler'
import { LatticeResponseCode } from '@/types'
import { LatticeSimulator } from '@/lib/simulator'

// Mock the simulator with simple vi.fn() calls
const mockSimulator = {
  getWallets: vi.fn(),
  getKvRecords: vi.fn(),
  getSharedSecret: vi.fn(),
  updateEphemeralKeyPair: vi.fn(),
} as unknown as LatticeSimulator

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
      code: LatticeResponseCode.success,
      data: mockKvData,
      error: undefined
    }

    mockSimulator.getKvRecords.mockResolvedValue(mockSimulatorResponse)

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
})