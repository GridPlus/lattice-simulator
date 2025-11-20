import { ProtocolHandler } from '@/server/protocolHandler'
import { LatticeResponseCode } from '@/shared/types'

// Mock the simulator with simple vi.fn() calls
const mockSimulator = {
  getWallets: vi.fn(),
  getKvRecords: vi.fn(),
  getSharedSecret: vi.fn(),
  updateEphemeralKeyPair: vi.fn(),
  getDeviceId: vi.fn().mockReturnValue('test-device-id'),
} as any

describe('ProtocolHandler - handleGetWalletsRequest', () => {
  let protocolHandler: ProtocolHandler

  beforeEach(() => {
    protocolHandler = new ProtocolHandler(mockSimulator)
    vi.clearAllMocks()
  })

  it('should return successful response with serialized wallet data when simulator returns wallets', async () => {
    // Arrange
    const mockWalletData = {
      internal: {
        uid: '1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
        capabilities: 0x01,
        name: 'Internal Wallet',
      },
      external: {
        uid: 'fedcba0987654321fedcba0987654321fedcba0987654321fedcba0987654321',
        capabilities: 0x02,
        name: 'External Wallet',
      },
    }

    const mockSimulatorResponse = {
      code: LatticeResponseCode.success,
      data: mockWalletData,
      error: undefined,
    }

    mockSimulator.getWallets.mockResolvedValue(mockSimulatorResponse)

    // Act
    const result = await protocolHandler['handleGetWalletsRequest']()

    // Assert
    expect(mockSimulator.getWallets).toHaveBeenCalledTimes(1)
    expect(result.code).toBe(LatticeResponseCode.success)
    expect(result.data).toBeDefined()
    expect(result.error).toBeUndefined()

    // Verify the response data is a Buffer (serialized)
    expect(Buffer.isBuffer(result.data)).toBe(true)

    // Verify the buffer size (71 bytes per wallet * 2 wallets = 142 bytes)
    expect(result.data!.length).toBe(142)
  })

  it('should return error response when simulator returns error', async () => {
    // Arrange
    const mockSimulatorResponse = {
      code: LatticeResponseCode.deviceBusy,
      data: undefined,
      error: 'Device is busy',
    }

    mockSimulator.getWallets.mockResolvedValue(mockSimulatorResponse)

    // Act
    const result = await protocolHandler['handleGetWalletsRequest']()

    // Assert
    expect(mockSimulator.getWallets).toHaveBeenCalledTimes(1)
    expect(result.code).toBe(LatticeResponseCode.deviceBusy)
    expect(result.data).toBeUndefined()
    expect(result.error).toBe('Device is busy')
  })

  it('should return response without data when simulator returns success but no data', async () => {
    // Arrange
    const mockSimulatorResponse = {
      code: LatticeResponseCode.success,
      data: undefined,
      error: undefined,
    }

    mockSimulator.getWallets.mockResolvedValue(mockSimulatorResponse)

    // Act
    const result = await protocolHandler['handleGetWalletsRequest']()

    // Assert
    expect(mockSimulator.getWallets).toHaveBeenCalledTimes(1)
    expect(result.code).toBe(LatticeResponseCode.success)
    expect(result.data).toBeUndefined()
    expect(result.error).toBeUndefined()
  })

  it('should handle simulator throwing an error', async () => {
    // Arrange
    const errorMessage = 'Simulator error'
    mockSimulator.getWallets.mockRejectedValue(new Error(errorMessage))

    // Act & Assert
    await expect(protocolHandler['handleGetWalletsRequest']()).rejects.toThrow(errorMessage)
    expect(mockSimulator.getWallets).toHaveBeenCalledTimes(1)
  })

  it('should handle wallets with missing optional fields', async () => {
    // Arrange
    const mockWalletData = {
      internal: {
        uid: '1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
        capabilities: undefined, // Missing capabilities
        name: undefined, // Missing name
      },
      external: {
        uid: 'fedcba0987654321fedcba0987654321fedcba0987654321fedcba0987654321',
        capabilities: 0x02,
        name: '', // Empty name
      },
    }

    const mockSimulatorResponse = {
      code: LatticeResponseCode.success,
      data: mockWalletData,
      error: undefined,
    }

    mockSimulator.getWallets.mockResolvedValue(mockSimulatorResponse)

    // Act
    const result = await protocolHandler['handleGetWalletsRequest']()

    // Assert
    expect(result.code).toBe(LatticeResponseCode.success)
    expect(result.data).toBeDefined()
    expect(result.data!.length).toBe(142) // Should still be 142 bytes
  })
})
