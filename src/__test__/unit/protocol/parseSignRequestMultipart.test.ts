import { describe, it, expect, beforeEach } from 'vitest'
import { ProtocolHandler } from '@/server/serverProtocolHandler'
import { SignRequestSchema } from '@/server/signRequestParsers'
import { EXTERNAL } from '@/shared/constants'
import type { SignRequest } from '@/shared/types'
import type { ServerLatticeSimulator } from '@/server/serverSimulator'

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

  it('should detect prehashed typed data payloads with no decoder bytes', () => {
    const hasExtraPayloadsFlag = 0
    const schema = SignRequestSchema.ETHEREUM_MESSAGE
    const walletUid = Buffer.alloc(32, 0x22)

    const signerPath = [0x8000002c, 0x8000003c, 0x80000000, 0, 0]
    const declaredLength = 96
    const digest = Buffer.alloc(32, 0x11)
    const decoderPadding = Buffer.from([0xaa, 0xbb, 0xcc])

    const basePayload = Buffer.alloc(
      1 + // protocol index
        4 + // path length
        5 * 4 + // path entries
        2 + // message length
        digest.length +
        decoderPadding.length,
    )

    let offset = 0
    basePayload.writeUInt8(1, offset) // ETH_MSG_PROTOCOL.TYPED_DATA
    offset += 1
    basePayload.writeUInt32LE(signerPath.length, offset)
    offset += 4
    for (let i = 0; i < 5; i++) {
      basePayload.writeUInt32LE(signerPath[i] ?? 0, offset)
      offset += 4
    }
    basePayload.writeUInt16LE(declaredLength, offset)
    offset += 2
    digest.copy(basePayload, offset)
    offset += digest.length
    decoderPadding.copy(basePayload, offset)

    const envelope = Buffer.alloc(2 + walletUid.length + basePayload.length)
    offset = 0
    envelope.writeUInt8(hasExtraPayloadsFlag, offset)
    offset += 1
    envelope.writeUInt8(schema, offset)
    offset += 1
    walletUid.copy(envelope, offset)
    offset += walletUid.length
    basePayload.copy(envelope, offset)

    const parsed = (
      handler as unknown as { parseSignRequest: (data: Buffer) => SignRequest }
    ).parseSignRequest(envelope)

    expect(parsed.protocol).toBe('eip712')
    expect(parsed.isPrehashed).toBe(true)
    expect(parsed.data.length).toBe(32)
    expect(parsed.data.equals(digest)).toBe(true)
    expect(parsed.decoderBytes).toBeUndefined()
    expect(parsed.messageLength).toBe(32)
    expect(parsed.hashType).toBe(EXTERNAL.SIGNING.HASHES.NONE)
  })
})
