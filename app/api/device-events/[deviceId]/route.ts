import { NextRequest } from 'next/server'
import { deviceEvents } from '@/lib/deviceEvents'

/**
 * Server-Sent Events endpoint for real-time device state updates
 * 
 * This endpoint provides a persistent connection to stream device state changes
 * to the client, allowing real-time updates when pairing mode is triggered
 * from the server side.
 * 
 * @param request - The incoming SSE request
 * @param params - Route parameters containing the deviceId
 * @returns Response stream with device state updates
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { deviceId: string } }
) {
  const { deviceId } = params

  console.log(`[SSE] Client connecting for device: ${deviceId}`)

  const stream = new ReadableStream({
    start(controller) {
      console.log('[SSE] Stream started')
      
      // Send initial state
      const sendEvent = (type: string, data: any) => {
        const event = `event: ${type}\ndata: ${JSON.stringify(data)}\n\n`
        try {
          controller.enqueue(new TextEncoder().encode(event))
        } catch (error) {
          console.error('[SSE] Error sending event:', error)
        }
      }

      // Send initial connection event (empty state for now)
      sendEvent('device_state', {
        deviceId,
        isPairingMode: false,
        pairingCode: undefined,
        pairingTimeRemaining: 0,
        isConnected: false,
        isPaired: false,
        timestamp: Date.now()
      })

      console.log('[SSE] Initial state sent for device:', deviceId)

      // Subscribe to device events from simulator
      const unsubscribeDeviceEvents = deviceEvents.subscribe(deviceId, (event) => {
        console.log(`[SSE] Device event received:`, event)
        
        // Forward simulator events to SSE clients
        sendEvent(event.type, {
          ...event.data,
          deviceId: event.deviceId,
          timestamp: event.timestamp
        })
      })

      console.log('[SSE] Subscribed to device events for:', deviceId)

      // Keep connection alive with heartbeat
      const heartbeatInterval = setInterval(() => {
        try {
          sendEvent('heartbeat', { timestamp: Date.now() })
        } catch (error) {
          console.error('[SSE] Heartbeat error:', error)
          clearInterval(heartbeatInterval)
        }
      }, 30000) // Send heartbeat every 30 seconds

      // Handle connection close
      const cleanup = () => {
        console.log(`[SSE] Cleaning up connection for device: ${deviceId}`)
        clearInterval(heartbeatInterval)
        unsubscribeDeviceEvents()
        try {
          controller.close()
        } catch (error) {
          console.error('[SSE] Error closing controller:', error)
        }
      }

      // Listen for client disconnect
      request.signal.addEventListener('abort', cleanup)

      // Store cleanup function for potential manual cleanup
      ;(controller as any)._cleanup = cleanup
    },

    cancel() {
      console.log(`[SSE] Stream cancelled for device: ${deviceId}`)
    }
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Cache-Control',
    },
  })
}