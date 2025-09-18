import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ProtocolHandler } from '@/server/serverProtocolHandler'
import { LatticeResponseCode } from '@/shared/types'
import type { ServerLatticeSimulator as LatticeSimulator } from '@/server/serverSimulator'

// Mock the server request manager to avoid network calls
vi.mock('@/server/serverRequestManager', () => ({
  requestKvRecords: vi.fn(() => Promise.reject(new Error('Mocked network failure'))),
  requestAddKvRecords: vi.fn(() => Promise.reject(new Error('Mocked network failure'))),
  requestRemoveKvRecords: vi.fn(() => Promise.reject(new Error('Mocked network failure'))),
}))

describe('ProtocolHandler - handleRemoveKvRecordsRequest', () => {
  let protocolHandler: ProtocolHandler
  let mockSimulator: LatticeSimulator

  beforeEach(() => {
    // Create mock simulator with required methods
    mockSimulator = {
      removeKvRecords: vi.fn(),
      getSharedSecret: vi.fn(),
      updateEphemeralKeyPair: vi.fn(),
      getDeviceId: vi.fn().mockReturnValue('test-device-id'),
    } as unknown as LatticeSimulator

    protocolHandler = new ProtocolHandler(mockSimulator)
  })

  describe('parseRemoveKvRecordsRequest', () => {
    it('should correctly parse a valid removeKvRecords request', () => {
      // Create test data matching SDK format: [type (4 bytes LE)] + [numIds (1 byte)] + [ids... (4 bytes each LE)]
      const testData = Buffer.alloc(13) // 4 + 1 + 2*4 = 13 bytes
      testData.writeUInt32LE(1, 0) // type = 1
      testData.writeUInt8(2, 4) // numIds = 2
      testData.writeUInt32LE(100, 5) // id1 = 100
      testData.writeUInt32LE(200, 9) // id2 = 200

      const result = protocolHandler['parseRemoveKvRecordsRequest'](testData)

      expect(result).toEqual({
        type: 1,
        ids: [100, 200],
      })
    })

    it('should handle single ID removal request', () => {
      const testData = Buffer.alloc(9) // 4 + 1 + 1*4 = 9 bytes
      testData.writeUInt32LE(0, 0) // type = 0
      testData.writeUInt8(1, 4) // numIds = 1
      testData.writeUInt32LE(42, 5) // id = 42

      const result = protocolHandler['parseRemoveKvRecordsRequest'](testData)

      expect(result).toEqual({
        type: 0,
        ids: [42],
      })
    })

    it('should handle maximum number of IDs', () => {
      const maxIds = 10 // kvRemoveMaxNum from firmware constants
      const testData = Buffer.alloc(5 + maxIds * 4) // 4 + 1 + 10*4 = 45 bytes
      testData.writeUInt32LE(2, 0) // type = 2
      testData.writeUInt8(maxIds, 4) // numIds = 10

      for (let i = 0; i < maxIds; i++) {
        testData.writeUInt32LE(1000 + i, 5 + i * 4) // ids = 1000, 1001, ..., 1009
      }

      const result = protocolHandler['parseRemoveKvRecordsRequest'](testData)

      expect(result.type).toBe(2)
      expect(result.ids).toHaveLength(maxIds)
      expect(result.ids[0]).toBe(1000)
      expect(result.ids[maxIds - 1]).toBe(1000 + maxIds - 1)
    })

    it('should throw error for insufficient data', () => {
      const testData = Buffer.alloc(4) // Only 4 bytes (type), missing numIds and ids
      testData.writeUInt32LE(0, 0)

      expect(() => {
        protocolHandler['parseRemoveKvRecordsRequest'](testData)
      }).toThrow('Invalid removeKvRecords request: insufficient data')
    })

    it('should throw error for data length mismatch', () => {
      const testData = Buffer.alloc(10) // 4 + 1 + 1*4 = 9 bytes needed, but we have 10
      testData.writeUInt32LE(0, 0) // type = 0
      testData.writeUInt8(2, 4) // numIds = 2 (claims 2 ids)
      testData.writeUInt32LE(100, 5) // id1 = 100
      // Missing second ID, but buffer is 10 bytes

      expect(() => {
        protocolHandler['parseRemoveKvRecordsRequest'](testData)
      }).toThrow('Invalid removeKvRecords request: expected 13 bytes, got 10')
    })

    it('should handle zero IDs gracefully', () => {
      const testData = Buffer.alloc(5) // 4 + 1 + 0*4 = 5 bytes
      testData.writeUInt32LE(0, 0) // type = 0
      testData.writeUInt8(0, 4) // numIds = 0

      const result = protocolHandler['parseRemoveKvRecordsRequest'](testData)

      expect(result).toEqual({
        type: 0,
        ids: [],
      })
    })
  })

  describe('handleRemoveKvRecordsRequest', () => {
    it('should successfully remove KV records', async () => {
      // Mock successful response
      const mockSimulatorResponse = {
        code: LatticeResponseCode.success,
        success: true,
        error: undefined,
      }
      vi.mocked(mockSimulator.removeKvRecords).mockResolvedValue(mockSimulatorResponse)

      // Create test request data
      const requestData = Buffer.alloc(9)
      requestData.writeUInt32LE(0, 0) // type = 0
      requestData.writeUInt8(1, 4) // numIds = 1
      requestData.writeUInt32LE(42, 5) // id = 42

      const result = await protocolHandler['handleRemoveKvRecordsRequest'](requestData)

      expect(result.code).toBe(LatticeResponseCode.success)
      expect(result.data).toEqual(Buffer.alloc(0)) // Success response has no data
      expect(result.error).toBeUndefined()
      expect(mockSimulator.removeKvRecords).toHaveBeenCalledWith(0, [42])
    })

    it('should handle multiple ID removal', async () => {
      const mockSimulatorResponse = {
        code: LatticeResponseCode.success,
        success: true,
        error: undefined,
      }
      vi.mocked(mockSimulator.removeKvRecords).mockResolvedValue(mockSimulatorResponse)

      const requestData = Buffer.alloc(13)
      requestData.writeUInt32LE(1, 0) // type = 1
      requestData.writeUInt8(2, 4) // numIds = 2
      requestData.writeUInt32LE(100, 5) // id1 = 100
      requestData.writeUInt32LE(200, 9) // id2 = 200

      const result = await protocolHandler['handleRemoveKvRecordsRequest'](requestData)

      expect(result.code).toBe(LatticeResponseCode.success)
      expect(result.data).toEqual(Buffer.alloc(0))
      expect(mockSimulator.removeKvRecords).toHaveBeenCalledWith(1, [100, 200])
    })

    it('should handle simulator failure', async () => {
      const mockSimulatorResponse = {
        code: LatticeResponseCode.internalError,
        success: false,
        error: 'Simulator error',
      }
      vi.mocked(mockSimulator.removeKvRecords).mockResolvedValue(mockSimulatorResponse)

      const requestData = Buffer.alloc(9)
      requestData.writeUInt32LE(0, 0)
      requestData.writeUInt8(1, 4)
      requestData.writeUInt32LE(42, 5)

      const result = await protocolHandler['handleRemoveKvRecordsRequest'](requestData)

      expect(result.code).toBe(LatticeResponseCode.internalError)
      expect(result.data).toBeUndefined()
      expect(result.error).toBe('Simulator error')
    })

    it('should handle simulator throwing error', async () => {
      const errorMessage = 'Simulator crashed'
      vi.mocked(mockSimulator.removeKvRecords).mockRejectedValue(new Error(errorMessage))

      const requestData = Buffer.alloc(9)
      requestData.writeUInt32LE(0, 0)
      requestData.writeUInt8(1, 4)
      requestData.writeUInt32LE(42, 5)

      await expect(protocolHandler['handleRemoveKvRecordsRequest'](requestData)).rejects.toThrow(
        errorMessage,
      )
    })

    it('should handle empty IDs array', async () => {
      const mockSimulatorResponse = {
        code: LatticeResponseCode.success,
        success: true,
        error: undefined,
      }
      vi.mocked(mockSimulator.removeKvRecords).mockResolvedValue(mockSimulatorResponse)

      const requestData = Buffer.alloc(5)
      requestData.writeUInt32LE(0, 0)
      requestData.writeUInt8(0, 4) // numIds = 0

      const result = await protocolHandler['handleRemoveKvRecordsRequest'](requestData)

      expect(result.code).toBe(LatticeResponseCode.success)
      expect(result.data).toEqual(Buffer.alloc(0))
      expect(mockSimulator.removeKvRecords).toHaveBeenCalledWith(0, [])
    })

    it('should handle different record types', async () => {
      const mockSimulatorResponse = {
        code: LatticeResponseCode.success,
        success: true,
        error: undefined,
      }
      vi.mocked(mockSimulator.removeKvRecords).mockResolvedValue(mockSimulatorResponse)

      const requestData = Buffer.alloc(9)
      requestData.writeUInt32LE(5, 0) // type = 5 (custom type)
      requestData.writeUInt8(1, 4) // numIds = 1
      requestData.writeUInt32LE(999, 5) // id = 999

      const result = await protocolHandler['handleRemoveKvRecordsRequest'](requestData)

      expect(result.code).toBe(LatticeResponseCode.success)
      expect(mockSimulator.removeKvRecords).toHaveBeenCalledWith(5, [999])
    })
  })
})
