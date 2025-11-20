import { randomBytes } from 'crypto'
import crc32 from 'crc-32'
import { NextResponse, type NextRequest } from 'next/server'
import { ProtocolHandler } from '@/server/protocolHandler'
import { parseProtocolMessage } from '@/shared/protocolParser'

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
  const type = 0x00 // Response type
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
  return crc32.buf(buffer) >>> 0 // Need this to be a uint, hence the bit shift
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
export async function POST(request: NextRequest, { params }: { params: { deviceId: string } }) {
  try {
    // Get the deviceId from route parameters
    const { deviceId } = params

    // Get the request body as JSON with Buffer data
    const requestBody = await request.json()

    console.log(`Received request for device: ${deviceId}`)
    console.log('Request body:', requestBody)

    // Extract Buffer data from the request body
    let buffer: Buffer
    if (
      requestBody.data &&
      requestBody.data.type === 'Buffer' &&
      Array.isArray(requestBody.data.data)
    ) {
      // Convert the Buffer data array to an actual Buffer
      buffer = Buffer.from(requestBody.data.data)
    } else if (requestBody.data && typeof requestBody.data === 'string') {
      // If data is a hex string, convert it to Buffer
      buffer = Buffer.from(requestBody.data, 'hex')
    } else {
      throw new Error(
        'Invalid request body format. Expected {data: {type: "Buffer", data: number[]}} or {data: string}',
      )
    }

    console.log(`Buffer data length: ${buffer.length} bytes`)
    console.log(`Buffer data: ${buffer.toString('hex')}`)

    // Get the global DeviceManager from global scope
    const getGlobalDeviceManager = (global as any).getGlobalDeviceManager

    if (!getGlobalDeviceManager) {
      throw new Error(
        'Global DeviceManager not available. Make sure packages/daemon/index.ts is running.',
      )
    }

    const deviceManager = getGlobalDeviceManager(deviceId)

    try {
      // Parse the protocol message
      const parsedMessage = parseProtocolMessage(buffer)

      // console.log(`Parsed message:`, JSON.stringify(parsedMessage, null, 2))

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

        if (response.code !== 0) {
          // 0 = success
          // Build error response payload: [responseCode (1)]
          const errorPayload = Buffer.from([response.code])
          const latticeResponse = buildLattice1Response(errorPayload, parsedMessage.messageId)

          return NextResponse.json({
            status: 200,
            message: latticeResponse,
          })
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
          message: latticeResponse,
        })
      } else {
        // Handle encrypted secure request
        if (!parsedMessage.payload) {
          throw new Error('Encrypted request missing payload')
        }

        console.log(`[Route] Processing secure request (type: ${parsedMessage.requestType})`)
        // Note: The actual operation type (getWallets, getKvRecords, addKvRecords, etc.)
        // is embedded within the encrypted payload and will be logged by the protocol handler

        const secureRequest = {
          type: parsedMessage.requestType!,
          data: parsedMessage.payload,
          ephemeralId: parsedMessage.ephemeralId,
          checksum: parsedMessage.checksum,
        }
        const response = await protocolHandler.handleSecureRequest(secureRequest)

        console.log('[Route] Secure request response:', {
          code: response.code,
          dataLength: response.data?.length || 0,
          error: response.error,
        })

        if (response.code !== 0) {
          // Build error response payload: [responseCode (1)]
          const errorPayload = Buffer.from([response.code])
          const latticeResponse = buildLattice1Response(errorPayload, parsedMessage.messageId)

          return NextResponse.json({
            status: 200,
            message: latticeResponse,
          })
        }

        // For secure requests, build the Lattice1 protocol response
        // SDK expects: [responseCode (1)] | [encryptedData (1728)] | [empty (1728)]
        const responseCode = 0 // success
        const encryptedData = response.data || Buffer.alloc(0)

        // The protocol handler should have already padded the response to 1728 bytes
        // and encrypted it, so encryptedData should be the correct size
        console.log(`Secure request response - encrypted data length: ${encryptedData.length}`)

        // Add empty 1728 bytes due to firmware bug (C struct instead of union)
        const emptyData = Buffer.alloc(1728)

        const payload = Buffer.concat([
          Buffer.from([responseCode]), // 1 byte
          encryptedData, // Encrypted data (should be 1728 bytes)
          emptyData, // 1728 bytes
        ])

        console.log('Response code:', responseCode)
        console.log('Encrypted data length:', encryptedData.length)
        console.log('Empty data length:', emptyData.length)
        console.log('Final payload length:', payload.length)
        console.log('Final payload (hex):', payload.toString('hex'))

        const latticeResponse = buildLattice1Response(payload, parsedMessage.messageId)

        console.log('Full protocol message length:', Buffer.from(latticeResponse, 'hex').length)
        console.log('Full protocol message (hex):', latticeResponse)

        return NextResponse.json({
          status: 200,
          message: latticeResponse,
        })
      }
    } catch (managerError) {
      console.error('DeviceManager error:', managerError)

      // Build error response payload: [responseCode (1)]
      const errorPayload = Buffer.from([0x88]) // internalError
      const latticeResponse = buildLattice1Response(errorPayload)

      return NextResponse.json(
        {
          status: 500,
          message: latticeResponse,
        },
        { status: 500 },
      )
    }
  } catch (error) {
    console.error('Error processing device connection request:', error)

    // Build error response payload: [responseCode (1)]
    const errorPayload = Buffer.from([0x88]) // internalError
    const latticeResponse = buildLattice1Response(errorPayload)

    return NextResponse.json(
      {
        status: 500,
        message: latticeResponse,
      },
      { status: 500 },
    )
  }
}
