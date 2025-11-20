import { HARDENED_OFFSET } from './constants'
import type { WalletPath } from '../types'

export const BITCOIN_SCRIPT_TYPE = {
  P2PKH: 0x01,
  P2SH_P2WPKH: 0x03,
  P2WPKH: 0x04,
} as const

export type BitcoinScriptType =
  | typeof BITCOIN_SCRIPT_TYPE.P2PKH
  | typeof BITCOIN_SCRIPT_TYPE.P2SH_P2WPKH
  | typeof BITCOIN_SCRIPT_TYPE.P2WPKH

export type BitcoinScriptTypeName = 'p2pkh' | 'p2sh-p2wpkh' | 'p2wpkh'

export interface BitcoinInput {
  signerPath: WalletPath
  index: number
  value: bigint
  scriptType: BitcoinScriptTypeName
  txHash: Buffer
  sighashType: number
}

export interface BitcoinRecipient {
  version: number
  pubkeyHash: Buffer
  value: bigint
}

export interface BitcoinChange {
  path: WalletPath
  format: number
  pubkeyHash?: Buffer
  value: bigint
  addressType: BitcoinScriptTypeName
}

export interface ParsedBitcoinSignPayload {
  change: BitcoinChange
  fee: bigint
  recipient: BitcoinRecipient
  inputs: BitcoinInput[]
  network: 'mainnet' | 'testnet'
}

export const BITCOIN_VERSION_MAP: Record<
  number,
  { type: BitcoinScriptTypeName; network: 'mainnet' | 'testnet' }
> = {
  0x00: { type: 'p2pkh', network: 'mainnet' },
  0x6f: { type: 'p2pkh', network: 'testnet' },
  0x05: { type: 'p2sh-p2wpkh', network: 'mainnet' },
  0xc4: { type: 'p2sh-p2wpkh', network: 'testnet' },
  0xd0: { type: 'p2wpkh', network: 'mainnet' },
  0xf0: { type: 'p2wpkh', network: 'testnet' },
}

export function readUInt64LE(buffer: Buffer, offset: number): bigint {
  const low = buffer.readUInt32LE(offset)
  const high = buffer.readUInt32LE(offset + 4)
  return (BigInt(high) << BigInt(32)) | BigInt(low >>> 0)
}

function toScriptTypeName(value: number): BitcoinScriptTypeName {
  switch (value) {
    case BITCOIN_SCRIPT_TYPE.P2PKH:
      return 'p2pkh'
    case BITCOIN_SCRIPT_TYPE.P2SH_P2WPKH:
      return 'p2sh-p2wpkh'
    case BITCOIN_SCRIPT_TYPE.P2WPKH:
      return 'p2wpkh'
    default:
      throw new Error(`Unsupported Bitcoin script type byte: 0x${value.toString(16)}`)
  }
}

function deriveNetworkFromPath(path: WalletPath): 'mainnet' | 'testnet' {
  if (!path || path.length < 2) {
    return 'mainnet'
  }
  return path[1] === HARDENED_OFFSET + 1 ? 'testnet' : 'mainnet'
}

function deriveAddressTypeFromPath(path: WalletPath): BitcoinScriptTypeName {
  if (!path || path.length === 0) {
    return 'p2pkh'
  }
  const purpose = path[0]
  if (purpose === HARDENED_OFFSET + 44) {
    return 'p2pkh'
  }
  if (purpose === HARDENED_OFFSET + 49) {
    return 'p2sh-p2wpkh'
  }
  if (purpose === HARDENED_OFFSET + 84) {
    return 'p2wpkh'
  }
  throw new Error(`Unsupported Bitcoin change path purpose: ${purpose}`)
}

