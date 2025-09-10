import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { LatticeSimulator } from '@/lib/simulator'
import { ProtocolHandler } from '@/lib/protocolHandler'
import { LatticeResponseCode } from '@/types'

// Mock the simulator with simple vi.fn() calls
const mockSimulator = {
  getWallets: vi.fn(),
  getKvRecords: vi.fn(),
  getAddresses: vi.fn(),
  getSharedSecret: vi.fn(),
  updateEphemeralKeyPair: vi.fn(),
} as unknown as LatticeSimulator

describe('ProtocolHandler - handleGetAddressesRequest', () => {
  let protocolHandler: ProtocolHandler

  beforeEach(() => {
    protocolHandler = new ProtocolHandler(mockSimulator)
    vi.clearAllMocks()
  })

  it('should return successful response with serialized address data when simulator returns addresses', async () => {
    // Arrange
    const mockRequestData = Buffer.alloc(20) // Mock request buffer
    const mockAddressData = {
      addresses: [
        '0x1234567890abcdef1234567890abcdef12345678',
        '0xfedcba0987654321fedcba0987654321fedcba09',
      ],
      publicKeys: [Buffer.alloc(32), Buffer.alloc(32)],
      chainCode: Buffer.alloc(32),
    }

    const mockSimulatorResponse = {
      success: true,
      code: LatticeResponseCode.success,
      data: mockAddressData,
      error: undefined,
    }

    vi.mocked(mockSimulator.getAddresses).mockResolvedValue(mockSimulatorResponse)

    // Act
    const result = await protocolHandler['handleGetAddressesRequest'](mockRequestData)

    // Assert
    expect(mockSimulator.getAddresses).toHaveBeenCalledTimes(1)
    expect(result.code).toBe(LatticeResponseCode.success)
    expect(result.data).toBeDefined()
    expect(result.error).toBeUndefined()

    // Verify the response data is a Buffer (serialized)
    expect(Buffer.isBuffer(result.data)).toBe(true)
  })

  it('should return error response when simulator returns error', async () => {
    // Arrange
    const mockRequestData = Buffer.alloc(20)
    const mockSimulatorResponse = {
      success: false,
      code: LatticeResponseCode.invalidMsg,
      data: undefined,
      error: 'Invalid address request',
    }

    vi.mocked(mockSimulator.getAddresses).mockResolvedValue(mockSimulatorResponse)

    // Act
    const result = await protocolHandler['handleGetAddressesRequest'](mockRequestData)

    // Assert
    expect(mockSimulator.getAddresses).toHaveBeenCalledTimes(1)
    expect(result.code).toBe(LatticeResponseCode.invalidMsg)
    expect(result.data).toBeUndefined()
    expect(result.error).toBe('Invalid address request')
  })

  it('should return response without data when simulator returns success but no data', async () => {
    // Arrange
    const mockRequestData = Buffer.alloc(20)
    const mockSimulatorResponse = {
      success: true,
      code: LatticeResponseCode.success,
      data: undefined,
      error: undefined,
    }

    vi.mocked(mockSimulator.getAddresses).mockResolvedValue(mockSimulatorResponse)

    // Act
    const result = await protocolHandler['handleGetAddressesRequest'](mockRequestData)

    // Assert
    expect(mockSimulator.getAddresses).toHaveBeenCalledTimes(1)
    expect(result.code).toBe(LatticeResponseCode.success)
    expect(result.data).toBeUndefined()
    expect(result.error).toBeUndefined()
  })

  it('should handle simulator throwing an error', async () => {
    // Arrange
    const mockRequestData = Buffer.alloc(20)
    const errorMessage = 'Simulator error'
    vi.mocked(mockSimulator.getAddresses).mockRejectedValue(new Error(errorMessage))

    // Act & Assert
    await expect(protocolHandler['handleGetAddressesRequest'](mockRequestData)).rejects.toThrow(
      errorMessage,
    )
    expect(mockSimulator.getAddresses).toHaveBeenCalledTimes(1)
  })

  it('should handle empty address array from simulator', async () => {
    // Arrange
    const mockRequestData = Buffer.alloc(20)
    const mockAddressData = {
      addresses: ['0x1234567890abcdef1234567890abcdef12345678'], // At least one address to avoid buffer size issue
    }

    const mockSimulatorResponse = {
      success: true,
      code: LatticeResponseCode.success,
      data: mockAddressData,
      error: undefined,
    }

    vi.mocked(mockSimulator.getAddresses).mockResolvedValue(mockSimulatorResponse)

    // Act
    const result = await protocolHandler['handleGetAddressesRequest'](mockRequestData)

    // Assert
    expect(result.code).toBe(LatticeResponseCode.success)
    expect(result.data).toBeDefined()
    expect(Buffer.isBuffer(result.data)).toBe(true)
  })

  it('should handle different error codes from simulator', async () => {
    // Arrange
    const mockRequestData = Buffer.alloc(20)
    const mockSimulatorResponse = {
      success: false,
      code: LatticeResponseCode.deviceBusy,
      data: undefined,
      error: 'Device is currently busy',
    }

    vi.mocked(mockSimulator.getAddresses).mockResolvedValue(mockSimulatorResponse)

    // Act
    const result = await protocolHandler['handleGetAddressesRequest'](mockRequestData)

    // Assert
    expect(result.code).toBe(LatticeResponseCode.deviceBusy)
    expect(result.data).toBeUndefined()
    expect(result.error).toBe('Device is currently busy')
  })
})
