/**
 * Next.js API Route Handler for Lattice Device Communication
 * Handles HTTP requests to simulate device endpoints
 */

import { NextRequest, NextResponse } from 'next/server'
import { LatticeSimulator } from '@/lib/simulator'
import { ProtocolHandler } from '@/lib/protocolHandler'
import { LatticeResponseCode } from '@/types'

// Global simulator instances (in production, this would be managed differently)
const simulators = new Map<string, LatticeSimulator>()
const protocolHandlers = new Map<string, ProtocolHandler>()

function getOrCreateSimulator(deviceId: string): { simulator: LatticeSimulator; handler: ProtocolHandler } {
  let simulator = simulators.get(deviceId)
  let handler = protocolHandlers.get(deviceId)
  
  if (!simulator) {
    simulator = new LatticeSimulator({ deviceId })
    simulators.set(deviceId, simulator)
  }
  
  if (!handler) {
    handler = new ProtocolHandler(simulator)
    protocolHandlers.set(deviceId, handler)
  }
  
  return { simulator, handler }
}

export async function POST(
  request: NextRequest,
  { params }: { params: { deviceId: string } }
) {
  try {
    const { deviceId } = params
    
    if (!deviceId) {
      return NextResponse.json(
        { error: 'Device ID is required' },
        { status: 400 }
      )
    }
    
    // Get request body
    const buffer = await request.arrayBuffer()
    const data = Buffer.from(buffer)
    
    if (data.length === 0) {
      return NextResponse.json(
        { error: 'Request body is required' },
        { status: 400 }
      )
    }
    
    const { simulator, handler } = getOrCreateSimulator(deviceId)
    
    // Parse the request to determine if it's a connect or secure request
    const isConnectRequest = data.length >= 66 && data[0] === 0x01 // Connect message type
    
    let response
    if (isConnectRequest) {
      // Handle connect request (not encrypted)
      const connectData = data.slice(1) // Remove message type byte
      response = await handler.handleConnectRequest(connectData)
    } else {
      // Handle encrypted secure request
      const secureRequest = parseSecureRequest(data)
      response = await handler.handleSecureRequest(secureRequest)
    }
    
    // Build response buffer
    const responseBuffer = buildResponseBuffer(response)
    
    return new NextResponse(responseBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/octet-stream',
        'Content-Length': responseBuffer.length.toString(),
      },
    })
  } catch (error) {
    console.error('[API] Device request error:', error)
    
    const errorResponse = buildErrorResponse(
      LatticeResponseCode.internalError,
      error instanceof Error ? error.message : 'Unknown error'
    )
    
    return new NextResponse(errorResponse, {
      status: 500,
      headers: {
        'Content-Type': 'application/octet-stream',
      },
    })
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: { deviceId: string } }
) {
  try {
    const { deviceId } = params
    const { simulator } = getOrCreateSimulator(deviceId)
    
    // Return device status
    const status = {
      deviceId: simulator.getDeviceId(),
      isPaired: simulator.getIsPaired(),
      isLocked: simulator.getIsLocked(),
      firmwareVersion: Array.from(simulator.getFirmwareVersion()),
      userApprovalRequired: simulator.getUserApprovalRequired(),
    }
    
    return NextResponse.json(status)
  } catch (error) {
    console.error('[API] Device status error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { deviceId: string } }
) {
  try {
    const { deviceId } = params
    
    // Reset or remove simulator
    const simulator = simulators.get(deviceId)
    if (simulator) {
      simulator.reset()
    }
    
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[API] Device reset error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

function parseSecureRequest(data: Buffer) {
  // Simplified parsing - in real implementation would follow exact protocol
  let offset = 0
  
  // Message type (should be 0x02 for secure)
  const msgType = data.readUInt8(offset)
  offset += 1
  
  if (msgType !== 0x02) {
    throw new Error(`Invalid message type: ${msgType}`)
  }
  
  // Request type
  const requestType = data.readUInt8(offset)
  offset += 1
  
  // Ephemeral ID (4 bytes)
  const ephemeralId = data.readUInt32BE(offset)
  offset += 4
  
  // Encrypted data (remaining bytes)
  const encryptedData = data.slice(offset)
  
  return {
    type: requestType,
    data: encryptedData,
    ephemeralId,
  }
}

function buildResponseBuffer(response: any): Buffer {
  // Build response according to Lattice protocol
  const header = Buffer.alloc(8)
  let offset = 0
  
  // Message type (0x00 for response)
  header.writeUInt8(0x00, offset)
  offset += 1
  
  // Response code
  header.writeUInt8(response.code, offset)
  offset += 1
  
  // Reserved bytes
  header.writeUInt16BE(0, offset)
  offset += 2
  
  // Data length
  const dataLength = response.data ? response.data.length : 0
  header.writeUInt32BE(dataLength, offset)
  
  if (response.data) {
    return Buffer.concat([header, response.data])
  } else {
    return header
  }
}

function buildErrorResponse(code: LatticeResponseCode, error?: string): Buffer {
  const header = Buffer.alloc(8)
  
  header.writeUInt8(0x00, 0) // Message type
  header.writeUInt8(code, 1) // Response code
  header.writeUInt16BE(0, 2) // Reserved
  header.writeUInt32BE(0, 4) // Data length (no data for errors)
  
  return header
}