export function parseBitcoinSignPayload(payload: Buffer): ParsedBitcoinSignPayload {
  if (payload.length < 1 + 4) {
    throw new Error('Bitcoin payload too short to parse change path')
  }

  let offset = 0

  const changeFormat = payload.readUInt8(offset)
  offset += 1

  const changePathLength = payload.readUInt32LE(offset)
  offset += 4

  if (payload.length < offset + changePathLength * 4) {
    throw new Error('Bitcoin payload truncated before change path data')
  }

  const changePath: number[] = []
  for (let i = 0; i < changePathLength; i += 1) {
    changePath.push(payload.readUInt32LE(offset))
    offset += 4
  }

  if (payload.length < offset + 4) {
    throw new Error('Bitcoin payload missing fee field')
  }
  const fee = BigInt(payload.readUInt32LE(offset))
  offset += 4

  if (payload.length < offset + 1 + 20 + 8) {
    throw new Error('Bitcoin payload missing recipient data')
  }

  const recipientVersion = payload.readUInt8(offset)
  offset += 1
  const recipientHash = Buffer.from(payload.slice(offset, offset + 20))
  offset += 20
  const recipientValue = readUInt64LE(payload, offset)
  offset += 8

  if (payload.length < offset + 1) {
    throw new Error('Bitcoin payload missing input count')
  }
  const inputCount = payload.readUInt8(offset)
  offset += 1

  const inputs: BitcoinInput[] = []
  for (let i = 0; i < inputCount; i += 1) {
    if (payload.length < offset + 4) {
      throw new Error(`Bitcoin payload truncated before signer path length for input ${i}`)
    }
    const signerPathLength = payload.readUInt32LE(offset)
    offset += 4
    if (payload.length < offset + signerPathLength * 4) {
      throw new Error(`Bitcoin payload truncated before signer path data for input ${i}`)
    }
    const signerPath: number[] = []
    for (let j = 0; j < signerPathLength; j += 1) {
      signerPath.push(payload.readUInt32LE(offset))
      offset += 4
    }

    if (payload.length < offset + 4 + 8 + 1 + 32) {
      throw new Error(`Bitcoin payload truncated before input metadata for input ${i}`)
    }

    const index = payload.readUInt32LE(offset)
    offset += 4
    const value = readUInt64LE(payload, offset)
    offset += 8
    const scriptTypeByte = payload.readUInt8(offset)
    offset += 1
    const txHash = Buffer.from(payload.slice(offset, offset + 32))
    offset += 32

    inputs.push({
      signerPath,
      index,
      value,
      scriptType: toScriptTypeName(scriptTypeByte),
      txHash,
      sighashType: 0x01, // Default to SIGHASH_ALL
    })
  }

  // Determine network preference: prefer change path, fall back to first input
  let network: 'mainnet' | 'testnet' = 'mainnet'
  if (changePath.length >= 2) {
    network = deriveNetworkFromPath(changePath)
  } else if (inputs.length > 0) {
    network = deriveNetworkFromPath(inputs[0].signerPath)
  }

  const changeAddressType = deriveAddressTypeFromPath(changePath)

  const recipientVersionInfo = BITCOIN_VERSION_MAP[recipientVersion]
  if (!recipientVersionInfo) {
    throw new Error(
      `Unsupported recipient address version byte: 0x${recipientVersion.toString(16)}`,
    )
  }

  const inputSum = inputs.reduce((acc, input) => acc + input.value, BigInt(0))
  const changeValue = inputSum - recipientValue - fee

  return {
    change: {
      path: changePath,
      format: changeFormat,
      value: changeValue > BigInt(0) ? changeValue : BigInt(0),
      addressType: changeAddressType,
    },
    fee,
    recipient: {
      version: recipientVersion,
      pubkeyHash: recipientHash,
      value: recipientValue,
    },
    inputs,
    network,
  }
}

export function encodeChangePubkeyHash(pubkeyHash: Buffer | undefined): Buffer {
  if (!pubkeyHash) {
    return Buffer.alloc(20, 0)
  }
  if (pubkeyHash.length === 20) {
    return Buffer.from(pubkeyHash)
  }
  throw new Error(`Unexpected change pubkey hash length: ${pubkeyHash.length}`)
}
