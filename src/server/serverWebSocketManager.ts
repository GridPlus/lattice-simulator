/** 
 * SERVER-SIDE ONLY WebSocket Manager
 *
 * ⚠️  SERVER-SIDE ONLY: This manages WebSocket connections on the Node.js server.
 * Client-side code should never import this directly.
 *
 * Manages WebSocket connections and messages for the server-side simulator.
 */
import { WebSocket } from 'ws'

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
  type: 'device_state' | 'pairing_mode_started' | 'pairing_mode_ended' | 'connection_changed' | 'pairing_changed' | 'kv_records_updated'
  data: any
}

class ServerWebSocketManager {
  private connections = new Map<string, Set<WebSocket>>()
  private messageHandlers = new Map<string, (message: WebSocketMessage, deviceId: string, ws: WebSocket) => void>()

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
  addConnection(deviceId: string, ws: WebSocket): void {
    if (!this.connections.has(deviceId)) {
      this.connections.set(deviceId, new Set())
    }

    this.connections.get(deviceId)!.add(ws)
    console.log(`[WSManager] Added connection for device: ${deviceId} (total: ${this.connections.get(deviceId)!.size})`)

    // Set up message handling for this connection
    ws.on('message', (data) => {
      try {
        const message: WebSocketMessage = JSON.parse(data.toString())
        this.handleMessage(message, deviceId, ws)
      } catch (error) {
        console.error(`[WSManager] Error parsing message from device ${deviceId}:`, error)
        this.sendError(ws, 'Invalid message format')
      }
    })
  }

  /**
   * Remove a WebSocket connection for a device
   */
  removeConnection(deviceId: string, ws: WebSocket): void {
    const connections = this.connections.get(deviceId)
    if (connections) {
      connections.delete(ws)
      console.log(`[WSManager] Removed connection for device: ${deviceId} (remaining: ${connections.size})`)
      console.log(`[WSManager] WebSocket readyState when removing: ${ws.readyState}`)
      
      if (connections.size === 0) {
        this.connections.delete(deviceId)
        console.log(`[WSManager] No more connections for device: ${deviceId}`)
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
        payload
      },
      timestamp: Date.now()
    }

    this.broadcast(deviceId, message)
    console.log(`[WSManager] Sent server request: ${requestId} (${requestType}) to device: ${deviceId}`)
  }

