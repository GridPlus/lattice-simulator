import { NextRequest, NextResponse } from 'next/server'
import { getDeviceManager } from '@/lib/deviceManager'
import { useDeviceStore } from '@/store'
import { ProtocolHandler } from '@/lib/protocolHandler'
import { randomBytes } from 'crypto'
import crc32 from 'crc-32'

/**
 * Build a Lattice1 protocol response message
 * 
 * Format: [version (1)] | [type (1)] | [id (4)] | [len (2)] | [payload] | [checksum (4)]
 * 
 * @param payload - The response payload data
 * @param messageId - Optional message ID (generates random if not provided)
 * @returns Hex string representing the Lattice1 response
 */
function buildLattice1Response(payload: Buffer, messageId?: Buffer): string {
  const version = 0x01 // Protocol version
  const type = 0x00    // Response type
  const id = messageId || randomBytes(4)
  const len = payload.length // Use actual payload length
  
  // Build the message buffer
  const messageBuffer = Buffer.alloc(8 + len + 4) // header(8) + payload + checksum(4)
  let offset = 0
  
  // Write header
  messageBuffer.writeUInt8(version, offset)
  offset += 1
  messageBuffer.writeUInt8(type, offset)
  offset += 1
  id.copy(messageBuffer, offset)
  offset += 4
  messageBuffer.writeUInt16BE(len, offset)
  offset += 2
  
  // Write payload (should be 215 bytes for connect response: response code + 214 bytes data)
  console.log(`Building protocol message with payload length: ${payload.length}`)
  payload.copy(messageBuffer, offset)
  offset += len
  
  // Calculate and write checksum
  const checksum = calculateChecksum(messageBuffer.slice(0, offset))
  messageBuffer.writeUInt32BE(checksum, offset)
  
  return messageBuffer.toString('hex')
}

/**
 * Calculate checksum for Lattice1 protocol messages
 * 
 * Uses CRC32 with the same implementation as GridPlus SDK
 * 
 * @param buffer - Buffer to calculate checksum for
 * @returns 32-bit checksum
 */
function calculateChecksum(buffer: Buffer): number {
  // crc32 returns a signed integer - need to cast it to unsigned
  // Note that this uses the default 0xedb88320 polynomial
  return crc32.buf(buffer) >>> 0; // Need this to be a uint, hence the bit shift
}

/**
 * Protocol message structure for parsing incoming requests
 */
interface ParsedProtocolMessage {
  isConnectRequest: boolean
  requestType?: number
  messageId?: Buffer
  payload?: Buffer
  ephemeralId?: number
  checksum?: number
}

/**
 * Parse incoming protocol message to determine request type and extract payload
 * 
 * Based on GridPlus Lattice1 protocol specification from SDK:
 * Message format: [Header (8 bytes)] | [requestType (1 byte)] | [payloadData] | [checksum (4 bytes)]
 * Header format: [version (1 byte)] | [type (1 byte)] | [id (4 bytes)] | [len (2 bytes)]
 * 
 * @param buffer - Raw message buffer from client
 * @returns Parsed message information
 */
