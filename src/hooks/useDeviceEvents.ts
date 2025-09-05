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

export interface KvRecordsFetchedData {
  records: Array<{ id: number; type: number; caseSensitive: boolean; key: string; val: string }>
  total: number
  fetched: number
  type: number
  start: number
  n: number
  timestamp: number
}

export interface KvRecordsAddedData {
  records: Array<{ key: string; value: string }>
  count: number
  timestamp: number
}

export interface KvRecordsRemovedData {
  removedRecords: Array<{ id: number; key: string }>
  count: number
  type: number
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
  const lastProcessedTimestampRef = useRef<number>(0)
  const processedEventsRef = useRef<Set<string>>(new Set())
  const { 
    setConnectionState, 
    exitPairingMode,
  } = useDeviceStore()

  // Helper function to check if event should be processed (avoid re-processing old events)
  const shouldProcessEvent = (timestamp: number, eventType: string, eventData: any): boolean => {
    // Create a unique event identifier
    const eventId = `${eventType}-${timestamp}-${JSON.stringify(eventData)}`
    
    // Check if we've already processed this exact event
    if (processedEventsRef.current.has(eventId)) {
      console.log('[useDeviceEvents] Skipping duplicate event:', eventId)
      return false
    }
    
    // Check if this is an old event
    if (timestamp + 1000 <= lastProcessedTimestampRef.current) {
      console.log('[useDeviceEvents] Skipping old event with timestamp:', timestamp, 'last processed:', lastProcessedTimestampRef.current)
      return false
    }
    
    // Mark this event as processed
    processedEventsRef.current.add(eventId)
    lastProcessedTimestampRef.current = timestamp
    
    // Clean up old processed events (keep only last 100)
    if (processedEventsRef.current.size > 100) {
      const eventsArray = Array.from(processedEventsRef.current)
      processedEventsRef.current.clear()
      // Keep the most recent 50 events
      eventsArray.slice(-50).forEach(event => processedEventsRef.current.add(event))
    }
    
    return true
  }

  useEffect(() => {
    // Initialize timestamp ref with current time to avoid processing very old events on initial load
    if (lastProcessedTimestampRef.current === 0) {
      lastProcessedTimestampRef.current = Date.now()
      console.log('[useDeviceEvents] Initialized timestamp ref with current time:', lastProcessedTimestampRef.current)
    }
    
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

        // Check if this event should be processed (avoid re-processing old events)
        if (!shouldProcessEvent(data.timestamp, 'device_state', data)) {
          return
        }

        // Get current store state to check for conflicts
        const currentState = useDeviceStore.getState()
        
        // If the SSE state conflicts with our persisted state and we're already connected/paired,
        // this might be an old state update - log it but don't overwrite
        if (currentState.isConnected && !data.isConnected) {
          console.log('[useDeviceEvents] Ignoring SSE disconnect event - client is already connected')
          return
        }
        
        if (currentState.isPaired && !data.isPaired) {
          console.log('[useDeviceEvents] Ignoring SSE unpaired event - client is already paired')
          return
        }

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
        
        // Check if this event should be processed (avoid re-processing old events)
        if (!shouldProcessEvent(data.timestamp, 'pairing_mode_started', data)) {
          return
        }
        
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
    eventSource.addEventListener('pairing_mode_ended', (event) => {
      try {
        const data: PairingModeEndedData = JSON.parse(event.data)
        console.log('[useDeviceEvents] Pairing mode ended:', data)
        
        // Check if this event should be processed (avoid re-processing old events)
        if (!shouldProcessEvent(data.timestamp, 'pairing_mode_ended', data)) {
          return
        }
        
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
        
        // Check if this event should be processed (avoid re-processing old events)
        if (!shouldProcessEvent(data.timestamp, 'connection_changed', data)) {
          return
        }
        
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
        
        // Check if this event should be processed (avoid re-processing old events)
        if (!shouldProcessEvent(data.timestamp, 'pairing_changed', data)) {
          return
        }
        
        const currentState = useDeviceStore.getState()
        setConnectionState(currentState.isConnected, data.isPaired)
      } catch (error) {
        console.error('[useDeviceEvents] Error parsing pairing_changed event:', error)
      }
    })

    // Handle KV records fetched events
    eventSource.addEventListener('kv_records_fetched', (event) => {
      try {
        const data: KvRecordsFetchedData = JSON.parse(event.data)
        console.log('[useDeviceEvents] KV records fetched:', data)
        
        // Check if this event should be processed (avoid re-processing old events)
        if (!shouldProcessEvent(data.timestamp, 'kv_records_fetched', data)) {
          return
        }
        
        // Note: We don't update the store here because:
        // 1. The server doesn't have persistent storage
        // 2. The client maintains its own KV record state
        // 3. This event is just a notification that a fetch operation occurred
        // 4. The actual data should come from the client's own store or API response
        
      } catch (error) {
        console.error('[useDeviceEvents] Error parsing kv_records_fetched event:', error)
      }
    })

    // Handle KV records added events
    eventSource.addEventListener('kv_records_added', (event) => {
      try {
        const data: KvRecordsAddedData = JSON.parse(event.data)
        console.log('[useDeviceEvents] KV records added:', data)
        
        // Check if this event should be processed (avoid re-processing old events)
        if (!shouldProcessEvent(data.timestamp, 'kv_records_added', data)) {
          return
        }
        
        // Note: We don't automatically add records here because:
        // 1. The client should control its own KV record state
        // 2. This event is just a notification that records were added on the device
        // 3. The client can choose to sync its state or ignore the notification
        // 4. For now, we'll just log the event for debugging purposes
        
      } catch (error) {
        console.error('[useDeviceEvents] Error parsing kv_records_added event:', error)
      }
    })

    // Handle KV records removed events
    eventSource.addEventListener('kv_records_removed', (event) => {
      try {
        const data: KvRecordsRemovedData = JSON.parse(event.data)
        console.log('[useDeviceEvents] KV records removed:', data)
        
        // Check if this event should be processed (avoid re-processing old events)
        if (!shouldProcessEvent(data.timestamp, 'kv_records_removed', data)) {
          return
        }
        
        // Note: We don't automatically remove records here because:
        // 1. The client should control its own KV record state
        // 2. This event is just a notification that records were removed on the device
        // 3. The client can choose to sync its state or ignore the notification
        // 4. For now, we'll just log the event for debugging purposes
        
      } catch (error) {
        console.error('[useDeviceEvents] Error parsing kv_records_removed event:', error)
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