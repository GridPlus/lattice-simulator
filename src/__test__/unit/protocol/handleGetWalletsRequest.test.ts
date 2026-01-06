import crc32 from 'crc-32'
import { aes256_decrypt, aes256_encrypt } from '@/core/utils/crypto'
import { LatticeSecureEncryptedRequestType, ProtocolConstants } from '@/core/types'
import { ProtocolHandler } from '@/server/protocolHandler'
import { LatticeResponseCode } from '@/shared/types'

// Mock the simulator with simple vi.fn() calls
const mockSimulator = {
  getWallets: vi.fn(),
  getKvRecords: vi.fn(),
  getSharedSecret: vi.fn(),
  getEphemeralKeyPair: vi.fn(),
  updateEphemeralKeyPair: vi.fn(),
  getDeviceId: vi.fn().mockReturnValue('test-device-id'),
} as any

const sharedSecret = Buffer.from(Array.from({ length: 32 }, (_, index) => (index + 5) % 255))
const walletResponseSize =
  ProtocolConstants.msgSizes.secure.data.response.encrypted[
    LatticeSecureEncryptedRequestType.getWallets
  ]

function buildEncryptedRequest(type: LatticeSecureEncryptedRequestType, payload: Buffer): Buffer {
  const body = Buffer.alloc(1 + payload.length)
  body.writeUInt8(type, 0)
  payload.copy(body, 1)

  const checksum = crc32.buf(body) >>> 0
  const checksumBytes = Buffer.alloc(ProtocolConstants.msgSizes.checksum)
  checksumBytes.writeUInt32LE(checksum, 0)

  return aes256_encrypt(Buffer.concat([body, checksumBytes]), sharedSecret)
}

function decryptWalletsResponse(encrypted: Buffer) {
  const decrypted = aes256_decrypt(encrypted, sharedSecret)
  const pubKeyLength = 65
  const checksumOffset = pubKeyLength + walletResponseSize
  const checksum = decrypted.readUInt32BE(checksumOffset)
  const calculated = crc32.buf(decrypted.subarray(0, checksumOffset)) >>> 0

  return {
    payload: decrypted.subarray(pubKeyLength, pubKeyLength + walletResponseSize),
    checksum,
    calculated,
  }
}

function hexToBuffer(hex: string, length: number): Buffer {
  const sanitized = hex.startsWith('0x') ? hex.slice(2) : hex
  const source = Buffer.from(sanitized, 'hex')
  const output = Buffer.alloc(length)
  source.copy(output, 0, 0, Math.min(source.length, length))
  return output
}

function buildExpectedWalletPayload(wallets: {
  internal: { uid: string; capabilities: number; name: string }
  external: { uid: string; capabilities: number; name: string }
}): Buffer {
  const output = Buffer.alloc(walletResponseSize)
  let offset = 0

  for (const wallet of [wallets.internal, wallets.external]) {
    hexToBuffer(wallet.uid, 32).copy(output, offset)
    offset += 32

    output.writeUInt32BE(wallet.capabilities >>> 0, offset)
    offset += 4

    const nameBytes = Buffer.from(wallet.name, 'utf8')
    nameBytes.copy(output, offset, 0, Math.min(35, nameBytes.length))
    offset += 35
  }

  return output
}

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

  it('handles secure getWallets request end-to-end', async () => {
    mockSimulator.getSharedSecret.mockReturnValue(sharedSecret)
    mockSimulator.getEphemeralKeyPair.mockReturnValue(undefined)

    mockSimulator.getWallets.mockResolvedValue({
      success: true,
      code: LatticeResponseCode.success,
      data: {
        internal: {
          uid: '038cd8b4d37d3d996760d8cfea09cd1a82504b1200520fa133dce046a037cd00',
          external: false,
          name: 'Ethereum Internal Account 0',
          capabilities: 0,
          accountId: '5a6f1ddb9305344e26926539e955542c',
          coinType: 'ETH',
          derivationPath: [2147483692, 2147483708, 2147483648, 1, 0],
          address: '0x4b39f7b0624b9db86ad293686bc38b903142dbbc',
          index: 0,
        },
        external: {
          uid: 'e0189ddbb8946682c37b7681e754b0fd05b19e0e8f838e73c4016cf8afca592d',
          external: true,
          name: 'Ethereum External Account 0',
          capabilities: 0,
          accountId: 'eda579da7d33ecb49ecf58d241557ea6',
          coinType: 'ETH',
          derivationPath: [2147483692, 2147483708, 2147483648, 0, 0],
          address: '0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266',
          index: 0,
        },
      },
    })

    const response = await protocolHandler.handleSecureRequest({
      type: LatticeSecureEncryptedRequestType.getWallets,
      data: buildEncryptedRequest(LatticeSecureEncryptedRequestType.getWallets, Buffer.alloc(0)),
    })

    expect(response.code).toBe(LatticeResponseCode.success)
    expect(response.data).toBeDefined()
    expect(mockSimulator.getWallets).toHaveBeenCalledTimes(1)
  })

  it('serializes wallets into the encrypted response payload', async () => {
    mockSimulator.getSharedSecret.mockReturnValue(sharedSecret)
    mockSimulator.getEphemeralKeyPair.mockReturnValue(undefined)

    const wallets = {
      internal: {
        uid: '038cd8b4d37d3d996760d8cfea09cd1a82504b1200520fa133dce046a037cd00',
        external: false,
        name: 'Ethereum Internal Account 0',
        capabilities: 0,
        accountId: '5a6f1ddb9305344e26926539e955542c',
        coinType: 'ETH',
        derivationPath: [2147483692, 2147483708, 2147483648, 1, 0],
        address: '0x4b39f7b0624b9db86ad293686bc38b903142dbbc',
        index: 0,
      },
      external: {
        uid: 'e0189ddbb8946682c37b7681e754b0fd05b19e0e8f838e73c4016cf8afca592d',
        external: true,
        name: 'Ethereum External Account 0',
        capabilities: 0,
        accountId: 'eda579da7d33ecb49ecf58d241557ea6',
        coinType: 'ETH',
        derivationPath: [2147483692, 2147483708, 2147483648, 0, 0],
        address: '0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266',
        index: 0,
      },
    }

    mockSimulator.getWallets.mockResolvedValue({
      success: true,
      code: LatticeResponseCode.success,
      data: wallets,
    })

    const response = await protocolHandler.handleSecureRequest({
      type: LatticeSecureEncryptedRequestType.getWallets,
      data: buildEncryptedRequest(LatticeSecureEncryptedRequestType.getWallets, Buffer.alloc(0)),
    })

    expect(response.code).toBe(LatticeResponseCode.success)
    expect(response.data).toBeDefined()

    const decrypted = decryptWalletsResponse(response.data as Buffer)
    expect(decrypted.checksum).toBe(decrypted.calculated)

    const expectedPayload = buildExpectedWalletPayload(wallets)
    expect(decrypted.payload).toEqual(expectedPayload)
  })
})
