/**
 * Client-side handler for server requests
 * 
 * This hook listens for server requests via SSE and responds with data from
 * the client-side Zustand stores. It bridges the gap between server protocol
 * handlers and client-side state management.
 */

import { useEffect, useRef, useCallback } from 'react'
import { useDeviceStore } from '@/store/deviceStore'

interface ServerRequest {
  requestId: string
  type: string
  payload: any
  timestamp: number
}

export function useServerRequestHandler(deviceId: string) {
  const getAllKvRecords = useDeviceStore(state => state.getAllKvRecords)
  const getKvRecord = useDeviceStore(state => state.getKvRecord)
  const setKvRecord = useDeviceStore(state => state.setKvRecord) 
  const removeKvRecord = useDeviceStore(state => state.removeKvRecord)
  
  // Keep track of processed requests to avoid duplicates
  const processedRequests = useRef(new Set<string>())

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

      switch (request.type) {
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
          error = `Unknown request type: ${request.type}`
          console.warn(`[ServerRequestHandler] Unknown request type: ${request.type}`)
      }

      // Send response back to server
      const response = {
        requestId: request.requestId,
        type: request.type,
        data: responseData,
        error: error
      }

      await fetch('/api/client-response', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(response)
      })

      console.log(`[ServerRequestHandler] Sent response for: ${request.requestId}`)

    } catch (error) {
      console.error('[ServerRequestHandler] Error processing server request:', error)
      
      // Send error response
      await fetch('/api/client-response', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          requestId: request.requestId,
          type: request.type,
          error: error instanceof Error ? error.message : 'Unknown error'
        })
      })
    }
  }, [getAllKvRecords, getKvRecord, setKvRecord, removeKvRecord])

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

  // Set up event listener for server requests
  useEffect(() => {
    if (!deviceId) return

    let eventSource: EventSource | null = null

    const connectToServerRequests = () => {
      eventSource = new EventSource(`/api/device-events/${deviceId}`)
      
      eventSource.addEventListener('server_request', (event) => {
        try {
          const request: ServerRequest = JSON.parse(event.data)
          handleServerRequest(request)
        } catch (error) {
          console.error('[ServerRequestHandler] Error parsing server request:', error)
        }
      })

      eventSource.addEventListener('error', (error) => {
        console.error('[ServerRequestHandler] SSE error:', error)
        // Will automatically reconnect
      })

      console.log(`[ServerRequestHandler] Connected to server requests for device: ${deviceId}`)
    }

    connectToServerRequests()

    return () => {
      if (eventSource) {
        eventSource.close()
        console.log(`[ServerRequestHandler] Disconnected from server requests for device: ${deviceId}`)
      }
    }
  }, [deviceId, handleServerRequest])

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