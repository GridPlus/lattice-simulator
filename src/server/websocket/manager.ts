/**
 * SERVER-SIDE ONLY WebSocket Manager
 *
 * ⚠️  SERVER-SIDE ONLY: This manages WebSocket connections on the Node.js server.
 * Client-side code should never import this directly.
 *
 * Manages WebSocket connections and messages for the server-side simulator.
 */
import { WebSocket } from 'ws'
import type { DeviceEventType } from '../events'

export interface WebSocketMessage {
  type: string
  data: any
  timestamp: number
}

export interface ServerRequest extends WebSocketMessage {
  type: 'server_request'
  data: {
    requestId: string
    requestType: string
    payload: any
  }
}

export interface ClientResponse extends WebSocketMessage {
  type: 'client_response'
  data: {
    requestId: string
    requestType: string
    data?: any
    error?: string
  }
}

export interface DeviceStateEvent extends WebSocketMessage {
  type:
    | 'device_state'
    | 'pairing_mode_started'
    | 'pairing_mode_ended'
    | 'connection_changed'
    | 'pairing_changed'
    | 'kv_records_updated'
  data: any
}

class ServerWebSocketManager {
  private connections = new Map<string, Set<WebSocket>>()
  private deviceManagers = new Map<string, any>() // Store DeviceManager instances per device
  private messageHandlers = new Map<
    string,
    (message: WebSocketMessage, deviceId: string, ws: WebSocket) => void
  >()

  constructor() {
    // Register default message handlers
    this.registerHandler('client_response', this.handleClientResponse.bind(this))
    this.registerHandler('heartbeat', this.handleHeartbeat.bind(this))
    this.registerHandler('device_event', this.handleDeviceEvent.bind(this))
    this.registerHandler('device_command', this.handleDeviceCommand.bind(this))
  }

  /**
   * Add a WebSocket connection for a device
   */
  addConnection(deviceId: string, ws: WebSocket, deviceManager?: any): void {
    if (!this.connections.has(deviceId)) {
      this.connections.set(deviceId, new Set())
    }

    // Store the DeviceManager instance if provided
    if (deviceManager) {
      this.deviceManagers.set(deviceId, deviceManager)
      console.log(`[ServerWsManager] Stored DeviceManager for device: ${deviceId}`)
    }

    // Add the new connection to the set (allows multiple connections per device)
    this.connections.get(deviceId)!.add(ws)
    console.log(
      `[ServerWsManager] Added connection for device: ${deviceId} (total: ${this.connections.get(deviceId)!.size})`,
    )

    // Set up message handling for this connection
    ws.on('message', data => {
      try {
        const message: WebSocketMessage = JSON.parse(data.toString())
        this.handleMessage(message, deviceId, ws)
      } catch (error) {
        console.error(`[ServerWsManager] Error parsing message from device ${deviceId}:`, error)
        this.sendError(ws, 'Invalid message format')
      }
    })
  }

  /**
   * Get the DeviceManager for a device (from stored instance)
   */
  private getDeviceManager(deviceId: string): any {
    if (!this.deviceManagers.has(deviceId)) {
      throw new Error(
        `DeviceManager not found for device: ${deviceId}. Make sure to pass DeviceManager to addConnection().`,
      )
    }
    return this.deviceManagers.get(deviceId)
  }

  /**
   * Remove a WebSocket connection for a device
   */
  removeConnection(deviceId: string, ws: WebSocket): void {
    const connections = this.connections.get(deviceId)
    if (connections && connections.size > 0) {
      connections.delete(ws)
      console.log(
        `[ServerWsManager] Removed connection for device: ${deviceId} (remaining: ${connections.size})`,
      )
      console.log(`[ServerWsManager] WebSocket readyState when removing: ${ws.readyState}`)

      if (connections.size === 0) {
        this.connections.delete(deviceId)
        console.log(`[ServerWsManager] No more connections for device: ${deviceId}`)
      }
    }
  }

  /**
   * Send a server request to all clients connected to a device
   */
  sendServerRequest(deviceId: string, requestId: string, requestType: string, payload: any): void {
    const message: ServerRequest = {
      type: 'server_request',
      data: {
        requestId,
        requestType,
        payload,
      },
      timestamp: Date.now(),
    }

    this.broadcast(deviceId, message)
    console.log(
      `[ServerWsManager] Sent server request: ${requestId} (${requestType}) to device: ${deviceId}, message: ${JSON.stringify(message)}`,
    )
  }