  /**
   * Broadcast a message to all clients connected to a device
   */
  broadcast(deviceId: string, message: WebSocketMessage): void {
    const connections = this.connections.get(deviceId)
    if (!connections || connections.size === 0) {
      console.warn(`[WSManager] No connections available for device: ${deviceId}`)
      console.log(`[WSManager] Current connections map:`, Array.from(this.connections.keys()))
      console.log(`[WSManager] Total devices with connections: ${this.connections.size}`)
      return
    }

    const messageStr = JSON.stringify(message)
    const closedConnections: WebSocket[] = []

    connections.forEach(ws => {
      if (ws.readyState === WebSocket.OPEN) {
        try {
          ws.send(messageStr)
        } catch (error) {
          console.error(`[WSManager] Error sending message to device ${deviceId}:`, error)
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
        deviceId
      },
      timestamp: Date.now()
    }

    this.broadcast(deviceId, message)
    console.log(`[WSManager] Broadcasted device event: ${eventType} to device: ${deviceId}`)
  }

  /**
   * Register a message handler for a specific message type
   */
  registerHandler(messageType: string, handler: (message: WebSocketMessage, deviceId: string, ws: WebSocket) => void): void {
    this.messageHandlers.set(messageType, handler)
    console.log(`[WSManager] Registered handler for message type: ${messageType}`)
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
    console.log(`[WSManager] Received message from device ${deviceId}:`, JSON.stringify(message))

    const handler = this.messageHandlers.get(message.type)
    if (handler) {
      try {
        handler(message, deviceId, ws)
      } catch (error) {
        console.error(`[WSManager] Error in handler for ${message.type}:`, error)
        this.sendError(ws, `Error processing ${message.type}`)
      }
    } else {
      console.warn(`[WSManager] No handler registered for message type: ${message.type}`)
      this.sendError(ws, `Unknown message type: ${message.type}`)
    }
  }

  /**
   * Handle client responses to server requests
   */
  private handleClientResponse(message: WebSocketMessage, deviceId: string, ws: WebSocket): void {
    const response = message as ClientResponse
    const { requestId, requestType, data, error } = response.data

    console.log(`[WSManager] Received client response:`, {
      requestId,
      requestType,
      hasData: !!data,
      hasError: !!error
    })

    // Import here to avoid circular dependencies
    try {
      const { requestManager } = require('./serverRequestManager')
      const handled = requestManager.handleClientResponse({
        requestId,
        type: requestType,
        data,
        error
      })

      if (!handled) {
        console.warn(`[WSManager] No pending request found for: ${requestId}`)
        this.sendError(ws, `No pending request found for: ${requestId}`)
      }
    } catch (error) {
      console.error('[WSManager] Error handling client response:', error)
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
      timestamp: Date.now()
    })
  }

  /**
   * Handle device events from client
   */
  private handleDeviceEvent(message: WebSocketMessage, deviceId: string, ws: WebSocket): void {
    try {
      // The eventType and data are directly in the message, not nested under message.data
      const { eventType, data } = message as any
      
      console.log(`[WSManager] Received device event from client: ${eventType} for device: ${deviceId}`)
      
      // Handle the event on the server-side instead of rebroadcasting
      // This prevents infinite loops and allows the server to update its state
      this.handleServerSideEvent(deviceId, eventType, data)
      
    } catch (error) {
      console.error('[WSManager] Error handling device event:', error)
    }
  }

  /**
   * Handle server-side events (update server state, not broadcast)
   */
  private handleServerSideEvent(deviceId: string, eventType: string, data: any): void {
    try {
      console.log(`[WSManager] Handling server-side event: ${eventType} for device: ${deviceId}`)
      
      // Import deviceEvents to handle the event on server-side
      const { deviceEvents } = require('./serverDeviceEvents')
      
      // Emit the event locally on the server-side with a flag to prevent WebSocket broadcasting
      // This will update server state but not broadcast back to clients
      deviceEvents.emit(deviceId, eventType, data, { skipWebSocketBroadcast: true })
      
    } catch (error) {
      console.error('[WSManager] Error handling server-side event:', error)
    }
  }

  /**
   * Handle device commands from client (commands that call simulator methods directly)
   */
  private handleDeviceCommand(message: WebSocketMessage, deviceId: string, ws: WebSocket): void {
    try {
      const { command, data } = message.data || {}
      
      console.log(`[WSManager] Received device command from client: ${command} for device: ${deviceId}`)
      
      // Get the device manager and simulator instance
      const { getDeviceManager } = require('./serverDeviceManager')
      const deviceManager = getDeviceManager(deviceId)
      const simulator = deviceManager.getSimulator()
      
      if (!simulator) {
        console.error(`[WSManager] No simulator found for device: ${deviceId}`)
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
            timestamp: Date.now()
          })
          break
          
        case 'exit_pairing_mode':
          simulator.exitPairingMode()
          this.sendMessage(ws, {
            type: 'command_response',
            data: { command, success: true },
            timestamp: Date.now()
          })
          break
          
        default:
          console.warn(`[WSManager] Unknown command: ${command}`)
          this.sendError(ws, `Unknown command: ${command}`)
          break
      }
      
    } catch (error) {
      console.error('[WSManager] Error handling device command:', error)
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
        console.error('[WSManager] Error sending message:', error)
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
      timestamp: Date.now()
    })
  }
}

// Create singleton instance
const globalForServerWSManager = globalThis as unknown as {
  serverWebSocketManager: ServerWebSocketManager | undefined
}

export const serverWebSocketManager = 
  globalForServerWSManager.serverWebSocketManager ??
  (globalForServerWSManager.serverWebSocketManager = new ServerWebSocketManager())

// Legacy export for backward compatibility during migration
export const wsManager = serverWebSocketManager