import { createServer } from 'http'
import { parse } from 'url'
import next from 'next'
import { WebSocketServer } from 'ws'
import { wsManager } from './src/lib/wsManager'

const dev = process.env.NODE_ENV !== 'production'
const hostname = 'localhost'
const port = parseInt(process.env.PORT || '3000', 10)

// Initialize Next.js app in custom server mode
const app = next({ dev })
const handle = app.getRequestHandler()

app.prepare().then(() => {
  console.log('> Next.js app prepared')
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

  // Handle WebSocket upgrades before Next.js can interfere
  server.on('upgrade', (request, socket, head) => {
    const url = parse(request.url!, true)
    const pathname = url.pathname
    
    console.log(`[WebSocket] Upgrade request for: ${pathname}`)
    
    // Only handle WebSocket upgrades for our path
    const deviceIdMatch = pathname?.match(/^\/ws\/device\/(.+)$/)
    if (!deviceIdMatch) {
      console.log(`[WebSocket] Rejected upgrade to invalid path: ${pathname}`)
      socket.destroy()
      return
    }
    
    const deviceId = deviceIdMatch[1]
    if (!deviceId) {
      console.log(`[WebSocket] Rejected upgrade with missing deviceId`)
      socket.destroy()
      return
    }
    
    // Store deviceId for later use
    ;(request as any).deviceId = deviceId
    
    console.log(`[WebSocket] Handling upgrade for device: ${deviceId}`)
    
    // Let WebSocket server handle the upgrade
    wss.handleUpgrade(request, socket, head, (ws) => {
      console.log(`[WebSocket] Upgrade completed for device: ${deviceId}`)
      wss.emit('connection', ws, request)
    })
  })

  const wss = new WebSocketServer({
    noServer: true // Don't create HTTP server, we'll handle upgrades manually
  })

  wss.on('connection', (ws, req) => {
    const deviceId = (req as any).deviceId
    console.log(`[WebSocket] Client connected for device: ${deviceId}`)
    
    // Register the WebSocket connection with wsManager
    wsManager.addConnection(deviceId, ws)
    
    // Handle WebSocket close
    ws.on('close', () => {
      console.log(`[WebSocket] Client disconnected for device: ${deviceId}`)
      wsManager.removeConnection(deviceId, ws)
    })
    
    // Handle WebSocket errors
    ws.on('error', (error) => {
      console.error(`[WebSocket] Error for device ${deviceId}:`, error)
      wsManager.removeConnection(deviceId, ws)
    })
  })

  wss.on('error', (error) => {
    console.error('[WebSocket] Server error:', error)
  })

  server.listen(port, () => {
    console.log(`> Ready on http://${hostname}:${port}`)
    console.log(`> WebSocket server ready at ws://${hostname}:${port}/ws/device/[deviceId]`)
  })
}).catch((err) => {
  console.error('Error starting server:', err)
  process.exit(1)
})