function parseProtocolMessage(buffer: Buffer): ParsedProtocolMessage {
  if (buffer.length < 13) { // Minimum: header(8) + requestType(1) + checksum(4)
    throw new Error('Invalid message: too short')
  }

  let offset = 0
  
  // Read protocol version (1 byte) - should be 0x01
  const protocolVersion = buffer.readUInt8(offset)
  offset += 1
  
  // Read message type (1 byte) - should be 0x02 for secure messages
  const messageType = buffer.readUInt8(offset)
  offset += 1
  
  // Read message ID (4 bytes)
  const messageId = buffer.slice(offset, offset + 4)
  offset += 4
  
  // Read payload length (2 bytes)
  const payloadLength = buffer.readUInt16BE(offset)
  offset += 2
  
  console.log(`Protocol version: ${protocolVersion}, Message type: ${messageType}, Payload length: ${payloadLength}`)
  console.log(`Message ID: ${messageId.toString('hex')}, Payload length bytes: ${buffer.slice(offset-2, offset).toString('hex')}`)
  console.log(`Total buffer length: ${buffer.length}, Header + payload should be: ${8 + payloadLength + 4}`)
  
  // Validate protocol version
  if (protocolVersion !== 0x01) {
    throw new Error(`Unsupported protocol version: ${protocolVersion}`)
  }
  
  // Validate message type
  if (messageType !== 0x02) {
    throw new Error(`Unsupported message type: ${messageType}`)
  }
  
  // Read request type (1 byte)
  const requestType = buffer.readUInt8(offset)
  offset += 1
  
  // Read payload data - ensure we don't read beyond buffer bounds
  const availablePayloadLength = Math.min(payloadLength, buffer.length - offset - 4) // -4 for checksum
  console.log(`[parseProtocolMessage] Header payload length: ${payloadLength}, available: ${availablePayloadLength}, buffer remaining: ${buffer.length - offset}`)
  const payload = buffer.slice(offset, offset + availablePayloadLength)
  offset += availablePayloadLength
  
  // Read checksum (4 bytes)
  const checksum = buffer.readUInt32BE(offset)
  offset += 4
  
  // Validate message size
  if (offset !== buffer.length) {
    throw new Error(`Message size mismatch: expected ${buffer.length}, parsed ${offset}`)
  }
  console.log(`[parseProtocolMessage] Request type: ${requestType}`)
  // Check if this is a connect request (request type 0x01)
  if (requestType === 0x01) {
    // This is an unencrypted connect request
    // Payload should contain the client's public key (65 bytes)
    if (payload.length !== 65) {
      throw new Error(`Invalid connect request payload size: ${payload.length}, expected 65`)
    }
    
    console.log(`[parseProtocolMessage] Connect request - payload length: ${payload.length}`)
    console.log(`[parseProtocolMessage] Public key (hex): ${payload.toString('hex')}`)
    
    return {
      isConnectRequest: true,
      requestType,
      messageId,
      payload, // Return the public key directly
      checksum
    }
  } else {
    // This is an encrypted secure request
    // For encrypted requests, the payload contains: [ephemeralId (4 bytes)] | [encryptedData (1728 bytes)]
    // But we'll accept the actual payload size and extract what we can
    if (payload.length < 5) {
      throw new Error(`Invalid encrypted request payload size: ${payload.length}, need at least 5 bytes`)
    }
    
    // Extract ephemeral ID (first 4 bytes after requestType)
    const ephemeralId = payload.readUInt32LE(1)
    
    // Extract encrypted data (remaining bytes after requestType and ephemeralId)
    const encryptedData = payload.slice(5)

    console.log(`[parseProtocolMessage] Encrypted data length: ${encryptedData.length}`)
    console.log(`[parseProtocolMessage] Encrypted data (hex): ${encryptedData.toString('hex')}`)
    
    return {
      isConnectRequest: false,
      requestType,
      messageId,
      payload: encryptedData, // Return only the encrypted data part
      ephemeralId,
      checksum
    }
  }
}



