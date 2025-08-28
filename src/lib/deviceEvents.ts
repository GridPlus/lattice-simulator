/**
 * Simple event system for device state changes
 * This allows the simulator to broadcast events that the SSE endpoint can listen to
 */

type DeviceEventType = 'pairing_mode_started' | 'pairing_mode_ended' | 'connection_changed' | 'pairing_changed'

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
  emit(deviceId: string, type: DeviceEventType, data: any): void {
    const event: DeviceEvent = {
      deviceId,
      type,
      data,
      timestamp: Date.now()
    }

    console.log(`[DeviceEvents] Emitting event:`, event)

    const listeners = this.listeners.get(deviceId) || []
    listeners.forEach(listener => {
      try {
        listener(event)
      } catch (error) {
        console.error(`[DeviceEvents] Error in event listener:`, error)
      }
    })
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
export const emitPairingModeStarted = (deviceId: string, pairingCode: string, timeoutMs: number = 60000) => {
  deviceEvents.emit(deviceId, 'pairing_mode_started', {
    pairingCode,
    timeoutMs,
  })
}

export const emitPairingModeEnded = (deviceId: string) => {
  deviceEvents.emit(deviceId, 'pairing_mode_ended', {})
}

export const emitConnectionChanged = (deviceId: string, isConnected: boolean) => {
  console.log(`[DeviceEvents] emitConnectionChanged for device: ${deviceId}, isConnected: ${isConnected}`)
  deviceEvents.emit(deviceId, 'connection_changed', {
    isConnected,
  })
}

export const emitPairingChanged = (deviceId: string, isPaired: boolean) => {
  deviceEvents.emit(deviceId, 'pairing_changed', {
    isPaired,
  })
}