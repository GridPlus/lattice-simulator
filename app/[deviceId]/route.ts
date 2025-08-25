import { NextRequest, NextResponse } from 'next/server'
import { getDeviceManager } from '@/lib/deviceManager'
import { useDeviceStore } from '@/store'
import { ProtocolHandler } from '@/lib/protocolHandler'

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
  
  // Read payload data
  const payload = buffer.slice(offset, offset + payloadLength - 1) // -1 because requestType is included in payloadLength
  offset += payloadLength - 1
  
  // Read checksum (4 bytes)
  const checksum = buffer.readUInt32BE(offset)
  offset += 4
  
  // Validate message size
  if (offset !== buffer.length) {
    throw new Error(`Message size mismatch: expected ${buffer.length}, parsed ${offset}`)
  }
  
  // Check if this is a connect request (request type 0x01)
  if (requestType === 0x01) {
    // This is an unencrypted connect request
    // Payload should contain the client's public key (65 bytes)
    if (payload.length !== 65) {
      throw new Error(`Invalid connect request payload size: ${payload.length}, expected 65`)
    }
    
    return {
      isConnectRequest: true,
      requestType,
      messageId,
      payload,
      checksum
    }
  } else {
    // This is an encrypted secure request
    // For encrypted requests, the payload contains: [ephemeralId (4 bytes)] | [encryptedData (1728 bytes)]
    if (payload.length !== 1732) { // 4 + 1728
      throw new Error(`Invalid encrypted request payload size: ${payload.length}, expected 1732`)
    }
    
    // Extract ephemeral ID (first 4 bytes)
    const ephemeralId = payload.readUInt32LE(0)
    
    // Extract encrypted data (remaining bytes)
    const encryptedData = payload.slice(4)
    
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
        
        if (response.code !== 0) { // 0 = success
          return NextResponse.json({
            success: false,
            isPaired: false,
            deviceId,
            error: response.error,
            message: 'Connection failed'
          }, { status: 400 })
        }

        // Check if device is paired after connection
        const isPaired = deviceManager.getIsPaired()

        console.log('isPaired:', isPaired)
        // Return the pairing status as boolean (as requested)
        return NextResponse.json(isPaired)
        
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
          return NextResponse.json({
            success: false,
            error: response.error,
            message: 'Request processing failed'
          }, { status: 400 })
        }
        
        // For secure requests, we need to return the encrypted response
        // TODO: Implement proper response encryption and formatting
        return NextResponse.json({
          success: true,
          data: response.data?.toString('hex'),
          message: 'Request processed successfully'
        })
      }

    } catch (managerError) {
      console.error('DeviceManager error:', managerError)
      
      return NextResponse.json({
        success: false,
        isPaired: false,
        deviceId,
        error: 'Device manager operation failed',
        details: managerError instanceof Error ? managerError.message : 'Unknown error'
      }, { status: 500 })
    }

  } catch (error) {
    console.error('Error processing device connection request:', error)
    
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to process device connection request',
        details: error instanceof Error ? error.message : 'Unknown error'
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

