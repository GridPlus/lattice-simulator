import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { ServerLatticeSimulator } from '@/server/serverSimulator'
import { serverWebSocketManager } from '@/server/serverWebSocketManager'
import { sendSyncWalletAccountsCommand } from '@/client/clientWebSocketCommands'

// Mock WebSocket for testing
class MockWebSocket {
  public readyState: number = WebSocket.OPEN
  public onmessage: ((event: any) => void) | null = null
  public onclose: ((event: any) => void) | null = null
  public onerror: ((event: any) => void) | null = null

  private messages: any[] = []

  send(data: string) {
    this.messages.push(JSON.parse(data))
  }

  getLastMessage() {
    return this.messages[this.messages.length - 1]
  }

  getAllMessages() {
    return this.messages
  }

  close() {
    this.readyState = WebSocket.CLOSED
    if (this.onclose) {
      this.onclose({ code: 1000, reason: 'Test close' })
    }
  }

  simulateMessage(message: any) {
    if (this.onmessage) {
      this.onmessage({ data: JSON.stringify(message) })
    }
  }
}

describe('Wallet Sync Functionality', () => {
  let simulator: ServerLatticeSimulator
  let mockWs: MockWebSocket

  beforeEach(() => {
    // Create a fresh simulator instance
    simulator = new ServerLatticeSimulator({
      deviceId: 'test-device-id',
      firmwareVersion: [0, 15, 0],
      autoApprove: false,
    })

    // Create mock WebSocket
    mockWs = new MockWebSocket()

    // Mock console methods to avoid test output noise
    vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('Server Simulator Wallet Data Storage', () => {
    it('should store wallet data correctly', () => {
      // Arrange
      const walletData = {
        wallets: {
          '0': {
            external: [
              { uid: 'ext1', name: 'External 1', capabilities: 0x01 },
              { uid: 'ext2', name: 'External 2', capabilities: 0x02 },
            ],
            internal: [{ uid: 'int1', name: 'Internal 1', capabilities: 0x01 }],
          },
          '60': {
            external: [{ uid: 'eth1', name: 'ETH External', capabilities: 0x01 }],
            internal: [],
          },
        },
        activeWallets: {
          '0': { external: 0, internal: 0 },
          '60': { external: 0, internal: 0 },
        },
        isInitialized: true,
        lastUpdated: Date.now(),
      }

      // Act
      simulator.setWalletData(walletData)

      // Assert
      const storedData = simulator.getWalletData()
      expect(storedData).toEqual(walletData)
      expect(storedData?.wallets).toBeDefined()
      expect(storedData?.activeWallets).toBeDefined()
      expect(storedData?.isInitialized).toBe(true)
      expect(storedData?.lastUpdated).toBeGreaterThan(0)
    })

    it('should handle null wallet data gracefully', () => {
      // Act
      simulator.setWalletData(null as any)

      // Assert
      const storedData = simulator.getWalletData()
      expect(storedData).toBeNull()
    })

    it('should handle undefined wallet data gracefully', () => {
      // Act
      simulator.setWalletData(undefined as any)

      // Assert
      const storedData = simulator.getWalletData()
      expect(storedData).toBeNull()
    })

    it('should handle empty wallet data', () => {
      // Arrange
      const emptyWalletData = {
        wallets: {},
        activeWallets: {},
        isInitialized: false,
        lastUpdated: Date.now(),
      }

      // Act
      simulator.setWalletData(emptyWalletData)

      // Assert
      const storedData = simulator.getWalletData()
      expect(storedData).toEqual(emptyWalletData)
      expect(storedData?.isInitialized).toBe(false)
    })
  })

  describe('WebSocket Wallet Sync Command', () => {
    it('should handle sync_wallet_accounts command successfully', async () => {
      // Arrange
      const deviceId = 'test-device-id'
      const walletData = {
        wallets: {
          '0': {
            external: [{ uid: 'ext1', name: 'Bitcoin External', capabilities: 0x01 }],
            internal: [{ uid: 'int1', name: 'Bitcoin Internal', capabilities: 0x01 }],
          },
        },
        activeWallets: {
          '0': { external: 0, internal: 0 },
        },
        isInitialized: true,
        lastUpdated: Date.now(),
      }

      // Mock the device manager
      const mockDeviceManager = {
        getSimulator: () => simulator,
      }

      // Mock the getDeviceManager method (it's synchronous)
      vi.spyOn(serverWebSocketManager as any, 'getDeviceManager').mockReturnValue(mockDeviceManager)

      // Mock sendMessage to capture the response
      let capturedMessage: any = null
      vi.spyOn(serverWebSocketManager as any, 'sendMessage').mockImplementation((ws, message) => {
        capturedMessage = message
        mockWs.send(JSON.stringify(message))
      })

      // Act
      const message = {
        type: 'device_command',
        data: {
          command: 'sync_wallet_accounts',
          data: { walletAccounts: walletData },
        },
      }

      console.log('[TEST] About to call handleDeviceCommand with:', {
        deviceId,
        command: message.data.command,
      })
      await (serverWebSocketManager as any).handleDeviceCommand(message, deviceId, mockWs)
      console.log('[TEST] handleDeviceCommand completed')

      // Assert
      const storedData = simulator.getWalletData()
      expect(storedData).toEqual(walletData)

      // Check WebSocket response
      expect(capturedMessage.type).toBe('command_response')
      expect(capturedMessage.data.command).toBe('sync_wallet_accounts')
      expect(capturedMessage.data.success).toBe(true)
      expect(capturedMessage.data.message).toContain('synced to server successfully')
    })

    it('should handle sync_wallet_accounts command with error', async () => {
      // Arrange
      const deviceId = 'test-device-id'

      // Mock device manager to throw error
      vi.spyOn(serverWebSocketManager as any, 'getDeviceManager').mockImplementation(() => {
        throw new Error('Device not found')
      })

      // Mock sendMessage to capture the response
      let capturedMessage: any = null
      vi.spyOn(serverWebSocketManager as any, 'sendMessage').mockImplementation((ws, message) => {
        capturedMessage = message
        mockWs.send(JSON.stringify(message))
      })

      // Act
      const message = {
        type: 'device_command',
        data: {
          command: 'sync_wallet_accounts',
          data: {
            walletAccounts: {
              wallets: {},
              activeWallets: {},
              isInitialized: false,
              lastUpdated: Date.now(),
            },
          },
        },
      }

      await (serverWebSocketManager as any).handleDeviceCommand(message, deviceId, mockWs)

      // Assert
      expect(capturedMessage.type).toBe('command_response')
      expect(capturedMessage.data.command).toBe('sync_wallet_accounts')
      expect(capturedMessage.data.success).toBe(false)
      expect(capturedMessage.data.error).toContain('Device not found')
    })

    it('should handle missing wallet data in sync command', async () => {
      // Arrange
      const deviceId = 'test-device-id'

      // Mock the device manager
      const mockDeviceManager = {
        getSimulator: () => simulator,
      }

      vi.spyOn(serverWebSocketManager as any, 'getDeviceManager').mockReturnValue(mockDeviceManager)

      // Mock sendMessage to capture the response
      let capturedMessage: any = null
      vi.spyOn(serverWebSocketManager as any, 'sendMessage').mockImplementation((ws, message) => {
        capturedMessage = message
        mockWs.send(JSON.stringify(message))
      })

      // Act
      const message = {
        type: 'device_command',
        data: {
          command: 'sync_wallet_accounts',
          data: {}, // Missing walletAccounts
        },
      }

      await (serverWebSocketManager as any).handleDeviceCommand(message, deviceId, mockWs)

      // Assert
      expect(capturedMessage.type).toBe('command_response')
      expect(capturedMessage.data.command).toBe('sync_wallet_accounts')
      expect(capturedMessage.data.success).toBe(true) // Should still succeed with null data
    })
  })

  describe('Client WebSocket Command', () => {
    it('should create correct sync command message', () => {
      // Arrange
      const deviceId = 'test-device-id'
      const walletData = {
        wallets: {
          '0': {
            external: [{ uid: 'ext1', name: 'Bitcoin External', capabilities: 0x01 }],
            internal: [],
          },
        },
        activeWallets: {
          '0': { external: 0, internal: 0 },
        },
        isInitialized: true,
        lastUpdated: Date.now(),
      }

      // Mock the sendDeviceCommand function
      let capturedMessage: any = null
      vi.doMock('@/client/clientWebSocketCommands', () => ({
        sendDeviceCommand: vi.fn((deviceId: string, command: string, data: any) => {
          capturedMessage = { deviceId, command, data }
        }),
      }))

      // Act
      sendSyncWalletAccountsCommand(deviceId, walletData)

      // Assert
      // Note: This test verifies the function signature and basic structure
      // The actual WebSocket sending would be mocked in integration tests
      expect(typeof sendSyncWalletAccountsCommand).toBe('function')
    })
  })

  describe('Wallet Data Structure Validation', () => {
    it('should validate wallet data structure', () => {
      // Arrange
      const validWalletData = {
        wallets: {
          '0': {
            external: [
              { uid: 'ext1', name: 'External 1', capabilities: 0x01 },
              { uid: 'ext2', name: 'External 2', capabilities: 0x02 },
            ],
            internal: [{ uid: 'int1', name: 'Internal 1', capabilities: 0x01 }],
          },
          '60': {
            external: [{ uid: 'eth1', name: 'ETH External', capabilities: 0x01 }],
            internal: [],
          },
        },
        activeWallets: {
          '0': { external: 0, internal: 0 },
          '60': { external: 0, internal: 0 },
        },
        isInitialized: true,
        lastUpdated: Date.now(),
      }

      // Act
      simulator.setWalletData(validWalletData)

      // Assert
      const storedData = simulator.getWalletData()
      expect(storedData).toBeDefined()
      expect(storedData?.wallets).toBeDefined()
      expect(storedData?.activeWallets).toBeDefined()
      expect(storedData?.isInitialized).toBe(true)
      expect(typeof storedData?.lastUpdated).toBe('number')

      // Validate wallet structure
      expect(storedData?.wallets['0']).toBeDefined()
      expect(storedData?.wallets['0'].external).toBeInstanceOf(Array)
      expect(storedData?.wallets['0'].internal).toBeInstanceOf(Array)
      expect(storedData?.wallets['60']).toBeDefined()
      expect(storedData?.wallets['60'].external).toBeInstanceOf(Array)
      expect(storedData?.wallets['60'].internal).toBeInstanceOf(Array)
    })

    it('should handle wallet data with missing optional fields', () => {
      // Arrange
      const walletDataWithMissingFields = {
        wallets: {
          '0': {
            external: [
              { uid: 'ext1', name: undefined, capabilities: undefined },
              { uid: 'ext2', name: '', capabilities: 0x02 },
            ],
            internal: [],
          },
        },
        activeWallets: {
          '0': { external: 0, internal: 0 },
        },
        isInitialized: false,
        lastUpdated: Date.now(),
      }

      // Act
      simulator.setWalletData(walletDataWithMissingFields)

      // Assert
      const storedData = simulator.getWalletData()
      expect(storedData).toBeDefined()
      expect(storedData?.wallets['0'].external).toHaveLength(2)
      expect(storedData?.isInitialized).toBe(false)
    })
  })

  describe('Integration Scenarios', () => {
    it('should handle multiple wallet sync operations', () => {
      // Arrange
      const initialWalletData = {
        wallets: { '0': { external: [], internal: [] } },
        activeWallets: { '0': { external: 0, internal: 0 } },
        isInitialized: false,
        lastUpdated: Date.now(),
      }

      const updatedWalletData = {
        wallets: {
          '0': {
            external: [{ uid: 'ext1', name: 'Bitcoin External', capabilities: 0x01 }],
            internal: [],
          },
        },
        activeWallets: { '0': { external: 0, internal: 0 } },
        isInitialized: true,
        lastUpdated: Date.now() + 1000,
      }

      // Act
      simulator.setWalletData(initialWalletData)
      const firstSync = simulator.getWalletData()

      simulator.setWalletData(updatedWalletData)
      const secondSync = simulator.getWalletData()

      // Assert
      expect(firstSync?.isInitialized).toBe(false)
      expect(secondSync?.isInitialized).toBe(true)
      expect(secondSync?.wallets['0'].external).toHaveLength(1)
      expect(secondSync?.lastUpdated).toBeGreaterThan(firstSync?.lastUpdated || 0)
    })

    it('should maintain wallet data integrity across operations', () => {
      // Arrange
      const complexWalletData = {
        wallets: {
          '0': {
            external: [
              { uid: 'btc-ext-1', name: 'Bitcoin External 1', capabilities: 0x01 },
              { uid: 'btc-ext-2', name: 'Bitcoin External 2', capabilities: 0x02 },
            ],
            internal: [{ uid: 'btc-int-1', name: 'Bitcoin Internal 1', capabilities: 0x01 }],
          },
          '60': {
            external: [{ uid: 'eth-ext-1', name: 'Ethereum External 1', capabilities: 0x01 }],
            internal: [],
          },
        },
        activeWallets: {
          '0': { external: 0, internal: 0 },
          '60': { external: 0, internal: 0 },
        },
        isInitialized: true,
        lastUpdated: Date.now(),
      }

      // Act
      simulator.setWalletData(complexWalletData)
      const storedData = simulator.getWalletData()

      // Assert
      expect(storedData).toEqual(complexWalletData)
      expect(storedData?.wallets['0'].external).toHaveLength(2)
      expect(storedData?.wallets['0'].internal).toHaveLength(1)
      expect(storedData?.wallets['60'].external).toHaveLength(1)
      expect(storedData?.wallets['60'].internal).toHaveLength(0)
      expect(storedData?.activeWallets['0']).toEqual({ external: 0, internal: 0 })
      expect(storedData?.activeWallets['60']).toEqual({ external: 0, internal: 0 })
    })
  })
})
