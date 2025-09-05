import { NextRequest, NextResponse } from 'next/server'
import { requestManager, type ClientResponse } from '@/lib/requestManager'

/**
 * API endpoint for handling client responses to server requests
 * 
 * This endpoint receives responses from the client-side when it has
 * processed a server request (like fetching KV records from localStorage).
 */
export async function POST(request: NextRequest) {
  try {
    const clientResponse: ClientResponse = await request.json()
    
    console.log('[API] Received client response:', {
      requestId: clientResponse.requestId,
      type: clientResponse.type,
      hasData: !!clientResponse.data,
      hasError: !!clientResponse.error
    })

    // Validate required fields
    if (!clientResponse.requestId || !clientResponse.type) {
      return NextResponse.json(
        { error: 'Missing required fields: requestId and type' },
        { status: 400 }
      )
    }

    // Handle the response
    const handled = requestManager.handleClientResponse(clientResponse)
    
    if (!handled) {
      return NextResponse.json(
        { error: 'No pending request found for this requestId' },
        { status: 404 }
      )
    }

    return NextResponse.json({ success: true })
    
  } catch (error) {
    console.error('[API] Error handling client response:', error)
    
    return NextResponse.json(
      { error: 'Failed to process client response' },
      { status: 500 }
    )
  }
}

/**
 * GET endpoint to check pending requests for a device (for debugging)
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const deviceId = searchParams.get('deviceId')
  
  if (!deviceId) {
    return NextResponse.json(
      { error: 'deviceId parameter is required' },
      { status: 400 }
    )
  }

  const pendingRequests = requestManager.getPendingRequestsForDevice(deviceId)
  
  return NextResponse.json({
    deviceId,
    pendingRequests: pendingRequests.map(req => ({
      requestId: req.requestId,
      type: req.type,
      payload: req.payload,
      createdAt: req.createdAt
    }))
  })
}