  /**
   * Broadcast a message to all clients connected to a device
   */
  broadcast(deviceId: string, message: WebSocketMessage): void {
    const connections = this.connections.get(deviceId)
    if (!connections || connections.size === 0) {
      console.warn(`[ServerWsManager] No connections available for device: ${deviceId}`)
      console.log('[ServerWsManager] Current connections map:', Array.from(this.connections.keys()))
      console.log(`[ServerWsManager] Total devices with connections: ${this.connections.size}`)
      return
    }

    const messageStr = JSON.stringify(message)
    const closedConnections: WebSocket[] = []

    connections.forEach(ws => {
      if (ws.readyState === WebSocket.OPEN) {
        try {
          ws.send(messageStr)
        } catch (error) {
          console.error(`[ServerWsManager] Error sending message to device ${deviceId}:`, error)
          closedConnections.push(ws)
        }
      } else {
        closedConnections.push(ws)
      }
    })

    // Clean up closed connections
    closedConnections.forEach(ws => {
      this.removeConnection(deviceId, ws)
    })
  }

  /**
   * Send a device state event to all clients connected to a device
   */
  broadcastDeviceEvent(deviceId: string, eventType: string, data: any): void {
    const message: DeviceStateEvent = {
      type: eventType as any,
      data: {
        ...data,
        deviceId,
      },
      timestamp: Date.now(),
    }

    this.broadcast(deviceId, message)
    console.log(`[ServerWsManager] Broadcasted device event: ${eventType} to device: ${deviceId}`)
  }

  /**
   * Register a message handler for a specific message type
   */
  registerHandler(
    messageType: string,
    handler: (message: WebSocketMessage, deviceId: string, ws: WebSocket) => void,
  ): void {
    this.messageHandlers.set(messageType, handler)
    console.log(`[ServerWsManager] Registered handler for message type: ${messageType}`)
  }

  /**
   * Get active connections count for a device
   */
  getConnectionCount(deviceId: string): number {
    return this.connections.get(deviceId)?.size || 0
  }

  /**
   * Get all connected device IDs
   */
  getConnectedDeviceIds(): string[] {
    return Array.from(this.connections.keys())
  }

  /**
   * Handle incoming messages from clients
   */
  private handleMessage(message: WebSocketMessage, deviceId: string, ws: WebSocket): void {
    console.log(
      `[ServerWsManager] Received message from device ${deviceId}:`,
      JSON.stringify(message),
    )
    console.log(
      `[ServerWsManager] Current connection count for ${deviceId}: ${this.getConnectionCount(deviceId)}`,
    )
    console.log(
      `[ServerWsManager] Message type: ${message.type}, Handler exists: ${this.messageHandlers.has(message.type)}`,
    )

    const handler = this.messageHandlers.get(message.type)
    if (handler) {
      try {
        handler(message, deviceId, ws)
      } catch (error) {
        console.error(`[ServerWsManager] Error in handler for ${message.type}:`, error)
        this.sendError(ws, `Error processing ${message.type}`)
      }
    } else {
      console.warn(`[ServerWsManager] No handler registered for message type: ${message.type}`)
      this.sendError(ws, `Unknown message type: ${message.type}`)
    }
  }

  /**
   * Handle client responses to server requests
   */
  private async handleClientResponse(
    message: WebSocketMessage,
    deviceId: string,
    ws: WebSocket,
  ): Promise<void> {
    const response = message as ClientResponse
    const { requestId, requestType, data, error } = response.data

    // Validate that this is a proper client response with requestId
    if (!requestId || !requestType) {
      console.warn(
        '[ServerWsManager] Invalid client response - missing requestId or requestType:',
        response.data,
      )
      this.sendError(ws, 'Invalid response format')
      return
    }

    // Filter out heartbeat-related messages (shouldn't reach here but be safe)
    if (requestType === 'heartbeat' || requestType === 'heartbeat_response') {
      console.warn('[ServerWsManager] Heartbeat message incorrectly routed to handleClientResponse')
      return
    }

    console.log('[ServerWsManager] Received client response:', {
      requestId,
      requestType,
      hasData: !!data,
      hasError: !!error,
    })

    // Import here to avoid circular dependencies
    try {
      const { requestManager } = await import('../requestManager')
      const handled = requestManager.handleClientResponse({
        requestId,
        type: requestType,
        data,
        error,
      })

      if (!handled) {
        console.warn(`[ServerWsManager] No pending request found for: ${requestId}`)
        this.sendError(ws, `No pending request found for: ${requestId}`)
      }
    } catch (error) {
      console.error('[ServerWsManager] Error handling client response:', error)
      this.sendError(ws, 'Error processing response')
    }
  }

