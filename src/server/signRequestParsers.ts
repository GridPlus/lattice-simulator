/**
 * Structured Sign Request Parsers
 *
 * Factory pattern implementation for parsing different types of signing requests
 * based on schema/currency type. Each parser specializes in handling specific
 * cryptocurrency transaction formats and message types.
 */

import { EXTERNAL } from '../shared/constants'
import { buildEthereumSigningPreimage, decodeEthereumTxPayload } from './utils/ethereumTx'
import type { SignRequest } from '../shared/types'

/**
 * Schema constants mapping to different currencies/request types
 */
export enum SignRequestSchema {
  BITCOIN = 0,
  ETHEREUM_TRANSACTION = 1,
  ETHEREUM_MESSAGE = 2,
  SOLANA = 3,
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
    console.log('[BitcoinParser] Parsing Bitcoin transaction payload')
    console.log(`[BitcoinParser] Payload length: ${payload.length}`)

    let path: number[] = []

    try {
      // Bitcoin payload structure: [changePathLength(4)] + [changePath...] + [numPrevOuts(4)] + [prevOuts...]
      if (payload.length < 4) {
        throw new Error('Payload too short for Bitcoin transaction')
      }

      // Extract change path from payload
      const changePathLength = payload.readUInt32LE(0)
      console.log(`[BitcoinParser] Change path length: ${changePathLength}`)

      if (
        changePathLength > 0 &&
        changePathLength <= 10 &&
        payload.length >= 4 + changePathLength * 4
      ) {
        // Read the change path elements
        for (let i = 0; i < changePathLength; i++) {
          const pathElement = payload.readUInt32LE(4 + i * 4)
          path.push(pathElement)
        }
        console.log(`[BitcoinParser] Extracted change path: [${path.join(', ')}]`)
      }
    } catch (error) {
      console.error('[BitcoinParser] Error extracting path from Bitcoin payload:', error)
    }

    // If we couldn't extract a valid path, use default Bitcoin path
    if (path.length < 3) {
      path = [0x8000002c, 0x80000000, 0x80000000] // m/44'/0'/0' - default Bitcoin path
      console.log(`[BitcoinParser] Using default Bitcoin path: [${path.join(', ')}]`)
    }

    return {
      path,
      schema,
      curve: 0, // Bitcoin uses secp256k1
      encoding: 0, // Standard encoding
      hashType: 0, // Standard hash type
      data: payload,
    }
  }
}

/**
 * Ethereum transaction parser
 * Handles Ethereum-style transactions with gas, value, and smart contract calls
 */
export class EthereumTransactionParser implements ISignRequestParser {
  parse(payload: Buffer, hasExtraPayloads: boolean, schema: number): SignRequest {
    console.log('[EthereumParser] Parsing Ethereum transaction payload')
    console.log(`[EthereumParser] Payload length: ${payload.length}`)

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
      encoding: EXTERNAL.SIGNING.ENCODINGS.EVM,
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
    console.log('[EthereumMessageParser] Parsing Ethereum message payload')
    console.log(`[EthereumMessageParser] Payload length: ${payload.length}`)

    // Default Ethereum path for message signing
    const defaultEthPath = [0x8000002c, 0x8000003c, 0x80000000, 0, 0]

    return {
      path: defaultEthPath, // TODO: Extract from payload if available
      schema,
      curve: 0, // Ethereum uses secp256k1
      encoding: 4, // EVM encoding
      hashType: 1, // Keccak256
      data: payload,
    }
  }
}

/**
 * Solana transaction parser
 * Handles Solana transactions and program instructions
 */
export class SolanaSignRequestParser implements ISignRequestParser {
  parse(payload: Buffer, hasExtraPayloads: boolean, schema: number): SignRequest {
    console.log('[SolanaParser] Parsing Solana transaction payload')
    console.log(`[SolanaParser] Payload length: ${payload.length}`)

    // Default Solana path: m/44'/501'/0'/0'
    const defaultSolPath = [0x8000002c, 0x800001f5, 0x80000000, 0x80000000]

    return {
      path: defaultSolPath, // TODO: Extract from payload if available
      schema,
      curve: 1, // Ed25519
      encoding: 2, // Solana encoding
      hashType: 2, // SHA256
      data: payload,
    }
  }
}

/**
 * Extra data parser
 * Handles requests with additional payload chunks (schema 4)
 */
export class ExtraDataParser implements ISignRequestParser {
  parse(payload: Buffer, hasExtraPayloads: boolean, schema: number): SignRequest {
    console.log('[ExtraDataParser] Parsing extra data payload')
    console.log(`[ExtraDataParser] Payload length: ${payload.length}`)

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
    console.log('[GenericParser] Parsing generic/unknown payload')
    console.log(`[GenericParser] Schema: ${schema}, Payload length: ${payload.length}`)

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

    let message = payload.slice(offset)
    if (messageLength !== null && messageLength <= message.length) {
      message = message.slice(0, messageLength)
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
    }

    console.log('[GenericParser] Parsed sign request keys:', Object.keys(result))

    return result
  }
}

/**
 * Factory function to create appropriate parser based on schema
 * @param schema - Request schema type from SDK envelope
 * @returns Appropriate parser instance
 */
export function createSignRequestParser(schema: number): ISignRequestParser {
  switch (schema) {
    case SignRequestSchema.BITCOIN:
      return new BitcoinSignRequestParser()

    case SignRequestSchema.ETHEREUM_TRANSACTION:
      return new EthereumTransactionParser()

    case SignRequestSchema.ETHEREUM_MESSAGE:
      return new EthereumMessageParser()

    case SignRequestSchema.SOLANA:
      return new SolanaSignRequestParser()

    case SignRequestSchema.EXTRA_DATA:
      return new ExtraDataParser()

    default:
      console.log(`[SignRequestFactory] Unknown schema ${schema}, using generic parser`)
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
  const parser = createSignRequestParser(schema)
  return parser.parse(payload, hasExtraPayloads, schema)
}
