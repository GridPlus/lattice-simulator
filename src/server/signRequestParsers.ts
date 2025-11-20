/**
 * Structured Sign Request Parsers
 *
 * Factory pattern implementation for parsing different types of signing requests
 * based on schema/currency type. Each parser specializes in handling specific
 * cryptocurrency transaction formats and message types.
 */

import { EXTERNAL } from '../core/constants'
import { buildEthereumSigningPreimage, decodeEthereumTxPayload } from './utils/ethereumTx'
import { parseBitcoinSignPayload } from '../core/bitcoin'
import { debug } from '../core/debug'
import type { SignRequest } from '../core/types'

const ETH_MSG_PROTOCOL = {
  SIGN_PERSONAL: 0,
  TYPED_DATA: 1,
} as const

/**
 * Maximum number of message bytes that fit in the initial generic signing frame.
 * Mirrors `fwConstants.genericSigning.baseDataSz` on firmware versions >= v0.14.0.
 */
export const GENERIC_SIGNING_BASE_CHUNK_SIZE = 1519

/**
 * Maximum number of message bytes that fit in the initial ETH_MSG frame.
 * Mirrors `fwConstants.ethMaxMsgSz` on modern firmware (v0.14.0+).
 */
export const ETH_MESSAGE_BASE_CHUNK_SIZE = 1540

/**
 * Schema constants mapping to different currencies/request types
 */
export enum SignRequestSchema {
  BITCOIN = 0,
  ETHEREUM_TRANSACTION = 1,
  ERC20_TRANSFER = 2,
  ETHEREUM_MESSAGE = 3,
  EXTRA_DATA = 4,
  GENERIC = 5,
}

/**
 * Base interface for all sign request parsers
 */
export interface ISignRequestParser {
  /**
   * Parse the raw payload into a structured SignRequest
   * @param payload - Raw request payload after SDK envelope extraction
   * @param hasExtraPayloads - Whether request has extra data payloads
   * @param schema - Schema type from request envelope
   */
  parse(payload: Buffer, hasExtraPayloads: boolean, schema: number): SignRequest
}

/**
 * Bitcoin transaction parser
 * Handles Bitcoin UTXO-based transactions with change paths and previous outputs
 */
export class BitcoinSignRequestParser implements ISignRequestParser {
  parse(payload: Buffer, hasExtraPayloads: boolean, schema: number): SignRequest {
    debug.protocol('[BitcoinParser] Parsing Bitcoin transaction payload')
    debug.protocol('[BitcoinParser] Payload length: %d', payload.length)

    let parsedPayload

    try {
      parsedPayload = parseBitcoinSignPayload(payload)
    } catch (error) {
      console.error('[BitcoinParser] Failed to parse Bitcoin payload:', error)
    }

    let path: number[] = []
    if (parsedPayload?.inputs?.length) {
      path = [...parsedPayload.inputs[0].signerPath]
      debug.protocol('[BitcoinParser] Using first input signer path: [%s]', path.join(', '))
    } else if (parsedPayload?.change?.path?.length) {
      path = [...parsedPayload.change.path]
      debug.protocol('[BitcoinParser] Using change path: [%s]', path.join(', '))
    } else {
      path = [0x8000002c, 0x80000000, 0x80000000]
      debug.protocol('[BitcoinParser] Falling back to default Bitcoin path: [%s]', path.join(', '))
    }

    return {
      path,
      schema,
      curve: EXTERNAL.SIGNING.CURVES.SECP256K1,
      encoding: EXTERNAL.SIGNING.ENCODINGS.NONE,
      hashType: EXTERNAL.SIGNING.HASHES.NONE,
      data: payload,
      rawPayload: payload,
      bitcoin: parsedPayload,
    }
  }
}

/**
 * Ethereum transaction parser
 * Handles Ethereum-style transactions with gas, value, and smart contract calls
 */