  /**
   * Handle heartbeat messages
   */
  private handleHeartbeat(message: WebSocketMessage, deviceId: string, ws: WebSocket): void {
    // Send heartbeat response
    this.sendMessage(ws, {
      type: 'heartbeat_response',
      data: { deviceId },
      timestamp: Date.now(),
    })
  }

  /**
   * Handle device events from client
   */
  private handleDeviceEvent(message: WebSocketMessage, deviceId: string): void {
    try {
      // The eventType and data are directly in the message, not nested under message.data
      const { eventType, data } = message as any

      console.log(
        `[ServerWsManager] Received device event from client: ${eventType} for device: ${deviceId}`,
      )

      // Handle the event on the server-side instead of rebroadcasting
      // This prevents infinite loops and allows the server to update its state
      this.handleServerSideEvent(deviceId, eventType, data)
    } catch (error) {
      console.error('[ServerWsManager] Error handling device event:', error)
    }
  }

  /**
   * Handle server-side events (update server state, not broadcast)
   */
  private async handleServerSideEvent(
    deviceId: string,
    eventType: string,
    data: any,
  ): Promise<void> {
    try {
      console.log(
        `[ServerWsManager] Handling server-side event: ${eventType} for device: ${deviceId}`,
      )

      // Import deviceEvents to handle the event on server-side
      const { deviceEvents } = await import('../events')

      // Emit the event locally on the server-side with a flag to prevent WebSocket broadcasting
      // This will update server state but not broadcast back to clients
      deviceEvents.emit(deviceId, eventType as DeviceEventType, data, {
        skipWebSocketBroadcast: true,
      })
    } catch (error) {
      console.error('[ServerWsManager] Error handling server-side event:', error)
    }
  }

