/**
 * Custom hook for managing Server-Sent Events connection to device state updates
 */

import { useEffect, useRef } from 'react'
import { useDeviceStore } from '@/store'

export interface DeviceEventData {
  deviceId: string
  isPairingMode: boolean
  pairingCode?: string
  pairingTimeRemaining: number
  isConnected: boolean
  isPaired: boolean
  timestamp: number
}

export interface PairingModeStartedData {
  pairingCode: string
  timeoutMs: number
  timestamp: number
}

export interface PairingModeEndedData {
  timestamp: number
}

export interface ConnectionChangedData {
  isConnected: boolean
  timestamp: number
}

export interface PairingChangedData {
  isPaired: boolean
  timestamp: number
}

/**
 * Hook to establish and manage SSE connection for real-time device updates
 * 
 * @param deviceId - The device ID to listen for events
 * @param enabled - Whether to enable the connection (default: true)
 */
export function useDeviceEvents(deviceId: string | null, enabled: boolean = true) {
  const eventSourceRef = useRef<EventSource | null>(null)
  const { 
    setConnectionState, 
    exitPairingMode,
  } = useDeviceStore()

  useEffect(() => {
    // Check if we're in the browser environment
    if (typeof window === 'undefined' || typeof EventSource === 'undefined') {
      console.log('[useDeviceEvents] Not in browser environment, skipping SSE connection')
      return
    }

    if (!deviceId) {
      console.log('[useDeviceEvents] No deviceId provided, skipping SSE connection')
      // Clean up existing connection
      if (eventSourceRef.current) {
        console.log('[useDeviceEvents] Closing existing SSE connection')
        eventSourceRef.current.close()
        eventSourceRef.current = null
      }
      return
    }

    if (!enabled) {
      console.log('[useDeviceEvents] SSE connection disabled, skipping')
      // Clean up existing connection
      if (eventSourceRef.current) {
        console.log('[useDeviceEvents] Closing existing SSE connection')
        eventSourceRef.current.close()
        eventSourceRef.current = null
      }
      return
    }

    console.log(`[useDeviceEvents] Establishing SSE connection for device: ${deviceId}, enabled: ${enabled}`)

    // Create new EventSource connection
    const eventSource = new EventSource(`/api/device-events/${deviceId}`)
    eventSourceRef.current = eventSource

    // Handle connection opened
    eventSource.onopen = () => {
      console.log('[useDeviceEvents] SSE connection opened')
    }

    // Handle general device state updates
    eventSource.addEventListener('device_state', (event) => {
      try {
        const data: DeviceEventData = JSON.parse(event.data)
        console.log('[useDeviceEvents] Device state update:', data)

        // Update connection state
        setConnectionState(data.isConnected, data.isPaired)

        // Handle pairing mode state
        if (data.isPairingMode && data.pairingCode) {
          // Calculate remaining time and trigger pairing mode
          const currentState = useDeviceStore.getState()
          if (!currentState.isPairingMode) {
            console.log('[useDeviceEvents] Entering pairing mode from server event')
            
            // We need to manually set the pairing state since the server triggered it
            // Update store state to match server
            const { setState } = useDeviceStore
            setState((draft) => {
              draft.isPairingMode = true
              draft.pairingCode = data.pairingCode
              draft.pairingStartTime = data.timestamp - ((data.pairingTimeRemaining || 60) * 1000 - 60000) // Calculate start time
              draft.pairingTimeoutMs = 60000 // 60 seconds timeout
            })
          }
        } else if (!data.isPairingMode) {
          const currentState = useDeviceStore.getState()
          if (currentState.isPairingMode) {
            console.log('[useDeviceEvents] Exiting pairing mode from server event')
            exitPairingMode()
          }
        }

      } catch (error) {
        console.error('[useDeviceEvents] Error parsing device_state event:', error)
      }
    })

    // Handle specific pairing mode started events
    eventSource.addEventListener('pairing_mode_started', (event) => {
      try {
        const data: PairingModeStartedData = JSON.parse(event.data)
        console.log('[useDeviceEvents] Pairing mode started:', data)
        
        // Set pairing mode state directly in store
        const { setState } = useDeviceStore
        setState((draft) => {
          draft.isPairingMode = true
          draft.pairingCode = data.pairingCode
          draft.pairingStartTime = data.timestamp
          draft.pairingTimeoutMs = data.timeoutMs
        })

      } catch (error) {
        console.error('[useDeviceEvents] Error parsing pairing_mode_started event:', error)
      }
    })

    // Handle pairing mode ended events
    eventSource.addEventListener('pairing_mode_ended', () => {
      try {
        console.log('[useDeviceEvents] Pairing mode ended')
        exitPairingMode()
      } catch (error) {
        console.error('[useDeviceEvents] Error parsing pairing_mode_ended event:', error)
      }
    })

    // Handle connection changes
    eventSource.addEventListener('connection_changed', (event) => {
      try {
        console.log('[useDeviceEvents] Connection changed event received, event: ', event)
        const data: ConnectionChangedData = JSON.parse(event.data)
        console.log('[useDeviceEvents] Connection changed:', data.isConnected)
        
        const currentState = useDeviceStore.getState()
        setConnectionState(data.isConnected, currentState.isPaired)
      } catch (error) {
        console.error('[useDeviceEvents] Error parsing connection_changed event:', error)
      }
    })

    // Handle pairing changes
    eventSource.addEventListener('pairing_changed', (event) => {
      try {
        console.log('[useDeviceEvents] Pairing changed event received, event: ', event)
        const data: PairingChangedData = JSON.parse(event.data)
        console.log('[useDeviceEvents] Pairing changed:', data.isPaired)
        
        const currentState = useDeviceStore.getState()
        setConnectionState(currentState.isConnected, data.isPaired)
      } catch (error) {
        console.error('[useDeviceEvents] Error parsing pairing_changed event:', error)
      }
    })

    // Handle heartbeat (keep connection alive)
    eventSource.addEventListener('heartbeat', () => {
      // Just log occasionally to avoid spam
      if (Math.random() < 0.1) { // Log ~10% of heartbeats
        console.log('[useDeviceEvents] Heartbeat received')
      }
    })

    // Handle connection errors
    eventSource.onerror = (error) => {
      console.error('[useDeviceEvents] SSE connection error:', error)
      
      // If connection is closed, try to reconnect after a delay
      if (eventSource.readyState === EventSource.CLOSED) {
        console.log('[useDeviceEvents] SSE connection closed, will attempt reconnect')
      }
    }

    // Cleanup function
    return () => {
      console.log('[useDeviceEvents] Cleaning up SSE connection')
      if (eventSourceRef.current) {
        eventSourceRef.current.close()
        eventSourceRef.current = null
      }
    }
  }, [deviceId, enabled, setConnectionState, exitPairingMode])

  // Return connection status
  return {
    isConnected: typeof EventSource !== 'undefined' && eventSourceRef.current?.readyState === EventSource.OPEN,
    connectionState: typeof EventSource !== 'undefined' ? (eventSourceRef.current?.readyState ?? EventSource.CLOSED) : 2, // 2 = CLOSED
  }
}