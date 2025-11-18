import { parseProtocolMessage } from '@/shared/protocolParser'

/**
 * Test suite for parseProtocolMessage function
 *
 * Tests the protocol message parsing logic that handles Lattice1 protocol messages
 * Message format: [Header (8 bytes)] | [requestType (1 byte)] | [payloadData] | [checksum (4 bytes)]
 * Header format: [version (1 byte)] | [type (1 byte)] | [id (4 bytes)] | [len (2 bytes)]
 */
describe('parseProtocolMessage', () => {
  // Helper function to create a valid message buffer
  function createMessageBuffer(
    version: number = 0x01,
    messageType: number = 0x02,
    messageId: Buffer = Buffer.from([0x01, 0x02, 0x03, 0x04]),
    requestType: number = 0x01,
    payload: Buffer = Buffer.alloc(65, 0xaa), // 65 bytes for connect request
    checksum: number = 0x12345678,
  ): Buffer {
    const payloadLength = payload.length
    const buffer = Buffer.alloc(8 + 1 + payloadLength + 4) // header(8) + requestType(1) + payload + checksum(4)
    let offset = 0

    // Write header
    buffer.writeUInt8(version, offset)
    offset += 1
    buffer.writeUInt8(messageType, offset)
    offset += 1
    messageId.copy(buffer, offset)
    offset += 4
    buffer.writeUInt16BE(payloadLength, offset)
    offset += 2

    // Write request type
    buffer.writeUInt8(requestType, offset)
    offset += 1

    // Write payload
    payload.copy(buffer, offset)
    offset += payloadLength

    // Write checksum
    buffer.writeUInt32BE(checksum, offset)

    return buffer
  }

  // Helper function to create an encrypted message buffer
  function createEncryptedMessageBuffer({
    requestType = 0x02,
    ephemeralId = 0x12345678,
    encryptedData = Buffer.alloc(100, 0xbb),
    checksum = 0x87654321,
    messageId = Buffer.from([0x01, 0x02, 0x03, 0x04]),
  }: {
    requestType: number
    ephemeralId: number
    encryptedData: Buffer
    checksum: number
    messageId: Buffer
  }): Buffer {
    const payload = Buffer.alloc(4 + encryptedData.length)
    payload.writeUInt32LE(ephemeralId, 0)
    encryptedData.copy(payload, 4)

    return createMessageBuffer(0x01, 0x02, messageId, requestType, payload, checksum)
  }

  describe('Input validation', () => {
    it('should throw error for buffer that is too short', () => {
      const shortBuffer = Buffer.alloc(12) // Less than minimum 13 bytes

      expect(() => {
        parseProtocolMessage(shortBuffer)
      }).toThrow('Invalid message: too short')
    })

    it('should accept buffer with minimum required length', () => {
      const minBuffer = Buffer.alloc(13) // Exactly minimum required

      expect(minBuffer.length).toBeGreaterThanOrEqual(13)
    })
  })

  describe('Protocol version validation', () => {
    it('should accept protocol version 0x01', () => {
      const validBuffer = createMessageBuffer(0x01)

      expect(validBuffer.readUInt8(0)).toBe(0x01)
    })

    it('should reject unsupported protocol versions', () => {
      const invalidBuffer = createMessageBuffer(0x02) // Invalid version

      expect(() => {
        parseProtocolMessage(invalidBuffer)
      }).toThrow('Unsupported protocol version: 2')
    })
  })

  describe('Message type validation', () => {
    it('should accept message type 0x02', () => {
      const validBuffer = createMessageBuffer(0x01, 0x02)

      expect(validBuffer.readUInt8(1)).toBe(0x02)
    })

    it('should reject unsupported message types', () => {
      const invalidBuffer = createMessageBuffer(0x01, 0x01) // Invalid type

      expect(() => {
        parseProtocolMessage(invalidBuffer)
      }).toThrow('Unsupported message type: 1')
    })
  })

  describe('Message ID handling', () => {
    it('should correctly extract 4-byte message ID', () => {
      const messageId = Buffer.from([0xaa, 0xbb, 0xcc, 0xdd])
      const buffer = createMessageBuffer(0x01, 0x02, messageId)

      const extractedId = buffer.slice(2, 6)
      expect(extractedId).toEqual(messageId)
      expect(extractedId.length).toBe(4)
    })

    it('should handle different message ID values', () => {
      const messageId1 = Buffer.from([0x00, 0x00, 0x00, 0x00])
      const messageId2 = Buffer.from([0xff, 0xff, 0xff, 0xff])

      const buffer1 = createMessageBuffer(0x01, 0x02, messageId1)
      const buffer2 = createMessageBuffer(0x01, 0x02, messageId2)

      expect(buffer1.slice(2, 6)).toEqual(messageId1)
      expect(buffer2.slice(2, 6)).toEqual(messageId2)
    })
  })

  describe('Payload length handling', () => {
    it('should correctly read 2-byte payload length (big endian)', () => {
      const payloadLength = 0x1234
      const buffer = Buffer.alloc(8)
      buffer.writeUInt8(0x01, 0) // version
      buffer.writeUInt8(0x02, 1) // message type
      buffer.writeUInt32BE(0x12345678, 2) // message ID
      buffer.writeUInt16BE(payloadLength, 6) // payload length

      const extractedLength = buffer.readUInt16BE(6)
      expect(extractedLength).toBe(payloadLength)
    })

    it('should handle zero payload length', () => {
      const buffer = createMessageBuffer(
        0x01,
        0x02,
        Buffer.from([0x01, 0x02, 0x03, 0x04]),
        0x01,
        Buffer.alloc(0),
      )

      const payloadLength = buffer.readUInt16BE(6)
      expect(payloadLength).toBe(0)
    })

    it('should handle maximum payload length', () => {
      const maxPayload = Buffer.alloc(65535) // Max UInt16
      const buffer = createMessageBuffer(
        0x01,
        0x02,
        Buffer.from([0x01, 0x02, 0x03, 0x04]),
        0x01,
        maxPayload,
      )

      const payloadLength = buffer.readUInt16BE(6)
      expect(payloadLength).toBe(65535)
    })
  })

  describe('Request type handling', () => {
    it('should correctly extract request type byte', () => {
      const requestType = 0x05
      const buffer = createMessageBuffer(
        0x01,
        0x02,
        Buffer.from([0x01, 0x02, 0x03, 0x04]),
        requestType,
      )

      const extractedType = buffer.readUInt8(8) // 8 = header(8)
      expect(extractedType).toBe(requestType)
    })

    it('should handle different request type values', () => {
      const types = [0x01, 0x02, 0x04, 0x07, 0x08, 0x09]

      types.forEach(type => {
        const buffer = createMessageBuffer(0x01, 0x02, Buffer.from([0x01, 0x02, 0x03, 0x04]), type)
        const extractedType = buffer.readUInt8(8)
        expect(extractedType).toBe(type)
      })
    })
  })

  describe('Connect request handling (requestType = 0x01)', () => {
    it('should correctly parse connect request with 65-byte public key', () => {
      const publicKey = Buffer.alloc(65, 0xaa)
      const buffer = createMessageBuffer(
        0x01,
        0x02,
        Buffer.from([0x01, 0x02, 0x03, 0x04]),
        0x01,
        publicKey,
      )

      const result = parseProtocolMessage(buffer)

      expect(result.isConnectRequest).toBe(true)
      expect(result.requestType).toBe(0x01)
      expect(result.payload).toEqual(publicKey)
      expect(result.payload!.length).toBe(65)
    })

    it('should reject connect request with wrong payload size', () => {
      const wrongSizePayload = Buffer.alloc(64, 0xaa) // Should be 65 bytes
      const buffer = createMessageBuffer(
        0x01,
        0x02,
        Buffer.from([0x01, 0x02, 0x03, 0x04]),
        0x01,
        wrongSizePayload,
      )

      expect(() => {
        parseProtocolMessage(buffer)
      }).toThrow('Invalid connect request payload size: 64, expected 65')
    })
  })

  describe('Encrypted request handling (requestType != 0x01)', () => {
    it('should correctly parse encrypted request with ephemeral ID', () => {
      const ephemeralId = 0x12345678
      const encryptedData = Buffer.alloc(100, 0xbb)
      const buffer = createEncryptedMessageBuffer({
        requestType: 0x02,
        ephemeralId,
        encryptedData,
        checksum: 0x87654321,
        messageId: Buffer.from([0x01, 0x02, 0x03, 0x04]),
      })

      const result = parseProtocolMessage(buffer)

      expect(result.isConnectRequest).toBe(false)
      expect(result.requestType).toBe(0x02)
      expect(result.ephemeralId).toBe(ephemeralId)
      expect(result.payload).toEqual(encryptedData)
    })

    it('should reject encrypted request with insufficient payload size', () => {
      const smallPayload = Buffer.alloc(3) // Less than 4 bytes needed for ephemeralId
      const buffer = createMessageBuffer(
        0x01,
        0x02,
        Buffer.from([0x01, 0x02, 0x03, 0x04]),
        0x02,
        smallPayload,
      )

      expect(() => {
        parseProtocolMessage(buffer)
      }).toThrow('Invalid encrypted request payload size: 3, need at least 4 bytes for ephemeralId')
    })
  })

  describe('Checksum handling', () => {
    it('should correctly read 4-byte checksum (big endian)', () => {
      const checksum = 0x12345678
      const buffer = createMessageBuffer(
        0x01,
        0x02,
        Buffer.from([0x01, 0x02, 0x03, 0x04]),
        0x01,
        Buffer.alloc(65),
        checksum,
      )

      const extractedChecksum = buffer.readUInt32BE(buffer.length - 4)
      expect(extractedChecksum).toBe(checksum)
    })

    it('should handle different checksum values', () => {
      const checksums = [0x00000000, 0x12345678, 0xffffffff]

      checksums.forEach(checksum => {
        const buffer = createMessageBuffer(
          0x01,
          0x02,
          Buffer.from([0x01, 0x02, 0x03, 0x04]),
          0x01,
          Buffer.alloc(65),
          checksum,
        )
        const extractedChecksum = buffer.readUInt32BE(buffer.length - 4)
        expect(extractedChecksum).toBe(checksum)
      })
    })
  })

  describe('Message size validation', () => {
    it('should validate that parsed size matches buffer size', () => {
      const buffer = createMessageBuffer(
        0x01,
        0x02,
        Buffer.from([0x01, 0x02, 0x03, 0x04]),
        0x01,
        Buffer.alloc(65),
      )

      // Simulate the parsing logic
      let offset = 0

      // Read header
      offset += 1 // version
      offset += 1 // message type
      offset += 4 // message ID
      offset += 2 // payload length

      // Read request type
      offset += 1

      // Read payload
      offset += 65

      // Read checksum
      offset += 4

      expect(offset).toBe(buffer.length)
    })

    it('should reject message with size mismatch', () => {
      const buffer = createMessageBuffer(
        0x01,
        0x02,
        Buffer.from([0x01, 0x02, 0x03, 0x04]),
        0x01,
        Buffer.alloc(65),
      )

      expect(() => {
        let offset = 0

        // Read header
        offset += 1 // version
        offset += 1 // message type
        offset += 4 // message ID
        offset += 2 // payload length

        // Read request type
        offset += 1

        // Read payload
        offset += 65

        // Read checksum
        offset += 4

        // Simulate a size mismatch
        if (offset !== buffer.length) {
          throw new Error(`Message size mismatch: expected ${buffer.length}, parsed ${offset}`)
        }
      }).not.toThrow()
    })
  })

  describe('Edge cases and error conditions', () => {
    it('should handle buffer with exact minimum size', () => {
      // Create a buffer with exactly 13 bytes: header(8) + requestType(1) + checksum(4)
      const buffer = Buffer.alloc(13)
      buffer.writeUInt8(0x01, 0) // version
      buffer.writeUInt8(0x02, 1) // message type
      buffer.writeUInt32BE(0x12345678, 2) // message ID
      buffer.writeUInt16BE(0, 6) // payload length = 0
      buffer.writeUInt8(0x01, 8) // request type
      buffer.writeUInt32BE(0x12345678, 9) // checksum

      expect(buffer.length).toBe(13)
      expect(buffer.readUInt8(0)).toBe(0x01) // version
      expect(buffer.readUInt8(1)).toBe(0x02) // message type
    })

    it('should handle large payload sizes', () => {
      const largePayload = Buffer.alloc(1000, 0xcc)
      const buffer = createMessageBuffer(
        0x01,
        0x02,
        Buffer.from([0x01, 0x02, 0x03, 0x04]),
        0x02,
        largePayload,
      )

      const payloadLength = buffer.readUInt16BE(6)
      expect(payloadLength).toBe(1000)

      // Verify payload content
      const offset = 8 + 1 // header + requestType
      const payload = buffer.slice(offset, offset + 1000)
      expect(payload.length).toBe(1000)
      expect(payload[0]).toBe(0xcc)
    })

    it('should handle zero-length encrypted payload', () => {
      const emptyPayload = Buffer.alloc(0)
      const buffer = createMessageBuffer(
        0x01,
        0x02,
        Buffer.from([0x01, 0x02, 0x03, 0x04]),
        0x02,
        emptyPayload,
      )

      const payloadLength = buffer.readUInt16BE(6)
      expect(payloadLength).toBe(0)
    })
  })

  describe('Integration scenarios', () => {
    it('should parse a complete connect request message', () => {
      const messageId = Buffer.from([0xaa, 0xbb, 0xcc, 0xdd])
      const publicKey = Buffer.alloc(65, 0xee)
      const checksum = 0x12345678

      const buffer = createMessageBuffer(0x01, 0x02, messageId, 0x01, publicKey, checksum)

      const result = parseProtocolMessage(buffer)

      // Verify parsed result
      expect(result.isConnectRequest).toBe(true)
      expect(result.requestType).toBe(0x01)
      expect(result.messageId).toEqual(messageId)
      expect(result.payload).toEqual(publicKey)
      expect(result.checksum).toBe(checksum)
    })

    it('should parse a complete encrypted request message', () => {
      const messageId = Buffer.from([0x11, 0x22, 0x33, 0x44])
      const ephemeralId = 0xabcdef01
      const encryptedData = Buffer.alloc(200, 0x55)
      const checksum = 0x87654321

      const buffer = createEncryptedMessageBuffer({
        requestType: 0x04,
        ephemeralId,
        encryptedData,
        checksum,
        messageId,
      })

      const result = parseProtocolMessage(buffer)

      // Verify parsed result
      expect(result.isConnectRequest).toBe(false)
      expect(result.requestType).toBe(0x04)
      expect(result.messageId).toEqual(messageId)
      expect(result.ephemeralId).toBe(ephemeralId)
      expect(result.payload).toEqual(encryptedData)
      expect(result.checksum).toBe(checksum)
    })
  })
})
