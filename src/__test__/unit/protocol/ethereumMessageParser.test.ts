import { describe, it, expect } from 'vitest'
import { EthereumMessageParser, SignRequestSchema } from '@/server/signRequestParsers'
import { HARDENED_OFFSET } from '@/shared/constants'

describe('EthereumMessageParser', () => {
  it('respects declared length for zero-byte personal_sign payloads', () => {
    const parser = new EthereumMessageParser()
    const signerPath = [HARDENED_OFFSET + 44, HARDENED_OFFSET + 60, HARDENED_OFFSET, 0, 0]

    const paddedMessageLength = 32
    const payload = Buffer.alloc(
      1 + // protocol index
        4 + // path length
        5 * 4 + // path entries
        1 + // displayHex flag
        2 + // declared message length
        paddedMessageLength,
    )

    let offset = 0
    payload.writeUInt8(0, offset) // signPersonal protocol
    offset += 1
    payload.writeUInt32LE(signerPath.length, offset)
    offset += 4
    for (let i = 0; i < 5; i++) {
      payload.writeUInt32LE(signerPath[i] ?? 0, offset)
      offset += 4
    }
    payload.writeUInt8(0, offset) // display as ASCII
    offset += 1
    payload.writeUInt16LE(0, offset) // declared zero-length message
    offset += 2
    Buffer.alloc(paddedMessageLength, 0xcd).copy(payload, offset)

    const parsed = parser.parse(payload, false, SignRequestSchema.ETHEREUM_MESSAGE)

    expect(parsed.protocol).toBe('signPersonal')
    expect(parsed.data.length).toBe(0)
    expect(parsed.messageLength).toBe(0)
  })
})
