import { createServer } from 'http'
import { parse } from 'url'
import next from 'next'
import { WebSocketServer } from 'ws'
import { wsManager } from '@/server/serverWebSocketManager'

const dev = process.env.NODE_ENV !== 'production'
const hostname = 'localhost'
const port = parseInt(process.env.PORT || '3000', 10)
const wsPort = port + 443 // Use a separate port for WebSocket server

// Initialize Next.js app in custom server mode
const app = next({ dev })
const handle = app.getRequestHandler()

app.prepare().then(() => {
  console.log('> Next.js app prepared')
  
  // Create a separate HTTP server for WebSocket connections
  const wsServer = createServer()
  const wss = new WebSocketServer({ 
    server: wsServer,
    verifyClient: (info: any) => {
      const url = parse(info.req.url!, true)
      const pathname = url.pathname
      const deviceIdMatch = pathname?.match(/^\/ws\/device\/(.+)$/)
      
      if (!deviceIdMatch) {
        console.log(`[WebSocket] Rejecting non-WebSocket path: ${pathname}`)
        return false
      }
      
      const deviceId = deviceIdMatch[1]
      if (!deviceId) {
        console.log(`[WebSocket] Rejecting upgrade with missing deviceId`)
        return false
      }
      
      console.log(`[WebSocket] Accepting WebSocket upgrade for device: ${deviceId}`)
      return true
    }
  })

  // Create the main HTTP server for Next.js
  const server = createServer(async (req, res) => {
    try {
      const parsedUrl = parse(req.url!, true)
      
      // Let Next.js handle all HTTP requests
      await handle(req, res, parsedUrl)
    } catch (err) {
      console.error('Error occurred handling', req.url, err)
      res.statusCode = 500
      res.end('internal server error')
    }
  })

  wss.on('connection', (ws, req) => {
    // Extract deviceId directly from the URL since the property isn't preserved
    const url = parse(req.url!, true)
    const pathname = url.pathname
    const deviceIdMatch = pathname?.match(/^\/ws\/device\/(.+)$/)
    const deviceId = deviceIdMatch ? deviceIdMatch[1] : undefined
    
    console.log(`[WebSocket] Client connected for device: ${deviceId}`)
    console.log(`[WebSocket] Connection readyState: ${ws.readyState}`)
    console.log(`[WebSocket] Request URL: ${req.url}`)
    console.log(`[WebSocket] Extracted deviceId from URL: ${deviceId}`)
    
    if (!deviceId) {
      console.error(`[WebSocket] ERROR: deviceId is undefined! Request URL: ${req.url}`)
      ws.close(1000, 'Missing deviceId')
      return
    }
    
    // Register the WebSocket connection with wsManager
    wsManager.addConnection(deviceId, ws)
    
    // Handle WebSocket close
    ws.on('close', (code, reason) => {
      console.log(`[WebSocket] Client disconnected for device: ${deviceId}`)
      console.log(`[WebSocket] Close details - Code: ${code}, Reason: "${reason.toString()}"`)
      wsManager.removeConnection(deviceId, ws)
    })
    
    // Handle WebSocket errors
    ws.on('error', (error) => {
      console.error(`[WebSocket] Error for device ${deviceId}:`, error)
      console.log(`[WebSocket] Error readyState: ${ws.readyState}`)
      wsManager.removeConnection(deviceId, ws)
    })
    
    // Note: WebSocket message handling is done by wsManager.addConnection()
    // which sets up its own message handler with proper deviceId context
  })

  wss.on('error', (error) => {
    console.error('[WebSocket] Server error:', error)
  })

  // Start both servers
  server.listen(port, () => {
    console.log(`> Next.js server ready on http://${hostname}:${port}`)
  })
  
  wsServer.listen(wsPort, () => {
    console.log(`> WebSocket server ready at ws://${hostname}:${wsPort}/ws/device/[deviceId]`)
  })
}).catch((err) => {
  console.error('Error starting server:', err)
  process.exit(1)
})