export class EthereumTransactionParser implements ISignRequestParser {
  parse(payload: Buffer, hasExtraPayloads: boolean, schema: number): SignRequest {
    debug.protocol('[EthereumParser] Parsing Ethereum transaction payload')
    debug.protocol('[EthereumParser] Payload length: %d', payload.length)

    // Extract encoding type from payload (similar to GenericSignRequestParser)
    let encoding: number = EXTERNAL.SIGNING.ENCODINGS.EVM // Default to EVM
    if (payload.length >= 4) {
      const extractedEncoding = payload.readUInt32LE(0)
      // Only use extracted encoding if it's a valid Ethereum encoding
      if (
        extractedEncoding === EXTERNAL.SIGNING.ENCODINGS.EVM ||
        extractedEncoding === EXTERNAL.SIGNING.ENCODINGS.EIP7702_AUTH ||
        extractedEncoding === EXTERNAL.SIGNING.ENCODINGS.EIP7702_AUTH_LIST
      ) {
        encoding = extractedEncoding
      }
    }

    const meta = decodeEthereumTxPayload(payload, { hasExtraPayloads })
    const defaultEthPath = [0x8000002c, 0x8000003c, 0x80000000, 0, 0]
    const effectivePath = meta.path.length ? meta.path : defaultEthPath

    const baseData = meta.dataChunk.slice(0, Math.min(meta.dataLength, meta.dataChunk.length))
    let dataToSign: Buffer
    let hashType: number = EXTERNAL.SIGNING.HASHES.KECCAK256

    if (hasExtraPayloads) {
      dataToSign = baseData
    } else {
      if (meta.prehash) {
        dataToSign = baseData
        hashType = EXTERNAL.SIGNING.HASHES.NONE
      } else {
        dataToSign = buildEthereumSigningPreimage(meta, baseData)
      }
    }

    return {
      path: effectivePath,
      schema,
      curve: EXTERNAL.SIGNING.CURVES.SECP256K1,
      encoding,
      hashType,
      data: dataToSign,
      hasExtraPayloads,
      rawPayload: payload,
    }
  }
}

/**
 * Ethereum message parser
 * Handles Ethereum message signing (EIP-191, EIP-712, etc.)
 */
export class EthereumMessageParser implements ISignRequestParser {
  parse(payload: Buffer, hasExtraPayloads: boolean, schema: number): SignRequest {
    debug.protocol('[EthereumMessageParser] Parsing Ethereum message payload')
    debug.protocol('[EthereumMessageParser] Payload length: %d', payload.length)

    const minimumLength = 1 + 24 + 1 + 2 // protocol + path + display + length
    if (payload.length < minimumLength) {
      throw new Error('Ethereum message payload too short')
    }

    let offset = 0
    const protocolIdx = payload.readUInt8(offset)
    offset += 1

    const pathLength = payload.readUInt32LE(offset)
    offset += 4

    const path: number[] = []
    for (let i = 0; i < 5; i++) {
      const segment = payload.readUInt32LE(offset)
      offset += 4
      if (i < pathLength) {
        path.push(segment)
      }
    }

    const defaultEthPath = [0x8000002c, 0x8000003c, 0x80000000, 0, 0]
    const effectivePath = path.length ? path : defaultEthPath

    const isTypedData = protocolIdx === ETH_MSG_PROTOCOL.TYPED_DATA

    // Typed data frames do not include the display flag byte that personal_sign uses.
    // Only consume the flag when present to keep messageLength aligned correctly.
    let displayHexFlag = 0
    if (!isTypedData) {
      displayHexFlag = payload.readUInt8(offset)
      offset += 1
    }

    const declaredMessageLength = payload.readUInt16LE(offset)
    offset += 2

    const remaining = payload.slice(offset)

    let expectedLength = declaredMessageLength
    if (!Number.isFinite(expectedLength) || expectedLength < 0) {
      expectedLength = remaining.length
    }
    const baseChunkLength = remaining.length
    let chunkLength = Math.min(expectedLength, baseChunkLength)
    if (hasExtraPayloads) {
      const baseLimit =
        schema === SignRequestSchema.ETHEREUM_MESSAGE || schema === SignRequestSchema.EXTRA_DATA
          ? ETH_MESSAGE_BASE_CHUNK_SIZE
          : GENERIC_SIGNING_BASE_CHUNK_SIZE
      chunkLength = Math.min(chunkLength, baseLimit)
    }
    console.log('[EthereumMessageParser] chunk sizing', {
      expectedLength,
      baseChunkLength,
      chunkLength,
      hasExtraPayloads,
    })
    let messageChunk = remaining.slice(0, chunkLength)

    // Determine if this payload is prehashed (no extra frames but chunk shorter than original length)
    let isPrehashed = false
    if (!hasExtraPayloads && expectedLength > baseChunkLength) {
      isPrehashed = true
      messageChunk = remaining.slice(0, 32)
      chunkLength = messageChunk.length
    }

    const encoding = EXTERNAL.SIGNING.ENCODINGS.EVM
    let hashType = isTypedData ? EXTERNAL.SIGNING.HASHES.NONE : EXTERNAL.SIGNING.HASHES.KECCAK256

    if (!isTypedData && isPrehashed) {
      hashType = EXTERNAL.SIGNING.HASHES.NONE
    }

    // Extract decoder bytes (calldata decoder data) that come after the message
    const rawDecoderBytes = isPrehashed ? Buffer.alloc(0) : remaining.slice(chunkLength)
    const decoderBytes = rawDecoderBytes.length > 0 ? rawDecoderBytes : undefined

    const dataBuffer = Buffer.from(messageChunk)
    const reportedMessageLength = isPrehashed ? dataBuffer.length : declaredMessageLength

    const signRequest: SignRequest = {
      path: effectivePath,
      schema,
      curve: EXTERNAL.SIGNING.CURVES.SECP256K1,
      encoding,
      hashType,
      data: dataBuffer,
      rawPayload: payload,
      hasExtraPayloads,
      messageLength: reportedMessageLength,
      displayHex: displayHexFlag === 1,
      protocol: protocolIdx === ETH_MSG_PROTOCOL.TYPED_DATA ? 'eip712' : 'signPersonal',
      isPrehashed,
      decoderBytes,
    }

    console.log('[EthereumMessageParser] Parsed message request', {
      protocol: signRequest.protocol,
      path: effectivePath,
      declaredMessageLength,
      messageLength: signRequest.messageLength,
      chunkLength: dataBuffer.length,
      hasExtraPayloads,
      isPrehashed,
      displayHex: signRequest.displayHex,
      decoderBytesLength: decoderBytes?.length ?? 0,
      sample: dataBuffer.slice(0, Math.min(dataBuffer.length, 32)).toString('hex'),
    })

    if (isTypedData && !isPrehashed) {
      signRequest.typedDataPayload = Buffer.from(dataBuffer)
    }

    return signRequest
  }
}

