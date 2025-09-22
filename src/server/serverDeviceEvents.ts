/**
 * SERVER-SIDE ONLY event system for device state changes
 *
 * ⚠️  IMPORTANT: This is SERVER-SIDE ONLY and should not be used by client-side code.
 * This allows the server-side simulator to broadcast events via WebSocket connections.
 *
 * Client-side components should listen for WebSocket events, not use this directly.
 */

import { wsManager } from './serverWebSocketManager'

export type DeviceEventType =
  | 'pairing_mode_started'
  | 'pairing_mode_ended'
  | 'connection_changed'
  | 'pairing_changed'
  | 'kv_records_fetched'
  | 'kv_records_added'
  | 'kv_records_removed'
  | 'kv_records_updated'
  | 'kv_records_synced'
  | 'kv_records_reset'
  | 'wallet_addresses_request'
  | 'server_request'
  | 'signing_request_created'
  | 'signing_request_completed'

interface DeviceEvent {
  deviceId: string
  type: DeviceEventType
  data: any
  timestamp: number
}

type EventListener = (event: DeviceEvent) => void

class DeviceEventEmitter {
  private listeners: Map<string, EventListener[]> = new Map()

  /**
   * Subscribe to events for a specific device
   */
  subscribe(deviceId: string, listener: EventListener): () => void {
    const key = deviceId
    if (!this.listeners.has(key)) {
      this.listeners.set(key, [])
    }

    this.listeners.get(key)!.push(listener)

    console.log(`[DeviceEvents] Subscribed to events for device: ${deviceId}`)

    // Return unsubscribe function
    return () => {
      const listeners = this.listeners.get(key)
      if (listeners) {
        const index = listeners.indexOf(listener)
        if (index > -1) {
          listeners.splice(index, 1)
        }
        if (listeners.length === 0) {
          this.listeners.delete(key)
        }
      }
      console.log(`[DeviceEvents] Unsubscribed from events for device: ${deviceId}`)
    }
  }

  /**
   * Emit an event for a specific device
   */
  async emit(
    deviceId: string,
    type: DeviceEventType,
    data: any,
    options?: { skipWebSocketBroadcast?: boolean },
  ): Promise<void> {
    const event: DeviceEvent = {
      deviceId,
      type,
      data,
      timestamp: Date.now(),
    }

    console.log('[DeviceEvents] Emitting event:', event)

    // Emit to local listeners (for backward compatibility)
    const listeners = this.listeners.get(deviceId) || []
    listeners.forEach(listener => {
      try {
        listener(event)
      } catch (error) {
        console.error('[DeviceEvents] Error in event listener:', error)
      }
    })

    // Server-side: broadcast to WebSocket clients (unless explicitly skipped)
    if (!options?.skipWebSocketBroadcast) {
      try {
        // This is SERVER-SIDE ONLY - broadcast events to connected WebSocket clients
        wsManager.broadcastDeviceEvent(deviceId, type, data)
      } catch (error) {
        console.error('[DeviceEvents] Error broadcasting to WebSocket:', error)
      }
    } else {
      console.log(`[DeviceEvents] Skipping WebSocket broadcast for event: ${type}`)
    }
  }

  /**
   * Get all active subscriptions (for debugging)
   */
  getActiveSubscriptions(): string[] {
    return Array.from(this.listeners.keys())
  }
}

// Create singleton instance that persists across Next.js hot reloads and module boundaries
const globalForDeviceEvents = globalThis as unknown as {
  deviceEvents: DeviceEventEmitter | undefined
}

export const deviceEvents =
  globalForDeviceEvents.deviceEvents ??
  (globalForDeviceEvents.deviceEvents = new DeviceEventEmitter())

// Helper functions for common events
export const emitPairingModeStarted = (
  deviceId: string,
  pairingCode: string,
  timeoutMs: number = 60000,
  pairingStartTime = Date.now(),
) => {
  deviceEvents.emit(deviceId, 'pairing_mode_started', {
    pairingCode,
    timeoutMs,
    pairingStartTime,
  })
}

export const emitPairingModeEnded = (deviceId: string) => {
  deviceEvents.emit(deviceId, 'pairing_mode_ended', {})
}

export const emitConnectionChanged = (deviceId: string, isConnected: boolean) => {
  console.log(
    `[DeviceEvents] emitConnectionChanged for device: ${deviceId}, isConnected: ${isConnected}`,
  )
  deviceEvents.emit(deviceId, 'connection_changed', {
    isConnected,
  })
}

export const emitPairingChanged = (deviceId: string, isPaired: boolean) => {
  deviceEvents.emit(deviceId, 'pairing_changed', {
    isPaired,
  })
}

// KV Records Event Helpers
export const emitKvRecordsFetched = (deviceId: string, data: any) => {
  deviceEvents.emit(deviceId, 'kv_records_fetched', data)
}

export const emitKvRecordsAdded = (deviceId: string, data: any) => {
  deviceEvents.emit(deviceId, 'kv_records_added', data)
}

export const emitKvRecordsRemoved = (deviceId: string, data: any) => {
  deviceEvents.emit(deviceId, 'kv_records_removed', data)
}

export const emitKvRecordsUpdated = (deviceId: string, data: any) => {
  deviceEvents.emit(deviceId, 'kv_records_updated', data)
}

export const emitKvRecordsSynced = (deviceId: string, data: any) => {
  deviceEvents.emit(deviceId, 'kv_records_synced', data)
}

export const emitKvRecordsReset = (deviceId: string, data: any) => {
  deviceEvents.emit(deviceId, 'kv_records_reset', data)
}

// Wallet Address Event Helpers
export const emitWalletAddressesRequest = (deviceId: string, data: any) => {
  deviceEvents.emit(deviceId, 'wallet_addresses_request', data)
}

// Signing Request Event Helpers
export const emitSigningRequestCreated = (deviceId: string, signingRequest: any) => {
  deviceEvents.emit(deviceId, 'signing_request_created', signingRequest)
}

export const emitSigningRequestCompleted = (deviceId: string, data: any) => {
  deviceEvents.emit(deviceId, 'signing_request_completed', data)
}
