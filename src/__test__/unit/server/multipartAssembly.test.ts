import { afterEach, describe, expect, it, vi } from 'vitest'
import { DeviceSimulator } from '@/server/deviceSimulator'
import { SignRequestSchema } from '@/server/signRequestParsers'
import { EXTERNAL } from '@/shared/constants'
import { createDeviceResponse } from '@/shared/utils'
import {
  type DeviceResponse,
  type SignRequest,
  type SignResponse,
  type WalletPath,
  LatticeResponseCode,
} from '@/shared/types'

describe('DeviceSimulator multipart message assembly', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('reconstructs typed data payload spans using decoder bytes and extra frames', async () => {
    const simulator = new DeviceSimulator({ autoApprove: true })

    const contents =
      'stupidlylongstringthatshouldstretchintomultiplepageswhencopiedmanytimes'.repeat(25)
    const fullMessage = Buffer.from(contents, 'utf8')
    const baseChunkSize = 1540
    const extraFrameLength = fullMessage.length - baseChunkSize
    const messageLength = fullMessage.length

    const baseChunk = Buffer.from(fullMessage.slice(0, baseChunkSize))
    const baseDecoder = Buffer.alloc(0)

    const extraMessage = Buffer.from(fullMessage.slice(baseChunkSize))
    const extraDecoder = Buffer.from([0xaa, 0xbb, 0xcc])
    const frameData = Buffer.concat([extraMessage, extraDecoder])

    const signerPath: WalletPath = [0x8000002c, 0x8000003c, 0x80000000, 0, 0]

    const extractSpy = vi
      .spyOn(simulator as any, 'extractGenericRequestInfo')
      .mockImplementation(() => ({
        encoding: EXTERNAL.SIGNING.ENCODINGS.EVM,
        hashType: EXTERNAL.SIGNING.HASHES.KECCAK256,
        curve: EXTERNAL.SIGNING.CURVES.SECP256K1,
        path: signerPath,
        omitPubkey: false,
        messageLength,
        messageChunk: Buffer.from(baseChunk),
        remainingChunk: Buffer.from(baseDecoder),
        protocol: 'eip712',
        isPrehashed: false,
      }))

    const nextCode = Buffer.from('0102030405060708', 'hex')
    vi.spyOn(simulator as any, 'generateNextCode').mockImplementation(() => Buffer.from(nextCode))

    let capturedSigningPayload: Buffer | undefined
    const executeSpy = vi
      .spyOn(simulator as any, 'executeSigning')
      .mockImplementation(async (...args: unknown[]): Promise<DeviceResponse<SignResponse>> => {
        const finalRequest = args[0] as SignRequest
        capturedSigningPayload = Buffer.from(finalRequest.data)
        return createDeviceResponse<SignResponse>(true, LatticeResponseCode.success, {
          signature: Buffer.alloc(0),
        })
      })

    const baseRequest: SignRequest = {
      data: Buffer.from(baseChunk),
      path: signerPath,
      schema: SignRequestSchema.ETHEREUM_MESSAGE,
      curve: EXTERNAL.SIGNING.CURVES.SECP256K1,
      encoding: EXTERNAL.SIGNING.ENCODINGS.EVM,
      hashType: EXTERNAL.SIGNING.HASHES.KECCAK256,
      omitPubkey: false,
      hasExtraPayloads: true,
      protocol: 'eip712',
      messageLength,
      isPrehashed: false,
      decoderBytes: Buffer.from(baseDecoder),
      rawPayload: Buffer.alloc(0),
    }

    const baseResponse = await (simulator as any).handleMultipartBaseRequest(baseRequest)
    expect(baseResponse.success).toBe(true)
    expect(baseResponse.data?.nextCode?.equals(nextCode)).toBe(true)
    expect(extractSpy).toHaveBeenCalledTimes(1)

    const frameLength = Buffer.alloc(4)
    frameLength.writeUInt32LE(frameData.length, 0)
    const extraPayload = Buffer.concat([nextCode, frameLength, frameData])

    const extraRequest: SignRequest = {
      data: extraPayload,
      rawPayload: extraPayload,
      nextCode,
      schema: SignRequestSchema.EXTRA_DATA,
      curve: EXTERNAL.SIGNING.CURVES.SECP256K1,
      encoding: EXTERNAL.SIGNING.ENCODINGS.EVM,
      hashType: EXTERNAL.SIGNING.HASHES.KECCAK256,
      path: signerPath,
      omitPubkey: false,
      hasExtraPayloads: false,
    }

    const extraResponse = await (simulator as any).handleExtraDataSignRequest(extraRequest)
    expect(extraResponse.success).toBe(true)
    expect(executeSpy).toHaveBeenCalledTimes(1)
    expect(capturedSigningPayload?.equals(fullMessage)).toBe(true)
    expect((simulator as any).multipartSignSessions.size).toBe(0)
  })
})