/**
 * Solana transaction parser
 * Handles Solana transactions and program instructions
 */
export class SolanaSignRequestParser implements ISignRequestParser {
  parse(payload: Buffer, hasExtraPayloads: boolean, schema: number): SignRequest {
    debug.protocol('[SolanaParser] Parsing Solana transaction payload')
    debug.protocol('[SolanaParser] Payload length: %d', payload.length)

    const defaultSolPath = [0x8000002c, 0x800001f5, 0x80000000, 0x80000000]

    let offset = 0

    const readUInt32LE = () => {
      if (offset + 4 > payload.length) {
        return null
      }
      const value = payload.readUInt32LE(offset)
      offset += 4
      return value
    }

    const readUInt8 = () => {
      if (offset + 1 > payload.length) {
        return null
      }
      const value = payload.readUInt8(offset)
      offset += 1
      return value
    }

    const readUInt16LE = () => {
      if (offset + 2 > payload.length) {
        return null
      }
      const value = payload.readUInt16LE(offset)
      offset += 2
      return value
    }

    const encoding = readUInt32LE() ?? EXTERNAL.SIGNING.ENCODINGS.SOLANA
    const hashType = readUInt8() ?? EXTERNAL.SIGNING.HASHES.NONE
    const curve = readUInt8() ?? EXTERNAL.SIGNING.CURVES.ED25519

    const pathLength = readUInt32LE() ?? 0
    const path: number[] = []
    for (let i = 0; i < 5; i++) {
      const segment = readUInt32LE()
      if (segment === null) {
        break
      }
      if (i < pathLength) {
        path.push(segment)
      }
    }

    const omitPubkeyFlag = readUInt8() ?? 0

    const messageLength = readUInt16LE()
    let message = payload.slice(offset)
    if (messageLength !== null && messageLength <= message.length) {
      message = message.slice(0, messageLength)
    }

    const effectivePath = path.length ? path : defaultSolPath

    return {
      path: effectivePath,
      schema,
      curve,
      encoding,
      hashType,
      data: message,
      omitPubkey: omitPubkeyFlag === 1,
      hasExtraPayloads,
      rawPayload: payload,
    }
  }
}

/**
 * Extra data parser
 * Handles requests with additional payload chunks (schema 4)
 */
export class ExtraDataParser implements ISignRequestParser {
  parse(payload: Buffer, hasExtraPayloads: boolean, schema: number): SignRequest {
    debug.protocol('[ExtraDataParser] Parsing extra data payload')
    debug.protocol('[ExtraDataParser] Payload length: %d', payload.length)

    return {
      path: [], // Will be determined from context
      schema,
      curve: 0, // Will be determined from context
      encoding: 0, // Will be determined from context
      hashType: 0, // Will be determined from context
      data: payload,
    }
  }
}

/**
 * Generic parser for unknown or unsupported request types
 * Provides basic fallback functionality
 */
