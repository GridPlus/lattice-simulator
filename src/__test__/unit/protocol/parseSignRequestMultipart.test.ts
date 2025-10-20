import { describe, it, expect, beforeEach } from 'vitest'
import { ProtocolHandler } from '@/server/serverProtocolHandler'
import { SignRequestSchema } from '@/server/signRequestParsers'
import { EXTERNAL } from '@/shared/constants'
import type { ServerLatticeSimulator } from '@/server/serverSimulator'
import type { SignRequest } from '@/shared/types'

describe('ProtocolHandler parseSignRequest - multipart detection', () => {
  let handler: ProtocolHandler

  beforeEach(() => {
    const mockSimulator = {
      getSharedSecret: () => undefined,
    } as unknown as ServerLatticeSimulator

    handler = new ProtocolHandler(mockSimulator)
  })

  it('should force multipart mode when declared message length exceeds chunk length', () => {
    const hasExtraPayloadsFlag = 0
    const schema = SignRequestSchema.GENERIC
    const walletUid = Buffer.alloc(32, 0x11)

    const path = [
      0x8000002c, // 44'
      0x8000003c, // 60'
      0x80000000, // 0'
      0,
      0,
    ]

    const declaredLength = 3019
    const chunkLength = 1519
    const messageChunk = Buffer.alloc(chunkLength, 0xaa)

    const reqPayload = Buffer.alloc(
      4 + // encoding
        1 + // hashType
        1 + // curve
        4 + // path length
        5 * 4 + // path indices
        1 + // omitPubkey flag
        2 + // message length
        chunkLength, // chunk data
    )

    let offset = 0
    reqPayload.writeUInt32LE(EXTERNAL.SIGNING.ENCODINGS.NONE, offset)
    offset += 4
    reqPayload.writeUInt8(EXTERNAL.SIGNING.HASHES.SHA256, offset)
    offset += 1
    reqPayload.writeUInt8(EXTERNAL.SIGNING.CURVES.SECP256K1, offset)
    offset += 1
    reqPayload.writeUInt32LE(path.length, offset)
    offset += 4
    for (let i = 0; i < 5; i++) {
      reqPayload.writeUInt32LE(path[i] ?? 0, offset)
      offset += 4
    }
    reqPayload.writeUInt8(0, offset) // omitPubkey flag
    offset += 1
    reqPayload.writeUInt16LE(declaredLength, offset)
    offset += 2
    messageChunk.copy(reqPayload, offset)

    const envelope = Buffer.alloc(2 + walletUid.length + reqPayload.length)
    let envOffset = 0
    envelope.writeUInt8(hasExtraPayloadsFlag, envOffset)
    envOffset += 1
    envelope.writeUInt8(schema, envOffset)
    envOffset += 1
    walletUid.copy(envelope, envOffset)
    envOffset += walletUid.length
    reqPayload.copy(envelope, envOffset)

    const parsed = (
      handler as unknown as { parseSignRequest: (data: Buffer) => SignRequest }
    ).parseSignRequest(envelope)

    expect(parsed.hasExtraPayloads).toBe(true)
    expect(parsed.messageLength).toBe(declaredLength)
    expect(parsed.data.length).toBe(chunkLength)
  })
})
