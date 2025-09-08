/**
 * Client-side handler for server requests
 * 
 * This hook connects to the WebSocket server and handles server requests,
 * responding with data from the client-side Zustand stores. It bridges the gap
 * between server protocol handlers and client-side state management.
 */

import { useEffect, useRef, useCallback } from 'react'
import { useDeviceStore } from '@/store/deviceStore'

interface ServerRequest {
  requestId: string
  requestType: string
  payload: any
}

interface WebSocketMessage {
  type: string
  data: any
  timestamp: number
}

export function useServerRequestHandler(deviceId: string) {
  const getAllKvRecords = useDeviceStore(state => state.getAllKvRecords)
  const getKvRecord = useDeviceStore(state => state.getKvRecord)
  const setKvRecord = useDeviceStore(state => state.setKvRecord) 
  const removeKvRecord = useDeviceStore(state => state.removeKvRecord)
  const setConnectionState = useDeviceStore(state => state.setConnectionState)
  const exitPairingMode = useDeviceStore(state => state.exitPairingMode)
  
  // Keep track of processed requests to avoid duplicates
  const processedRequests = useRef(new Set<string>())
  // WebSocket connection reference
  const wsRef = useRef<WebSocket | null>(null)
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  const sendResponse = useCallback((request: ServerRequest, responseData: any, error?: string) => {
    const ws = wsRef.current
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      console.error('[ServerRequestHandler] WebSocket not connected, cannot send response')
      return
    }

    const response: WebSocketMessage = {
      type: 'client_response',
      data: {
        requestId: request.requestId,
        requestType: request.requestType,
        data: responseData,
        error: error
      },
      timestamp: Date.now()
    }

    ws.send(JSON.stringify(response))
    console.log(`[ServerRequestHandler] Sent WebSocket response for: ${request.requestId}`)
  }, [])

  const handleServerRequest = useCallback(async (request: ServerRequest) => {
    // Avoid processing duplicate requests
    if (processedRequests.current.has(request.requestId)) {
      console.log(`[ServerRequestHandler] Skipping duplicate request: ${request.requestId}`)
      return
    }

    processedRequests.current.add(request.requestId)
    
    console.log(`[ServerRequestHandler] Processing server request:`, request)

    try {
      let responseData: any
      let success = true
      let error: string | undefined

      switch (request.requestType) {
        case 'get_kv_records':
          responseData = await handleGetKvRecords(request.payload)
          break

        case 'add_kv_records':
          responseData = await handleAddKvRecords(request.payload)
          break

        case 'remove_kv_records':
          responseData = await handleRemoveKvRecords(request.payload)
          break

        default:
          success = false
          error = `Unknown request type: ${request.requestType}`
          console.warn(`[ServerRequestHandler] Unknown request type: ${request.requestType}`)
      }

      // Send response back to server via WebSocket
      sendResponse(request, responseData, error)

    } catch (error) {
      console.error('[ServerRequestHandler] Error processing server request:', error)
      
      // Send error response via WebSocket
      sendResponse(request, undefined, error instanceof Error ? error.message : 'Unknown error')
    }
  }, [getAllKvRecords, getKvRecord, setKvRecord, removeKvRecord, sendResponse])

  const handleGetKvRecords = useCallback(async (payload: { type: number; n: number; start: number }) => {
    const { type, n, start } = payload
    
    console.log(`[ServerRequestHandler] Getting KV records: type=${type}, n=${n}, start=${start}`)
    
    // Get all records from the store
    const allRecords = getAllKvRecords()
    
    // Convert to the format expected by the protocol handler
    const records = Object.entries(allRecords)
      .map(([key, value], index) => ({
        id: start + index,
        type: type,
        caseSensitive: false,
        key: key,
        val: value
      }))
      .slice(start, start + n) // Apply pagination
    
    return {
      records,
      total: Object.keys(allRecords).length,
      fetched: records.length
    }
  }, [getAllKvRecords])

  const handleAddKvRecords = useCallback(async (payload: { records: Record<string, string> }) => {
    const { records } = payload
    
    console.log(`[ServerRequestHandler] Adding KV records:`, records)
    
    try {
      // Add each record to the store
      for (const [key, value] of Object.entries(records)) {
        setKvRecord(key, value)
      }
      
      return { success: true }
    } catch (error) {
      console.error('[ServerRequestHandler] Error adding KV records:', error)
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Failed to add records' 
      }
    }
  }, [setKvRecord])

  const handleRemoveKvRecords = useCallback(async (payload: { type: number; ids: number[] }) => {
    const { type, ids } = payload
    
    console.log(`[ServerRequestHandler] Removing KV records: type=${type}, ids=${ids}`)
    
    try {
      // Get all records to find which ones to remove based on IDs
      const allRecords = getAllKvRecords()
      const recordEntries = Object.entries(allRecords)
      
      // Remove records by their index positions (since IDs are essentially indices)
      for (const id of ids) {
        if (id < recordEntries.length) {
          const [key] = recordEntries[id]
          removeKvRecord(key)
        }
      }
      
      return { success: true }
    } catch (error) {
      console.error('[ServerRequestHandler] Error removing KV records:', error)
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Failed to remove records' 
      }
    }
  }, [getAllKvRecords, removeKvRecord])

  // Device event handlers
  const handleDeviceStateUpdate = useCallback((data: any) => {
    console.log('[ServerRequestHandler] Device state update:', data)
    
    // Get current store state to check for conflicts  
    const currentState = useDeviceStore.getState()
    
    // Prevent overwriting client state with older server state
    if (currentState.isConnected && !data.isConnected) {
      console.log('[ServerRequestHandler] Ignoring disconnect event - client is already connected')
      return
    }
    
    if (currentState.isPaired && !data.isPaired) {
      console.log('[ServerRequestHandler] Ignoring unpaired event - client is already paired')
      return
    }

    // Update connection state
    setConnectionState(data.isConnected, data.isPaired)

    // Handle pairing mode state  
    if (data.isPairingMode && data.pairingCode) {
      const store = useDeviceStore.getState()
      if (!store.isPairingMode) {
        store.enterPairingMode()
        console.log('[ServerRequestHandler] Entered pairing mode from server event')
      }
    } else if (!data.isPairingMode && currentState.isPairingMode) {
      exitPairingMode()
      console.log('[ServerRequestHandler] Exited pairing mode from server event')
    }
  }, [setConnectionState, exitPairingMode])

  const handlePairingModeStarted = useCallback((data: any) => {
    console.log('[ServerRequestHandler] Pairing mode started:', data)
    const store = useDeviceStore.getState()
    if (!store.isPairingMode) {
      store.enterPairingMode()
      console.log('[ServerRequestHandler] Entered pairing mode from server event')
    }
  }, [])

  const handlePairingModeEnded = useCallback((data: any) => {
    console.log('[ServerRequestHandler] Pairing mode ended:', data)
    exitPairingMode()
  }, [exitPairingMode])

  const handleConnectionChanged = useCallback((data: any) => {
    console.log('[ServerRequestHandler] Connection changed:', data.isConnected)
    const currentState = useDeviceStore.getState()
    setConnectionState(data.isConnected, currentState.isPaired)
  }, [setConnectionState])

  const handlePairingChanged = useCallback((data: any) => {
    console.log('[ServerRequestHandler] Pairing changed:', data.isPaired)
    const currentState = useDeviceStore.getState()
    setConnectionState(currentState.isConnected, data.isPaired)
  }, [setConnectionState])

  // WebSocket connection with auto-reconnection
  useEffect(() => {
    if (!deviceId) return

    const connectWebSocket = () => {
      // Clear any existing reconnect timeout
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current)
        reconnectTimeoutRef.current = null
      }

      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
      const host = window.location.hostname
      const wsPort = parseInt(window.location.port || '3000') + 443 // Use separate port for WebSocket (3443)
      const wsUrl = `${protocol}//${host}:${wsPort}/ws/device/${deviceId}`
      
      console.log(`[ServerRequestHandler] Connecting to WebSocket: ${wsUrl}`)
      
      const ws = new WebSocket(wsUrl)
      wsRef.current = ws

      ws.onopen = () => {
        console.log(`[ServerRequestHandler] WebSocket connected successfully for device: ${deviceId}`)
        console.log(`[ServerRequestHandler] WebSocket readyState: ${ws.readyState}`)
        console.log(`[ServerRequestHandler] WebSocket URL: ${wsUrl}`)
        
        // Send heartbeat to keep connection alive
        const heartbeat = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            console.log(`[ServerRequestHandler] Sending heartbeat for device: ${deviceId}`)
            ws.send(JSON.stringify({
              type: 'heartbeat',
              data: { deviceId },
              timestamp: Date.now()
            }))
          } else {
            console.log(`[ServerRequestHandler] Stopping heartbeat, WebSocket not open. ReadyState: ${ws.readyState}`)
            clearInterval(heartbeat)
          }
        }, 30000) // Every 30 seconds

        // Store heartbeat interval for cleanup
        ;(ws as any).heartbeatInterval = heartbeat
      }

      ws.onmessage = (event) => {
        try {
          console.log('[ServerRequestHandler] Received message:', event.data)
          const message: WebSocketMessage = JSON.parse(event.data)
          
          if (message.type === 'server_request') {
            const request: ServerRequest = message.data
            handleServerRequest(request)
          } else if (message.type === 'device_state') {
            handleDeviceStateUpdate(message.data)
          } else if (message.type === 'pairing_mode_started') {
            handlePairingModeStarted(message.data)
          } else if (message.type === 'pairing_mode_ended') {
            handlePairingModeEnded(message.data)
          } else if (message.type === 'connection_changed') {
            handleConnectionChanged(message.data)
          } else if (message.type === 'pairing_changed') {
            handlePairingChanged(message.data)
          } else if (message.type === 'heartbeat_response') {
            // Heartbeat acknowledgment - silent
          } else {
            console.log(`[ServerRequestHandler] Received message of type: ${message.type}`, message.data)
          }
        } catch (error) {
          console.error('[ServerRequestHandler] Error parsing WebSocket message:', error)
        }
      }

      ws.onclose = (event) => {
        console.log(`[ServerRequestHandler] WebSocket closed for device: ${deviceId}`)
        console.log(`[ServerRequestHandler] Close details - Code: ${event.code}, Reason: "${event.reason}", WasClean: ${event.wasClean}`)
        console.log(`[ServerRequestHandler] Close codes reference - 1000: Normal, 1001: Going away, 1006: Abnormal`)
        
        // Clean up heartbeat interval
        if ((ws as any).heartbeatInterval) {
          clearInterval((ws as any).heartbeatInterval)
          console.log(`[ServerRequestHandler] Cleared heartbeat interval`)
        }
        
        // Clear the reference if this was the current connection
        if (wsRef.current === ws) {
          wsRef.current = null
          console.log(`[ServerRequestHandler] Cleared WebSocket reference`)
        }
        
        // Attempt to reconnect after a delay (unless explicitly closed)
        if (event.code !== 1000) { // 1000 = normal closure
          console.log(`[ServerRequestHandler] Abnormal closure, attempting to reconnect in 3 seconds...`)
          reconnectTimeoutRef.current = setTimeout(() => {
            console.log(`[ServerRequestHandler] Reconnecting WebSocket for device: ${deviceId}`)
            connectWebSocket()
          }, 3000)
        } else {
          console.log(`[ServerRequestHandler] Normal closure, not reconnecting`)
        }
      }

      ws.onerror = (error) => {
        console.error(`[ServerRequestHandler] WebSocket error for device: ${deviceId}`, error)
        console.log(`[ServerRequestHandler] WebSocket readyState on error: ${ws.readyState}`)
        console.log(`[ServerRequestHandler] Error occurred for URL: ${wsUrl}`)
      }
    }

    connectWebSocket()

    return () => {
      // Clear reconnect timeout
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current)
        reconnectTimeoutRef.current = null
      }
      
      // Close WebSocket connection
      const ws = wsRef.current
      if (ws) {
        console.log(`[ServerRequestHandler] Closing WebSocket for device: ${deviceId}`)
        
        // Clean up heartbeat interval
        if ((ws as any).heartbeatInterval) {
          clearInterval((ws as any).heartbeatInterval)
        }
        
        ws.close(1000, 'Component unmounting')
        wsRef.current = null
      }
    }
  }, [deviceId, handleServerRequest, handleDeviceStateUpdate, handlePairingModeStarted, handlePairingModeEnded, handleConnectionChanged, handlePairingChanged])

  // Clean up old processed requests periodically
  useEffect(() => {
    const interval = setInterval(() => {
      if (processedRequests.current.size > 100) {
        // Keep only the last 50 requests
        const entries = Array.from(processedRequests.current)
        processedRequests.current.clear()
        entries.slice(-50).forEach(id => processedRequests.current.add(id))
      }
    }, 60000) // Every minute

    return () => clearInterval(interval)
  }, [])
}