export class GenericSignRequestParser implements ISignRequestParser {
  parse(payload: Buffer, hasExtraPayloads: boolean, schema: number): SignRequest {
    debug.protocol('[GenericParser] Parsing generic/unknown payload')
    debug.protocol('[GenericParser] Schema: %d, Payload length: %d', schema, payload.length)

    let offset = 0

    const encoding = payload.readUInt32LE(offset)
    offset += 4

    const hashType = payload.readUInt8(offset)
    offset += 1

    const curve = payload.readUInt8(offset)
    offset += 1

    const pathLength = payload.readUInt32LE(offset)
    offset += 4

    const path: number[] = []
    for (let i = 0; i < 5; i++) {
      const segment = payload.readUInt32LE(offset)
      offset += 4
      if (i < pathLength) {
        path.push(segment)
      }
    }

    const omitPubkeyFlag = payload.readUInt8(offset)
    offset += 1

    let messageLength: number | null = null
    if (payload.length >= offset + 2) {
      messageLength = payload.readUInt16LE(offset)
      offset += 2
    }

    const rawChunk = payload.slice(offset)

    // Prehashing detection: The SDK sends only the 32-byte hash when the payload is too large.
    // We detect this by checking if:
    // 1. hashType is not NONE (prehashing is possible)
    // 2. messageLength is declared
    // 3. The actual message is exactly 32 bytes (the hash size)
    // 4. The declared messageLength is much larger than 32 (the original payload size)
    let isPrehashed = false
    if (
      !hasExtraPayloads &&
      hashType !== EXTERNAL.SIGNING.HASHES.NONE &&
      messageLength !== null &&
      messageLength > 32 &&
      rawChunk.length >= 32
    ) {
      const remainder = rawChunk.slice(32)
      const remainderHasData = remainder.some(byte => byte !== 0)
      if (!remainderHasData) {
        isPrehashed = true
      }
    }

    const chunkCapacity = hasExtraPayloads
      ? Math.min(GENERIC_SIGNING_BASE_CHUNK_SIZE, rawChunk.length)
      : rawChunk.length
    const desiredLength =
      !isPrehashed && messageLength !== null
        ? Math.min(messageLength, chunkCapacity)
        : chunkCapacity
    const message = isPrehashed ? rawChunk.slice(0, 32) : rawChunk.slice(0, desiredLength)

    if (process.env.DEBUG_SIGNING === '1') {
      console.log('[GenericParser] Prehash detection:', {
        hashType,
        messageLength,
        messageLen: rawChunk.length,
        isPrehashed,
        first64: rawChunk.toString('hex').slice(0, 64),
      })
    }

    const inferredMessageLength = messageLength ?? message.length

    if (process.env.DEBUG_SIGNING === '1' && isPrehashed) {
      console.debug('[GenericParser] Detected prehashed payload', {
        declaredLength: messageLength,
        chunkLength: message.length,
      })
    }

    const result = {
      path,
      schema,
      curve,
      encoding,
      hashType,
      data: message,
      omitPubkey: omitPubkeyFlag === 1,
      rawPayload: payload,
      messageLength: inferredMessageLength,
      isPrehashed,
    }

    debug.protocol('[GenericParser] Parsed sign request keys: %o', Object.keys(result))
    debug.protocol('[GenericParser] Parsed curve value: %d (type: %s)', curve, typeof curve)

    return result
  }
}

/**
 * Factory function to create appropriate parser based on schema
 * @param schema - Request schema type from SDK envelope
 * @returns Appropriate parser instance
 */
export function createSignRequestParser(schema: number, payload: Buffer): ISignRequestParser {
  switch (schema) {
    case SignRequestSchema.BITCOIN:
      return new BitcoinSignRequestParser()

    case SignRequestSchema.ETHEREUM_TRANSACTION:
      return new EthereumTransactionParser()

    case SignRequestSchema.ETHEREUM_MESSAGE:
      return new EthereumMessageParser()

    case SignRequestSchema.EXTRA_DATA:
      return new ExtraDataParser()

    case SignRequestSchema.GENERIC: {
      if (payload.length >= 4) {
        const encoding = payload.readUInt32LE(0)
        if (encoding === EXTERNAL.SIGNING.ENCODINGS.SOLANA) {
          return new SolanaSignRequestParser()
        }
      }
      return new GenericSignRequestParser()
    }

    default:
      debug.protocol('[SignRequestFactory] Unknown schema %d, using generic parser', schema)
      return new GenericSignRequestParser()
  }
}

/**
 * Main parsing function that uses the factory pattern
 * @param payload - Raw request payload after SDK envelope extraction
 * @param hasExtraPayloads - Whether request has extra data payloads
 * @param schema - Schema type from request envelope
 * @returns Parsed SignRequest
 */
export function parseSignRequestPayload(
  payload: Buffer,
  hasExtraPayloads: boolean,
  schema: number,
): SignRequest {
  const parser = createSignRequestParser(schema, payload)
  return parser.parse(payload, hasExtraPayloads, schema)
}
