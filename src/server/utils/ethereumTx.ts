import { Buffer } from 'buffer'
import { RLP } from '@ethereumjs/rlp'
import { PROTOCOL_CONSTANTS } from '../../shared/constants'

/**
 * Parse authorization list from serialized EIP-7702 transaction data
 */
const parseAuthorizationList = (data: Buffer): Buffer[][] => {
  try {
    console.log('[parseAuthorizationList] Input data length:', data.length)
    console.log('[parseAuthorizationList] First byte:', data[0])

    // EIP-7702 transactions have type 4 prefix
    if (data.length === 0 || data[0] !== 4) {
      console.log('[parseAuthorizationList] Not an EIP-7702 transaction')
      return []
    }

    // Remove the type prefix and decode RLP
    const rlpData = data.slice(1)
    const decoded = RLP.decode(rlpData) as any[]

    console.log('[parseAuthorizationList] Decoded length:', decoded.length)

    // EIP-7702 structure: [chainId, nonce, maxPriorityFeePerGas, maxFeePerGas, gasLimit, to, value, data, accessList, authorizationList]
    if (decoded.length >= 10) {
      const authorizationList = decoded[9]
      console.log('[parseAuthorizationList] Authorization list type:', typeof authorizationList)
      console.log(
        '[parseAuthorizationList] Authorization list is array:',
        Array.isArray(authorizationList),
      )
      console.log('[parseAuthorizationList] Authorization list length:', authorizationList?.length)

      if (Array.isArray(authorizationList)) {
        const result = authorizationList.map((auth: any) => {
          if (Buffer.isBuffer(auth)) {
            // Single authorization as buffer
            return [auth]
          } else if (Array.isArray(auth)) {
            // Authorization list as array of buffers
            return auth.map((item: any) => (Buffer.isBuffer(item) ? item : Buffer.from(item)))
          }
          return []
        })
        console.log('[parseAuthorizationList] Parsed authorization list:', result.length, 'items')
        return result
      }
    }

    console.log('[parseAuthorizationList] No authorization list found')
    return []
  } catch (error) {
    console.log('[parseAuthorizationList] Error parsing authorization list:', error)
    return []
  }
}

const CONTRACT_DEPLOY_SENTINEL = Buffer.from('08002e0fec8e6acf00835f43c9764f7364fa3f42', 'hex')

const trimLeadingZeros = (buf: Buffer): Buffer => {
  let offset = 0
  while (offset < buf.length && buf[offset] === 0) offset++
  return offset >= buf.length ? Buffer.alloc(0) : buf.slice(offset)
}

const normalizeQuantity = (buf: Buffer): Buffer => {
  if (!buf || buf.length === 0) return Buffer.alloc(0)
  return trimLeadingZeros(buf)
}

const toAddressBuffer = (buf: Buffer): Buffer => {
  if (!buf || buf.length === 0) return Buffer.alloc(0)
  if (buf.equals(CONTRACT_DEPLOY_SENTINEL)) return Buffer.alloc(0)
  return buf
}

const bufferToBigInt = (buf: Buffer): bigint => {
  if (!buf || buf.length === 0) return BigInt(0)
  return BigInt(`0x${buf.toString('hex')}`)
}

export interface DecodedEthereumTxPayload {
  useEip155: boolean
  chainId?: bigint
  chainIdBuf?: Buffer
  path: number[]
  nonce: Buffer
  gasPrice: Buffer
  gasLimit: Buffer
  to: Buffer
  value: Buffer
  maxPriorityFeePerGas: Buffer
  txType?: 0 | 1 | 2 | 4
  dataLength: number
  dataChunk: Buffer
  remainingChunk: Buffer
  prehash: boolean
}

interface DecodeOptions {
  hasExtraPayloads?: boolean
}

