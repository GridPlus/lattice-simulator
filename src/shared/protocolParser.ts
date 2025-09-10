/**
 * Protocol message structure for parsing incoming requests
 */
export interface ParsedProtocolMessage {
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
export function parseProtocolMessage(buffer: Buffer): ParsedProtocolMessage {
  if (buffer.length < 13) {
    // Minimum: header(8) + requestType(1) + checksum(4)
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

  console.log(
    `Protocol version: ${protocolVersion}, Message type: ${messageType}, Payload length: ${payloadLength}`,
  )
  console.log(
    `Message ID: ${messageId.toString('hex')}, Payload length bytes: ${buffer.slice(offset - 2, offset).toString('hex')}`,
  )
  console.log(
    `Total buffer length: ${buffer.length}, Header + payload should be: ${8 + payloadLength + 4}`,
  )

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
  console.log(
    `[parseProtocolMessage] Header payload length: ${payloadLength}, available: ${availablePayloadLength}, buffer remaining: ${buffer.length - offset}`,
  )
  const payload = buffer.slice(offset, offset + availablePayloadLength)
  offset += availablePayloadLength

  // Read checksum (4 bytes)
  const checksum = buffer.readUInt32BE(offset)
  console.log(`hereis checksum-1: ${checksum}`)
  offset += 4

  // Validate message size
  if (offset !== buffer.length) {
    throw new Error(`Message size mismatch: expected ${buffer.length}, parsed ${offset}`)
  }
  console.log(`[parseProtocolMessage] Request type(1:connect, 2:encrypted): ${requestType}`)
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
      checksum,
    }
  } else {
    // This is an encrypted secure request
    // For encrypted requests, the payload contains: [ephemeralId (4 bytes)] | [encryptedData]
    // Note: requestType was already extracted above, so payload starts with ephemeralId
    if (payload.length < 4) {
      throw new Error(
        `Invalid encrypted request payload size: ${payload.length}, need at least 4 bytes for ephemeralId`,
      )
    }

    // Extract ephemeral ID (first 4 bytes of payload)
    const ephemeralId = payload.readUInt32LE(0)

    // Extract encrypted data (remaining bytes after ephemeralId)
    const encryptedData = payload.slice(4)

    console.log(`[parseProtocolMessage] Ephemeral ID: ${ephemeralId}`)
    console.log(`[parseProtocolMessage] Encrypted data length: ${encryptedData.length}`)
    console.log(`[parseProtocolMessage] Encrypted data (hex): ${encryptedData.toString('hex')}`)

    return {
      isConnectRequest: false,
      requestType,
      messageId,
      payload: encryptedData, // Return only the encrypted data part
      ephemeralId,
      checksum,
    }
  }
}