  /**
   * Handle device commands from client (commands that call simulator methods directly)
   */
  private async handleDeviceCommand(
    message: WebSocketMessage,
    deviceId: string,
    ws: WebSocket,
  ): Promise<void> {
    try {
      const { command, data } = message.data || {}

      console.log(
        `[ServerWsManager] Received device command from client: ${command} for device: ${deviceId}`,
      )

      // Get the device manager and simulator instance
      const deviceManager = this.getDeviceManager(deviceId)
      const simulator = deviceManager.getSimulator()

      if (!simulator) {
        console.error(`[ServerWsManager] No simulator found for device: ${deviceId}`)
        this.sendError(ws, `No simulator found for device: ${deviceId}`)
        return
      }

      // Handle different commands
      switch (command) {
        case 'enter_pairing_mode':
          simulator.enterPairingMode()
          this.sendMessage(ws, {
            type: 'command_response',
            data: { command, success: true },
            timestamp: Date.now(),
          })
          break

        case 'exit_pairing_mode':
          simulator.exitPairingMode()
          this.sendMessage(ws, {
            type: 'command_response',
            data: { command, success: true },
            timestamp: Date.now(),
          })
          break

        case 'reset_device':
          const { resetType = 'full' } = data || {}
          console.log(
            `[ServerWsManager] Resetting device state for: ${deviceId}, type: ${resetType}`,
          )

          if (resetType === 'connection') {
            // Reset only connection and pairing related state
            console.log(`[ServerWsManager] Resetting connection state only for: ${deviceId}`)
            simulator.unpair()

            this.sendMessage(ws, {
              type: 'command_response',
              data: {
                command,
                success: true,
                message: `Device ${deviceId} connection state reset successfully`,
                resetType: 'connection',
              },
              timestamp: Date.now(),
            })
          } else {
            // Full reset (default behavior)
            console.log(`[ServerWsManager] Performing full device reset for: ${deviceId}`)

            const deviceManager = await this.getDeviceManager(deviceId)

            // Reset the device manager state
            deviceManager.reset()

            console.log(`[ServerWsManager] Full device reset completed for: ${deviceId}`)

            this.sendMessage(ws, {
              type: 'command_response',
              data: {
                command,
                success: true,
                message: `Device ${deviceId} state reset successfully`,
                resetType: 'full',
              },
              timestamp: Date.now(),
            })
          }
          break

        case 'sync_client_state':
          const { clientState } = data || {}
          console.log(`[ServerWsManager] Syncing client state for device: ${deviceId}`)
          console.log('[ServerWsManager] Received client state:', {
            deviceId: clientState?.deviceInfo?.deviceId,
            isPaired: clientState?.isPaired,
            isConnected: clientState?.isConnected,
            kvRecordsCount: clientState?.kvRecords ? Object.keys(clientState.kvRecords).length : 0,
          })

          try {
            // Get the device manager for this device
            const deviceManager = await this.getDeviceManager(deviceId)

            // Use the restoreFromClientState method to properly sync from client (source of truth)
            deviceManager.restoreFromClientState(clientState)

            // Also sync configuration separately
            const simulator = deviceManager.getSimulator()
            if (clientState.config) {
              simulator.setAutoApprove(clientState.config.autoApproveRequests || false)
            }

            console.log(
              `[ServerWsManager] Client state synced successfully to server for device: ${deviceId}`,
            )

            this.sendMessage(ws, {
              type: 'command_response',
              data: {
                command,
                success: true,
                message: 'Client state synced to server successfully',
                syncedData: {
                  deviceId: clientState.deviceInfo.deviceId,
                  isPaired: clientState.isPaired,
                  kvRecordsCount: Object.keys(clientState.kvRecords).length,
                },
              },
              timestamp: Date.now(),
            })
          } catch (error) {
            console.error(
              `[ServerWsManager] Error syncing client state for device ${deviceId}:`,
              error,
            )
            this.sendMessage(ws, {
              type: 'command_response',
              data: {
                command,
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error',
              },
              timestamp: Date.now(),
            })
          }
          break

        case 'approve_signing_request':
          const { requestId: approveRequestId } = data || {}
          if (!approveRequestId) {
            this.sendError(ws, 'Request ID is required for approval')
            return
          }

          console.log(`[ServerWsManager] Approving signing request: ${approveRequestId}`)

          try {
            const result = await simulator.approveSigningRequest(approveRequestId)

            this.sendMessage(ws, {
              type: 'command_response',
              data: {
                command,
                success: result.success,
                requestId: approveRequestId,
                data: result.data,
                error: result.error,
              },
              timestamp: Date.now(),
            })
          } catch (error) {
            console.error(`[ServerWsManager] Error approving signing request: ${error}`)
            this.sendError(ws, `Error approving request: ${(error as Error).message}`)
          }
          break

        case 'reject_signing_request':
          const { requestId: rejectRequestId, reason } = data || {}
          if (!rejectRequestId) {
            this.sendError(ws, 'Request ID is required for rejection')
            return
          }

          console.log(`[ServerWsManager] Rejecting signing request: ${rejectRequestId}`)

          try {
            const result = await simulator.rejectSigningRequest(rejectRequestId)

            this.sendMessage(ws, {
              type: 'command_response',
              data: {
                command,
                success: result.success,
                requestId: rejectRequestId,
                data: result.data,
                error: result.error,
                reason,
              },
              timestamp: Date.now(),
            })
          } catch (error) {
            console.error(`[ServerWsManager] Error rejecting signing request: ${error}`)
            this.sendError(ws, `Error rejecting request: ${(error as Error).message}`)
          }
          break

        case 'set_active_wallet':
          const { coinType: activeCoinType, accountId } = data || {}
          if (!activeCoinType || !accountId) {
            this.sendError(ws, 'coinType and accountId are required to set active wallet')
            return
          }

          try {
            const { walletRegistry } = await import('../../core/wallets/WalletRegistry')
            const account = walletRegistry.getWalletAccount(accountId)

            if (!account) {
              this.sendError(ws, `Wallet account not found for id: ${accountId}`)
              return
            }

            walletRegistry.setActiveWallet(activeCoinType, account)

            this.sendMessage(ws, {
              type: 'command_response',
              data: {
                command,
                success: true,
                coinType: activeCoinType,
                accountId,
              },
              timestamp: Date.now(),
            })
          } catch (error) {
            console.error(`[ServerWsManager] Error setting active wallet: ${error}`)
            this.sendError(ws, `Error setting active wallet: ${(error as Error).message}`)
          }
          break

        case 'set_active_safecard': {
          const { safeCardId, uid, name, mnemonic } = data || {}
          if (!safeCardId || !uid || !name) {
            this.sendError(ws, 'safeCardId, uid, and name are required to set active SafeCard')
            return
          }

          try {
            simulator.setActiveSafeCard({
              id: safeCardId,
              uid,
              name,
              mnemonic: typeof mnemonic === 'string' ? mnemonic : null,
            })

            this.sendMessage(ws, {
              type: 'command_response',
              data: {
                command,
                success: true,
                safeCardId,
                uid,
                name,
              },
              timestamp: Date.now(),
            })
          } catch (error) {
            console.error(`[ServerWsManager] Error setting active SafeCard: ${error}`)
            this.sendError(ws, `Error setting active SafeCard: ${(error as Error).message}`)
          }
          break
        }

        case 'sync_wallet_accounts':
          const payload = data || {}
          const { walletAccounts, mnemonic } = payload
          if (!walletAccounts || !Array.isArray(walletAccounts)) {
            this.sendError(ws, 'Wallet accounts array is required for sync')
            return
          }

          console.log(
            `[ServerWsManager] Syncing ${walletAccounts.length} wallet accounts for device: ${deviceId}`,
          )

          try {
            // Import and update the wallet manager
            const { walletRegistry } = await import('../../core/wallets/WalletRegistry')

            const hasMnemonicField = Object.prototype.hasOwnProperty.call(payload, 'mnemonic')
            if (hasMnemonicField) {
              const overrideChanged = await walletRegistry.applyMnemonicOverride(
                typeof mnemonic === 'string' ? mnemonic : null,
              )

              if (overrideChanged) {
                console.log('[ServerWsManager] Mnemonic override updated from client sync')
              }
            }

            await walletRegistry.syncWalletAccounts(walletAccounts)

            this.sendMessage(ws, {
              type: 'command_response',
              data: {
                command,
                success: true,
                message: `Synced ${walletAccounts.length} wallet accounts successfully`,
                syncedCount: walletAccounts.length,
              },
              timestamp: Date.now(),
            })
          } catch (error) {
            console.error(`[ServerWsManager] Error syncing wallet accounts: ${error}`)
            this.sendError(ws, `Error syncing wallet accounts: ${(error as Error).message}`)
          }
          break

        default:
          console.warn(`[ServerWsManager] Unknown command: ${command}`)
          this.sendError(ws, `Unknown command: ${command}`)
          break
      }
    } catch (error) {
      console.error('[ServerWsManager] Error handling device command:', error)
      this.sendError(ws, 'Error processing command')
    }
  }

  /**
   * Send a message to a specific WebSocket
   */
  private sendMessage(ws: WebSocket, message: WebSocketMessage): void {
    if (ws.readyState === WebSocket.OPEN) {
      try {
        ws.send(JSON.stringify(message))
      } catch (error) {
        console.error('[ServerWsManager] Error sending message:', error)
      }
    }
  }

  /**
   * Send an error message to a specific WebSocket
   */
  private sendError(ws: WebSocket, error: string): void {
    this.sendMessage(ws, {
      type: 'error',
      data: { error },
      timestamp: Date.now(),
    })
  }

  hasConnections(deviceId: string): boolean {
    const connections = this.connections.get(deviceId)
    return !!connections && connections.size > 0
  }
}

// Create singleton instance
const globalForServerWSManager = globalThis as unknown as {
  webSocketManager: ServerWebSocketManager | undefined
}

export const webSocketManager =
  globalForServerWSManager.webSocketManager ??
  (globalForServerWSManager.webSocketManager = new ServerWebSocketManager())

// Legacy export for backward compatibility during migration
export const wsManager = webSocketManager