export const decodeEthereumTxPayload = (
  payload: Buffer,
  { hasExtraPayloads = false }: DecodeOptions = {},
): DecodedEthereumTxPayload => {
  let offset = 0

  const useEip155 = payload.readUInt8(offset) === 1
  offset += 1

  const chainIdIndicator = payload.readUInt8(offset)
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

  const nonce = payload.slice(offset, offset + 4)
  offset += 4

  const gasPrice = payload.slice(offset, offset + 8)
  offset += 8

  const gasLimit = payload.slice(offset, offset + 4)
  offset += 4

  const to = payload.slice(offset, offset + 20)
  offset += 20

  const value = payload.slice(offset, offset + 32)
  offset += 32

  const prehashUnsupportedFlag = payload.readUInt8(offset) === 1
  offset += 1

  const txTypeByte = payload.readUInt8(offset)
  offset += 1

  const maxPriorityFeePerGas = payload.slice(offset, offset + 8)
  offset += 8

  const dataLength = payload.readUInt16BE(offset)
  offset += 2

  let chainIdBuf: Buffer | undefined
  if (chainIdIndicator === PROTOCOL_CONSTANTS.HANDLE_LARGER_CHAIN_ID) {
    const chainIdLength = payload.readUInt8(offset)
    offset += 1
    chainIdBuf = payload.slice(offset, offset + chainIdLength)
    offset += chainIdLength
  } else {
    chainIdBuf = Buffer.from([chainIdIndicator])
  }

  const dataRegion = payload.slice(offset)
  const dataChunk = dataRegion.slice(0, Math.min(dataLength, dataRegion.length))
  const remainingChunk = dataRegion.slice(dataChunk.length)

  const chainId = chainIdBuf ? bufferToBigInt(chainIdBuf) : undefined

  let txType: 0 | 1 | 2 | 4 | undefined
  if (txTypeByte === 1) txType = 1
  else if (txTypeByte === 2) txType = 2
  else if (txTypeByte === 4) txType = 4
  else txType = undefined

  console.log(
    '[decodeEthereumTxPayload] Transaction type byte:',
    txTypeByte,
    'Detected type:',
    txType,
  )

  const prehash = prehashUnsupportedFlag || (!hasExtraPayloads && dataLength > dataChunk.length)

  return {
    useEip155,
    chainId,
    chainIdBuf,
    path,
    nonce,
    gasPrice,
    gasLimit,
    to,
    value,
    maxPriorityFeePerGas,
    txType,
    dataLength,
    dataChunk,
    remainingChunk,
    prehash,
  }
}

const buildTypedPreimage = (meta: DecodedEthereumTxPayload, data: Buffer): Buffer => {
  const chainIdBuf = trimLeadingZeros(meta.chainIdBuf ?? Buffer.alloc(0))
  const nonce = normalizeQuantity(meta.nonce)
  const gasLimit = normalizeQuantity(meta.gasLimit)
  const value = normalizeQuantity(meta.value)
  const toBuf = toAddressBuffer(meta.to)
  const accessList: Buffer[][] = []

  if (meta.txType === 2) {
    // EIP-1559 (Fee Market)
    const maxPriority = normalizeQuantity(meta.maxPriorityFeePerGas)
    const maxFee = normalizeQuantity(meta.gasPrice)
    const payload = [
      chainIdBuf,
      nonce,
      maxPriority,
      maxFee,
      gasLimit,
      toBuf,
      value,
      data,
      accessList,
    ]
    return Buffer.concat([Buffer.from([2]), Buffer.from(RLP.encode(payload))])
  }

  if (meta.txType === 4) {
    // EIP-7702 (Account Abstraction)
    console.log('[buildTypedPreimage] Processing EIP-7702 transaction')
    const maxPriority = normalizeQuantity(meta.maxPriorityFeePerGas)
    const maxFee = normalizeQuantity(meta.gasPrice)

    // Parse the authorization list from the transaction data
    const authorizationList = parseAuthorizationList(data)

    const payload = [
      chainIdBuf,
      nonce,
      maxPriority,
      maxFee,
      gasLimit,
      toBuf,
      value,
      data,
      accessList,
      authorizationList,
    ]
    return Buffer.concat([Buffer.from([4]), Buffer.from(RLP.encode(payload))])
  }

  // EIP-2930
  const gasPrice = normalizeQuantity(meta.gasPrice)
  const payload = [chainIdBuf, nonce, gasPrice, gasLimit, toBuf, value, data, accessList]
  return Buffer.concat([Buffer.from([1]), Buffer.from(RLP.encode(payload))])
}

export const buildEthereumSigningPreimage = (
  meta: DecodedEthereumTxPayload,
  data: Buffer,
): Buffer => {
  if (meta.prehash) {
    return data
  }

  const trimmedData = data.length ? data.slice(0, meta.dataLength) : Buffer.alloc(0)

  if (meta.txType === 1 || meta.txType === 2 || meta.txType === 4) {
    return buildTypedPreimage(meta, trimmedData)
  }

  const nonce = normalizeQuantity(meta.nonce)
  const gasPrice = normalizeQuantity(meta.gasPrice)
  const gasLimit = normalizeQuantity(meta.gasLimit)
  const toBuf = toAddressBuffer(meta.to)
  const value = normalizeQuantity(meta.value)

  const payload = [nonce, gasPrice, gasLimit, toBuf, value, trimmedData]

  if (meta.useEip155) {
    const chainIdBuf = trimLeadingZeros(meta.chainIdBuf ?? Buffer.alloc(0))
    payload.push(chainIdBuf)
    payload.push(Buffer.alloc(0))
    payload.push(Buffer.alloc(0))
  }

  return Buffer.from(RLP.encode(payload))
}
