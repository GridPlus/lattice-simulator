/**
 * Client-side handler for server requests
 *
 * This hook connects to the WebSocket server and handles server requests,
 * responding with data from the client-side Zustand stores. It bridges the gap
 * between server protocol handlers and client-side state management.
 */

import { useEffect, useRef, useCallback } from 'react'
import { useDeviceStore } from '@/client/store/clientDeviceStore'
import { createMultipleBitcoinAccounts } from '@/services/bitcoinWallet'
import { createMultipleEthereumAccounts } from '@/services/ethereumWallet'
import { createMultipleSolanaAccounts } from '@/services/solanaWallet'
import { detectCoinTypeFromPath } from '@/shared/utils/protocol'
import type { SigningRequest } from '@/shared/types/device'

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
  const getAllKvRecords = useDeviceStore((state: any) => state.getAllKvRecords)
  const getKvRecord = useDeviceStore((state: any) => state.getKvRecord)
  const setKvRecord = useDeviceStore((state: any) => state.setKvRecord)
  const removeKvRecord = useDeviceStore((state: any) => state.removeKvRecord)
  const setConnectionState = useDeviceStore((state: any) => state.setConnectionState)
  const exitPairingMode = useDeviceStore((state: any) => state.exitPairingMode)
  const addSigningRequest = useDeviceStore((state: any) => state.addSigningRequest)

  // Keep track of processed requests to avoid duplicates
  const processedRequests = useRef(new Set<string>())
  // WebSocket connection reference
  const wsRef = useRef<WebSocket | null>(null)
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  // Queue for failed responses to retry on reconnection
  const pendingResponses = useRef<
    Array<{ request: ServerRequest; responseData: any; error?: string }>
  >([])
  const maxPendingResponses = 10 // Limit queue size

  const sendResponse = useCallback((request: ServerRequest, responseData: any, error?: string) => {
    const ws = wsRef.current
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      console.error(
        `[ClientWebSocketHandler] WebSocket not connected, cannot send response. ReadyState: ${ws?.readyState || 'null'}`,
      )
      console.error(
        `[ClientWebSocketHandler] Failed to send response for request: ${request.requestId}`,
      )

      // Queue the response for retry when connection is restored
      if (pendingResponses.current.length < maxPendingResponses) {
        pendingResponses.current.push({ request, responseData, error })
        console.log(
          `[ClientWebSocketHandler] Queued response for retry. Queue size: ${pendingResponses.current.length}`,
        )
      } else {
        console.warn(
          `[ClientWebSocketHandler] Response queue full, dropping response for: ${request.requestId}`,
        )
      }

      return
    }

    const response: WebSocketMessage = {
      type: 'client_response',
      data: {
        requestId: request.requestId,
        requestType: request.requestType,
        data: responseData,
        error: error,
      },
      timestamp: Date.now(),
    }

    try {
      ws.send(JSON.stringify(response))
      console.log(
        `[ClientWebSocketHandler] Sent WebSocket response for: ${request.requestId}, data: ${JSON.stringify(responseData)}`,
      )
    } catch (sendError) {
      console.error('[ClientWebSocketHandler] Error sending WebSocket response:', sendError)
      console.error(
        `[ClientWebSocketHandler] Failed to send response for request: ${request.requestId}`,
      )
    }
  }, [])

  const handleSigningRequest = useCallback(
    async (signingRequest: SigningRequest) => {
      console.log('[ClientWebSocketHandler] Received signing request:', signingRequest)

      try {
        // Add the signing request to the device store
        // This will make it available for the UI to display
        addSigningRequest(signingRequest)

        console.log(
          `[ClientWebSocketHandler] Added signing request ${signingRequest.id} to store for user approval`,
        )

        // Return acknowledgment that we received the request
        // The actual approval/rejection will happen through user interaction
        return {
          success: true,
          message: 'Signing request received and queued for user approval',
          requestId: signingRequest.id,
        }
      } catch (error) {
        console.error('[ClientWebSocketHandler] Error handling signing request:', error)
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to process signing request',
        }
      }
    },
    [addSigningRequest],
  )

  const handleServerRequest = useCallback(
    async (request: ServerRequest) => {
      // Avoid processing duplicate requests
      if (processedRequests.current.has(request.requestId)) {
        console.log(`[ClientWebSocketHandler] Skipping duplicate request: ${request.requestId}`)
        return
      }

      processedRequests.current.add(request.requestId)

      console.log('[ClientWebSocketHandler] Processing server request:', request)

      try {
        let responseData: any
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

          case 'signing_request':
            responseData = await handleSigningRequest(request.payload)
            break

          default:
            error = `Unknown request type: ${request.requestType}`
            console.warn(`[ClientWebSocketHandler] Unknown request type: ${request.requestType}`)
        }

        // Send response back to server via WebSocket
        sendResponse(request, responseData, error)
      } catch (error) {
        console.error('[ClientWebSocketHandler] Error processing server request:', error)

        // Send error response via WebSocket
        sendResponse(request, undefined, error instanceof Error ? error.message : 'Unknown error')
      }
    },
    [getAllKvRecords, getKvRecord, setKvRecord, removeKvRecord, handleSigningRequest, sendResponse],
  )

  const handleGetKvRecords = useCallback(
    async (payload: { type: number; n: number; start: number }) => {
      const { type, n, start } = payload

      console.log(
        `[ClientWebSocketHandler] Getting KV records: type=${type}, n=${n}, start=${start}`,
      )

      // Get all records from the store
      const allRecords = getAllKvRecords()

      // Convert to the format expected by the protocol handler
      const records = Object.entries(allRecords)
        .map(([key, value], index) => ({
          id: start + index,
          type: type,
          caseSensitive: false,
          key: key,
          val: value,
        }))
        .slice(start, start + n) // Apply pagination

      return {
        records,
        total: Object.keys(allRecords).length,
        fetched: records.length,
      }
    },
    [getAllKvRecords],
  )

  const handleAddKvRecords = useCallback(
    async (payload: { records: Record<string, string> }) => {
      const { records } = payload

      console.log('[ClientWebSocketHandler] Adding KV records:', records)

      try {
        // Add each record to the store
        for (const [key, value] of Object.entries(records)) {
          setKvRecord(key, value)
        }

        return { success: true }
      } catch (error) {
        console.error('[ClientWebSocketHandler] Error adding KV records:', error)
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to add records',
        }
      }
    },
    [setKvRecord],
  )

  const handleRemoveKvRecords = useCallback(
    async (payload: { type: number; ids: number[] }) => {
      const { type, ids } = payload

      console.log(`[ClientWebSocketHandler] Removing KV records: type=${type}, ids=${ids}`)

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
        console.error('[ClientWebSocketHandler] Error removing KV records:', error)
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to remove records',
        }
      }
    },
    [getAllKvRecords, removeKvRecord],
  )

  // Device event handlers
  const handleDeviceStateUpdate = useCallback(
    (data: any) => {
      console.log('[ClientWebSocketHandler] Device state update:', data)

      // Get current store state to check for conflicts
      const currentState = useDeviceStore.getState()

      // Prevent overwriting client state with older server state
      if (currentState.isConnected && !data.isConnected) {
        console.log(
          '[ClientWebSocketHandler] Ignoring disconnect event - client is already connected',
        )
        return
      }

      if (currentState.isPaired && !data.isPaired) {
        console.log('[ClientWebSocketHandler] Ignoring unpaired event - client is already paired')
        return
      }

      // Update connection state
      setConnectionState(data.isConnected, data.isPaired)

      // Handle pairing mode state
      if (data.isPairingMode && data.pairingCode) {
        const store = useDeviceStore.getState()
        if (!store.isPairingMode) {
          store.enterPairingMode(data)
          console.log('[ClientWebSocketHandler] Entered pairing mode from server event')
        }
      } else if (!data.isPairingMode && currentState.isPairingMode) {
        exitPairingMode()
        console.log('[ClientWebSocketHandler] Exited pairing mode from server event')
      }
    },
    [setConnectionState, exitPairingMode],
  )

  const handlePairingModeStarted = useCallback((data: any) => {
    console.log('[ClientWebSocketHandler] Pairing mode started:', data)
    const store = useDeviceStore.getState()
    if (!store.isPairingMode) {
      store.enterPairingMode(data)
      console.log('[ClientWebSocketHandler] Entered pairing mode from server event')
    }
  }, [])

  const handlePairingModeEnded = useCallback(
    (data: any) => {
      console.log('[ClientWebSocketHandler] Pairing mode ended:', data)
      exitPairingMode()
    },
    [exitPairingMode],
  )

  const handleConnectionChanged = useCallback(
    (data: any) => {
      console.log('[ClientWebSocketHandler] Connection changed:', data.isConnected)
      const currentState = useDeviceStore.getState()
      setConnectionState(data.isConnected, currentState.isPaired)
    },
    [setConnectionState],
  )

  const handlePairingChanged = useCallback(
    (data: any) => {
      console.log('[ClientWebSocketHandler] Pairing changed:', data.isPaired)
      const currentState = useDeviceStore.getState()
      setConnectionState(currentState.isConnected, data.isPaired)
    },
    [setConnectionState],
  )

  const handleWalletAddressesRequest = useCallback(
    async (data: any) => {
      console.log('[ClientWebSocketHandler] Wallet addresses request:', data)

      try {
        const { startPath, count = 10 } = data

        // Detect coin type from path or use provided coinType
        const coinType = data.coinType || detectCoinTypeFromPath(startPath) || 'ETH'

        // Extract BIP44 parameters from derivation path
        const accountIndex = startPath[2] || 0 // BIP44 account index
        const walletType = startPath[3] === 0 ? 'external' : 'internal' // BIP44 change
        const startIndex = startPath[4] || 0 // BIP44 address index

        console.log(
          `[ClientWebSocketHandler] Deriving ${count} addresses for ${coinType}, account: ${accountIndex}, type: ${walletType}, startIndex: ${startIndex}`,
        )

        let accounts: any[] = []

        // Use proper wallet implementations based on coin type
        switch (coinType) {
          case 'ETH':
            accounts = await createMultipleEthereumAccounts(
              accountIndex,
              walletType,
              count,
              startIndex,
            )
            break
          case 'BTC':
            accounts = await createMultipleBitcoinAccounts(
              accountIndex,
              walletType,
              'segwit',
              count,
              startIndex,
            )
            break
          case 'SOL':
            accounts = await createMultipleSolanaAccounts(
              accountIndex,
              walletType,
              count,
              startIndex,
            )
            break
          default:
            throw new Error(`Unsupported coin type: ${coinType}`)
        }

        // Convert accounts to address format expected by server
        const addresses = accounts.map((account, index) => ({
          address: account.address,
          publicKey: account.publicKey,
          path: [...startPath.slice(0, -1), startIndex + index],
          index: startIndex + index,
        }))

        console.log(
          `[ClientWebSocketHandler] Generated ${addresses.length} addresses using ${coinType} wallet:`,
          addresses.slice(0, 2), // Log first 2 for debugging
        )

        // Send addresses back to server via WebSocket event
        if (wsRef.current?.readyState === WebSocket.OPEN) {
          const response = {
            type: 'device_event',
            eventType: 'wallet_addresses_derived',
            data: {
              deviceId,
              coinType,
              startPath,
              addresses,
              count,
            },
            timestamp: Date.now(),
          }

          wsRef.current.send(JSON.stringify(response))
          console.log('[ClientWebSocketHandler] Sent wallet addresses back to server via WebSocket')
        } else {
          console.error('[ClientWebSocketHandler] WebSocket not available to send addresses')
        }
      } catch (error) {
        console.error('[ClientWebSocketHandler] Error deriving wallet addresses:', error)

        // Send error response to server
        if (wsRef.current?.readyState === WebSocket.OPEN) {
          const errorResponse = {
            type: 'device_event',
            eventType: 'wallet_addresses_error',
            data: {
              deviceId,
              error: error instanceof Error ? error.message : 'Failed to derive addresses',
              originalRequest: data,
            },
            timestamp: Date.now(),
          }

          wsRef.current.send(JSON.stringify(errorResponse))
        }
      }
    },
    [deviceId, wsRef],
  )

  // Listen for custom device events from deviceEvents.ts
  useEffect(() => {
    if (typeof window === 'undefined') return

    const handleDeviceEvent = (event: CustomEvent) => {
      const { deviceId: eventDeviceId, eventType, data } = event.detail

      // Only handle events for this device
      if (eventDeviceId !== deviceId) return

      // Send the event to the server via WebSocket
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        const message = {
          type: 'device_event',
          deviceId: eventDeviceId,
          eventType,
          data,
          timestamp: Date.now(),
        }

        console.log('[ClientWebSocketHandler] Forwarding device event to server:', message)
        wsRef.current.send(JSON.stringify(message))
      } else {
        console.warn(
          '[ClientWebSocketHandler] Cannot forward device event - WebSocket not connected',
        )
      }
    }

    window.addEventListener('lattice-device-event', handleDeviceEvent as EventListener)

    return () => {
      window.removeEventListener('lattice-device-event', handleDeviceEvent as EventListener)
    }
  }, [deviceId])

  // Listen for custom device commands from deviceStore
  useEffect(() => {
    if (typeof window === 'undefined') return

    const handleDeviceCommand = (event: CustomEvent) => {
      const { deviceId: commandDeviceId, command, data } = event.detail

      // Only handle commands for this device
      if (commandDeviceId !== deviceId) return

      // Send the command to the server via WebSocket
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        const message = {
          type: 'device_command',
          data: {
            command,
            data,
          },
          timestamp: Date.now(),
        }

        console.log('[ClientWebSocketHandler] Sending device command to server:', message)
        wsRef.current.send(JSON.stringify(message))
      } else {
        console.warn(
          '[ClientWebSocketHandler] Cannot send device command - WebSocket not connected',
        )
      }
    }

    window.addEventListener('lattice-device-command', handleDeviceCommand as EventListener)

    return () => {
      window.removeEventListener('lattice-device-command', handleDeviceCommand as EventListener)
    }
  }, [deviceId])

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

      console.log(`[ClientWebSocketHandler] Connecting to WebSocket: ${wsUrl}`)

      const ws = new WebSocket(wsUrl)
      wsRef.current = ws

      ws.onopen = () => {
        console.log(
          `[ClientWebSocketHandler] WebSocket connected successfully for device: ${deviceId}`,
        )
        console.log(`[ClientWebSocketHandler] WebSocket readyState: ${ws.readyState}`)
        console.log(`[ClientWebSocketHandler] WebSocket URL: ${wsUrl}`)
        console.log(`[ClientWebSocketHandler] WebSocket protocol: ${ws.protocol}`)
        console.log(`[ClientWebSocketHandler] WebSocket extensions: ${ws.extensions}`)

        // Send heartbeat to keep connection alive
        const heartbeat = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            console.log(`[ClientWebSocketHandler] Sending heartbeat for device: ${deviceId}`)
            try {
              ws.send(
                JSON.stringify({
                  type: 'heartbeat',
                  data: { deviceId },
                  timestamp: Date.now(),
                }),
              )
            } catch (heartbeatError) {
              console.error('[ClientWebSocketHandler] Error sending heartbeat:', heartbeatError)
              clearInterval(heartbeat)
            }
          } else {
            console.log(
              `[ClientWebSocketHandler] Stopping heartbeat, WebSocket not open. ReadyState: ${ws.readyState}`,
            )
            clearInterval(heartbeat)
          }
        }, 30000) // Every 30 seconds

        // Store heartbeat interval for cleanup
        ;(ws as any).heartbeatInterval = heartbeat

        // Retry any pending responses that failed to send
        if (pendingResponses.current.length > 0) {
          console.log(
            `[ClientWebSocketHandler] Retrying ${pendingResponses.current.length} pending responses`,
          )
          const responses = [...pendingResponses.current]
          pendingResponses.current = [] // Clear the queue

          // Retry each pending response directly (avoid callback dependency)
          responses.forEach(({ request, responseData, error }) => {
            console.log(`[ClientWebSocketHandler] Retrying response for: ${request.requestId}`)

            const response: WebSocketMessage = {
              type: 'client_response',
              data: {
                requestId: request.requestId,
                requestType: request.requestType,
                data: responseData,
                error: error,
              },
              timestamp: Date.now(),
            }

            try {
              ws.send(JSON.stringify(response))
              console.log(
                `[ClientWebSocketHandler] Successfully retried response for: ${request.requestId}`,
              )
            } catch (retryError) {
              console.error(
                `[ClientWebSocketHandler] Failed to retry response for: ${request.requestId}`,
                retryError,
              )
            }
          })
        }
      }

      ws.onmessage = event => {
        try {
          console.log('[ClientWebSocketHandler] Received message:', event.data)
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
          } else if (message.type === 'wallet_addresses_request') {
            handleWalletAddressesRequest(message.data)
          } else if (message.type === 'heartbeat_response') {
            // Heartbeat acknowledgment - silent
          } else {
            console.log(
              `[ClientWebSocketHandler] Received message of type: ${message.type}`,
              message.data,
            )
          }
        } catch (error) {
          console.error('[ClientWebSocketHandler] Error parsing WebSocket message:', error)
        }
      }

      ws.onclose = event => {
        console.log(`[ClientWebSocketHandler] WebSocket closed for device: ${deviceId}`)
        console.log(
          `[ClientWebSocketHandler] Close details - Code: ${event.code}, Reason: "${event.reason}", WasClean: ${event.wasClean}`,
        )
        console.log(
          '[ClientWebSocketHandler] Close codes reference - 1000: Normal, 1001: Going away, 1006: Abnormal',
        )

        // Clean up heartbeat interval
        if ((ws as any).heartbeatInterval) {
          clearInterval((ws as any).heartbeatInterval)
          console.log('[ClientWebSocketHandler] Cleared heartbeat interval')
        }

        // Clear the reference if this was the current connection
        if (wsRef.current === ws) {
          wsRef.current = null
          console.log('[ClientWebSocketHandler] Cleared WebSocket reference')
        }

        // Attempt to reconnect after a delay (unless explicitly closed)
        if (event.code !== 1000) {
          // 1000 = normal closure
          console.log(
            '[ClientWebSocketHandler] Abnormal closure, attempting to reconnect in 3 seconds...',
          )
          reconnectTimeoutRef.current = setTimeout(() => {
            console.log(`[ClientWebSocketHandler] Reconnecting WebSocket for device: ${deviceId}`)
            connectWebSocket()
          }, 3000)
        } else {
          console.log('[ClientWebSocketHandler] Normal closure, not reconnecting')
        }
      }

      ws.onerror = error => {
        console.error(`[ClientWebSocketHandler] WebSocket error for device: ${deviceId}`, error)
        console.log(`[ClientWebSocketHandler] WebSocket readyState on error: ${ws.readyState}`)
        console.log(`[ClientWebSocketHandler] Error occurred for URL: ${wsUrl}`)
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
        console.log(`[ClientWebSocketHandler] Closing WebSocket for device: ${deviceId}`)

        // Clean up heartbeat interval
        if ((ws as any).heartbeatInterval) {
          clearInterval((ws as any).heartbeatInterval)
        }

        ws.close(1000, 'Component unmounting')
        wsRef.current = null
      }
    }
  }, [
    deviceId,
    handleServerRequest,
    handleDeviceStateUpdate,
    handlePairingModeStarted,
    handlePairingModeEnded,
    handleConnectionChanged,
    handlePairingChanged,
    handleWalletAddressesRequest,
  ])

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