/**
 * POST handler for device connection requests
 * 
 * Accepts Buffer data for the device connection request and returns
 * whether the device is paired or not.
 * 
 * @param request - The incoming request containing Buffer data
 * @param params - Route parameters containing the deviceId
 * @returns Response with pairing status as boolean
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { deviceId: string } }
) {
  try {
    // Get the deviceId from route parameters
    const { deviceId } = params

    // Get the request body as JSON with Buffer data
    const requestBody = await request.json()
    
    console.log(`Received request for device: ${deviceId}`)
    console.log(`Request body:`, requestBody)
    
    // Extract Buffer data from the request body
    let buffer: Buffer
    if (requestBody.data && requestBody.data.type === 'Buffer' && Array.isArray(requestBody.data.data)) {
      // Convert the Buffer data array to an actual Buffer
      buffer = Buffer.from(requestBody.data.data)
    } else if (requestBody.data && typeof requestBody.data === 'string') {
      // If data is a hex string, convert it to Buffer
      buffer = Buffer.from(requestBody.data, 'hex')
    } else {
      throw new Error('Invalid request body format. Expected {data: {type: "Buffer", data: number[]}} or {data: string}')
    }

    console.log(`Buffer data length: ${buffer.length} bytes`)
    console.log(`Buffer data: ${buffer.toString('hex')}`)

    // Get or create device manager for this deviceId
    const deviceManager = getDeviceManager(deviceId)

    try {
      // Parse the protocol message
      const parsedMessage = parseProtocolMessage(buffer)

      console.log(`Parsed message:`, JSON.stringify(parsedMessage, null, 2))
      
      // Create protocol handler for this device
      const protocolHandler = new ProtocolHandler(deviceManager.getSimulator())
      
      if (parsedMessage.isConnectRequest) {
        // Handle unencrypted connect request
        console.log('Processing connect request')
        
        if (!parsedMessage.payload) {
          throw new Error('Connect request missing payload')
        }
        
        const response = await protocolHandler.handleConnectRequest(parsedMessage.payload)
        console.log('Connect request payload length:', parsedMessage.payload.length)
        console.log('Connect request payload (hex):', parsedMessage.payload.toString('hex'))
        console.log('response:', response)
        
        if (response.code !== 0) { // 0 = success
          // Build error response payload: [responseCode (1)]
          const errorPayload = Buffer.from([response.code])
          const latticeResponse = buildLattice1Response(errorPayload, parsedMessage.messageId)
          
          return NextResponse.json({
            status: 400,
            message: latticeResponse
          }, { status: 400 })
        }

        // Use the response data from the protocol handler
        if (!response.data) {
          throw new Error('Protocol handler returned no response data')
        }
        
        console.log('Response data length:', response.data.length)
        console.log('Response data (hex):', response.data.toString('hex'))
        
        // The protocol handler already returns the complete response data (including response code)
        // So we don't need to add another response code
        const payload = response.data
        
        // Build the Lattice1 protocol response
        const latticeResponse = buildLattice1Response(payload, parsedMessage.messageId)
        
        // Return the response in the format expected by the SDK
        return NextResponse.json({
          status: 200,
          message: latticeResponse
        })
        
      } else {
        // Handle encrypted secure request
        console.log(`Processing encrypted request type: ${parsedMessage.requestType}`)
        
        if (!parsedMessage.payload) {
          throw new Error('Encrypted request missing payload')
        }
        
        const secureRequest = {
          type: parsedMessage.requestType!,
          data: parsedMessage.payload,
          ephemeralId: parsedMessage.ephemeralId,
          checksum: parsedMessage.checksum
        }
        
        const response = await protocolHandler.handleSecureRequest(secureRequest)
        
        if (response.code !== 0) {
          // Build error response payload: [responseCode (1)]
          const errorPayload = Buffer.from([response.code])
          const latticeResponse = buildLattice1Response(errorPayload, parsedMessage.messageId)
          
          return NextResponse.json({
            status: 400,
            message: latticeResponse
          }, { status: 400 })
        }
        
        // For secure requests, build the Lattice1 protocol response
        const responseCode = 0 // success
        const responseData = response.data || Buffer.alloc(0)
        const payload = Buffer.concat([Buffer.from([responseCode]), responseData])
        
        console.log('Final payload length:', payload.length)
        console.log('Final payload (hex):', payload.toString('hex'))
        
        const latticeResponse = buildLattice1Response(payload, parsedMessage.messageId)
        
        console.log('Full protocol message length:', Buffer.from(latticeResponse, 'hex').length)
        console.log('Full protocol message (hex):', latticeResponse)
        
        return NextResponse.json({
          status: 200,
          message: latticeResponse
        })
      }

    } catch (managerError) {
      console.error('DeviceManager error:', managerError)
      
      // Build error response payload: [responseCode (1)]
      const errorPayload = Buffer.from([0x88]) // internalError
      const latticeResponse = buildLattice1Response(errorPayload)
      
      return NextResponse.json({
        status: 500,
        message: latticeResponse
      }, { status: 500 })
    }

  } catch (error) {
    console.error('Error processing device connection request:', error)
    
    // Build error response payload: [responseCode (1)]
    const errorPayload = Buffer.from([0x88]) // internalError
    const latticeResponse = buildLattice1Response(errorPayload)
    
    return NextResponse.json(
      {
        status: 500,
        message: latticeResponse
      },
      { status: 500 }
    )
  }
}

/**
 * GET handler for device status requests
 * 
 * Returns the current status of the specified device.
 * 
 * @param request - The incoming request
 * @param params - Route parameters containing the deviceId
 * @returns Response with device status information
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { deviceId: string } }
) {
  try {
    const { deviceId } = params

    // Get or create device manager for this deviceId
    const deviceManager = getDeviceManager(deviceId)
    
    // Get connection status from store
    const storeState = useDeviceStore.getState()
    
    const deviceStatus = {
      deviceId: deviceManager.getDeviceId(),
      isConnected: storeState.isConnected,
      isPaired: deviceManager.getIsPaired(),
      isLocked: deviceManager.getIsLocked(),
      firmwareVersion: Array.from(deviceManager.getFirmwareVersion()).join('.'),
      name: 'Lattice1 Simulator',
      userApprovalRequired: deviceManager.getUserApprovalRequired()
    }

    return NextResponse.json({
      success: true,
      data: deviceStatus
    })

  } catch (error) {
    console.error('Error getting device status:', error)
    
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to get device status',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}


