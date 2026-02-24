import { createHash } from 'crypto'

const XRP_BASE58_ALPHABET = 'rpshnaf39wBUDNEGHJKLM4PQRST7VWXYZ2bcdeCg65jkm8oFqi1tuvAxyz'
const XRP_SIGNING_PREFIX = Buffer.from([0x53, 0x54, 0x58, 0x00]) // STX\0
const XRP_DROPS_PER_XRP = BigInt(1_000_000)
const BIGINT_ZERO = BigInt(0)
const XRP_POSITIVE_MASK = BigInt('0x4000000000000000')
const XRP_DROPS_MASK = BigInt('0x3fffffffffffffff')

const TX_TYPE_NAMES: Record<number, string> = {
  0: 'Payment',
  3: 'AccountSet',
  7: 'OfferCreate',
  8: 'OfferCancel',
  9: 'SetRegularKey',
  10: 'NickNameSet',
  12: 'SignerListSet',
}

const FIELD_NAMES: Record<string, string> = {
  '1:2': 'TransactionType',
  '2:2': 'Flags',
  '2:3': 'SourceTag',
  '2:4': 'Sequence',
  '2:10': 'Expiration',
  '2:14': 'DestinationTag',
  '2:25': 'OfferSequence',
  '2:27': 'LastLedgerSequence',
  '6:1': 'Amount',
  '6:4': 'TakerPays',
  '6:5': 'TakerGets',
  '6:8': 'Fee',
  '6:9': 'SendMax',
  '7:3': 'SigningPubKey',
  '7:4': 'TxnSignature',
  '8:1': 'Account',
  '8:3': 'Destination',
}

type ParsedAmount = {
  display: string
  xrpValue?: string
}

export interface XrpDecodedDetails {
  details: string
  transactionType?: string
  account?: string
  destination?: string
  amount?: string
}

export function decodeXrpSignPayload(data: Buffer): XrpDecodedDetails | null {
  if (!Buffer.isBuffer(data) || data.length === 0) {
    return null
  }

  const details: string[] = []
  const decoded: XrpDecodedDetails = { details: '' }
  let offset = data.subarray(0, 4).equals(XRP_SIGNING_PREFIX) ? 4 : 0
  let parsedFields = 0

  while (offset < data.length && parsedFields < 256) {
    const header = readFieldHeader(data, offset)
    if (!header) break
    offset = header.nextOffset

    const fieldData = readFieldData(data, offset, header.type)
    if (!fieldData) {
      if (details.length > 0) {
        details.push('[Notice] Unable to decode remaining XRP fields')
      }
      break
    }
    offset = fieldData.nextOffset
    parsedFields += 1

    const fieldKey = `${header.type}:${header.field}`
    const fieldName = FIELD_NAMES[fieldKey] ?? `Field ${fieldKey}`
    const raw = fieldData.value

    if (fieldKey === '1:2') {
      const txType = raw.readUInt16BE(0)
      const txName = TX_TYPE_NAMES[txType] ?? `Unknown (${txType})`
      decoded.transactionType = txName
      details.push(`[${fieldName}] ${txName}`)
      continue
    }

    if (fieldKey === '2:2') {
      details.push(`[${fieldName}] 0x${raw.toString('hex')}`)
      continue
    }

    if (header.type === 2) {
      details.push(`[${fieldName}] ${raw.readUInt32BE(0)}`)
      continue
    }

    if (header.type === 1) {
      details.push(`[${fieldName}] ${raw.readUInt16BE(0)}`)
      continue
    }

    if (header.type === 3) {
      details.push(`[${fieldName}] ${raw.readBigUInt64BE(0).toString()}`)
      continue
    }

    if (fieldKey === '8:1' || fieldKey === '8:3') {
      if (raw.length === 20) {
        const address = accountIdToClassicAddress(raw)
        if (fieldKey === '8:1') decoded.account = address
        if (fieldKey === '8:3') decoded.destination = address
        details.push(`[${fieldName}] ${address}`)
      } else {
        details.push(`[${fieldName}] ${raw.toString('hex')}`)
      }
      continue
    }

    if (header.type === 8) {
      details.push(`[${fieldName}] ${raw.toString('hex')}`)
      continue
    }

    if (header.type === 6) {
      const amount = decodeAmount(raw)
      if (fieldKey === '6:1' && amount.xrpValue) {
        decoded.amount = amount.xrpValue
      }
      details.push(`[${fieldName}] ${amount.display}`)
      continue
    }

    details.push(`[${fieldName}] ${raw.toString('hex')}`)
  }

  if (details.length === 0) {
    return null
  }

  decoded.details = details.join('\n')
  return decoded
}

function readFieldHeader(
  data: Buffer,
  offset: number,
): { type: number; field: number; nextOffset: number } | null {
  if (offset >= data.length) {
    return null
  }

  const byte0 = data[offset]
  let type = byte0 >> 4
  let field = byte0 & 0x0f
  let nextOffset = offset + 1

  if (type === 0) {
    if (nextOffset >= data.length) return null
    type = data[nextOffset]
    nextOffset += 1
  }

  if (field === 0) {
    if (nextOffset >= data.length) return null
    field = data[nextOffset]
    nextOffset += 1
  }

  if (type === 0 || field === 0) {
    return null
  }

  return { type, field, nextOffset }
}

function readFieldData(
  data: Buffer,
  offset: number,
  type: number,
): { value: Buffer; nextOffset: number } | null {
  if (offset >= data.length) {
    return null
  }

  if (type === 6) {
    const nativeLength = 8
    const iouLength = 48
    const isIou = (data[offset] & 0x80) !== 0
    const length = isIou ? iouLength : nativeLength
    if (offset + length > data.length) return null
    return {
      value: data.subarray(offset, offset + length),
      nextOffset: offset + length,
    }
  }

  const fixedLength: Record<number, number> = {
    1: 2,
    2: 4,
    3: 8,
    4: 16,
    5: 32,
    16: 1,
    17: 20,
  }

  if (fixedLength[type] !== undefined) {
    const length = fixedLength[type]
    if (offset + length > data.length) return null
    return {
      value: data.subarray(offset, offset + length),
      nextOffset: offset + length,
    }
  }

  if (type === 7 || type === 8 || type === 19) {
    const varLen = readVariableLength(data, offset)
    if (!varLen) return null
    if (varLen.nextOffset + varLen.length > data.length) return null
    return {
      value: data.subarray(varLen.nextOffset, varLen.nextOffset + varLen.length),
      nextOffset: varLen.nextOffset + varLen.length,
    }
  }

  return null
}

function readVariableLength(
  data: Buffer,
  offset: number,
): { length: number; nextOffset: number } | null {
  if (offset >= data.length) return null

  const b1 = data[offset]

  if (b1 <= 192) {
    return { length: b1, nextOffset: offset + 1 }
  }

  if (b1 <= 240) {
    if (offset + 1 >= data.length) return null
    const b2 = data[offset + 1]
    const length = 193 + (b1 - 193) * 256 + b2
    return { length, nextOffset: offset + 2 }
  }

  if (b1 <= 254) {
    if (offset + 2 >= data.length) return null
    const b2 = data[offset + 1]
    const b3 = data[offset + 2]
    const length = 12481 + (b1 - 241) * 65536 + b2 * 256 + b3
    return { length, nextOffset: offset + 3 }
  }

  return null
}

function decodeAmount(amount: Buffer): ParsedAmount {
  if (amount.length === 8 && (amount[0] & 0x80) === 0) {
    const signed = amount.readBigUInt64BE(0)
    const isPositive = (signed & XRP_POSITIVE_MASK) !== BIGINT_ZERO
    const drops = signed & XRP_DROPS_MASK
    const decimal = formatDropsToXrp(drops)
    return {
      display: `${isPositive ? '' : '-'}${decimal} XRP (${isPositive ? '' : '-'}${drops.toString()} drops)`,
      xrpValue: `${isPositive ? '' : '-'}${decimal}`,
    }
  }

  if (amount.length === 48 && (amount[0] & 0x80) !== 0) {
    const isPositive = (amount[0] & 0x40) !== 0
    const exponent = (((amount[0] & 0x3f) << 2) | ((amount[1] & 0xc0) >> 6)) - 97
    const mantissa = readIouMantissa(amount.subarray(0, 8))
    const currency = decodeIssuedCurrencyCode(amount.subarray(8, 28))
    const issuerAddress = accountIdToClassicAddress(amount.subarray(28, 48))
    const numeric = formatMantissaExponent(mantissa, exponent)
    return {
      display: `${isPositive ? '' : '-'}${numeric} ${currency} (issuer ${issuerAddress})`,
    }
  }

  return { display: amount.toString('hex') }
}

function readIouMantissa(header: Buffer): bigint {
  let mantissa = BigInt(header[1] & 0x3f) << BigInt(48)
  for (let i = 2; i < 8; i += 1) {
    mantissa |= BigInt(header[i]) << BigInt((7 - i) * 8)
  }
  return mantissa
}

function formatDropsToXrp(drops: bigint): string {
  const whole = drops / XRP_DROPS_PER_XRP
  const fractional = (drops % XRP_DROPS_PER_XRP).toString().padStart(6, '0').replace(/0+$/, '')
  return fractional.length > 0 ? `${whole.toString()}.${fractional}` : whole.toString()
}

function formatMantissaExponent(mantissa: bigint, exponent: number): string {
  if (mantissa === BIGINT_ZERO) return '0'
  if (exponent > 18 || exponent < -18) {
    return `${mantissa.toString()}e${exponent}`
  }
  const digits = mantissa.toString()
  if (exponent >= 0) {
    return `${digits}${'0'.repeat(exponent)}`
  }
  const pointIndex = digits.length + exponent
  if (pointIndex > 0) {
    return `${digits.slice(0, pointIndex)}.${digits.slice(pointIndex)}`.replace(/\.?0+$/, '')
  }
  return `0.${'0'.repeat(-pointIndex)}${digits}`.replace(/\.?0+$/, '')
}

function decodeIssuedCurrencyCode(currency: Buffer): string {
  if (currency.length !== 20) {
    return currency.toString('hex').toUpperCase()
  }

  const code = currency.subarray(12, 15)
  const paddedWithZeros =
    currency.subarray(0, 12).every(byte => byte === 0) &&
    currency.subarray(15).every(byte => byte === 0)
  const isAscii = code.every(byte => byte >= 0x20 && byte <= 0x7e)

  if (paddedWithZeros && isAscii) {
    return code.toString('ascii')
  }

  return currency.toString('hex').toUpperCase()
}

function accountIdToClassicAddress(accountId: Buffer): string {
  const payload = Buffer.concat([Buffer.from([0x00]), accountId])
  const checksum = sha256d(payload).subarray(0, 4)
  return encodeXrpBase58(Buffer.concat([payload, checksum]))
}

function sha256d(payload: Buffer): Buffer {
  return createHash('sha256').update(createHash('sha256').update(payload).digest()).digest()
}

function encodeXrpBase58(bytes: Buffer): string {
  if (bytes.length === 0) {
    return ''
  }

  const digits: number[] = [0]

  for (let byteIndex = 0; byteIndex < bytes.length; byteIndex += 1) {
    const byte = bytes[byteIndex]
    let carry = byte
    for (let i = 0; i < digits.length; i += 1) {
      const value = digits[i] * 256 + carry
      digits[i] = value % 58
      carry = Math.floor(value / 58)
    }
    while (carry > 0) {
      digits.push(carry % 58)
      carry = Math.floor(carry / 58)
    }
  }

  for (let i = 0; i < bytes.length && bytes[i] === 0; i += 1) {
    digits.push(0)
  }

  let encoded = ''
  for (let i = digits.length - 1; i >= 0; i -= 1) {
    encoded += XRP_BASE58_ALPHABET[digits[i]]
  }

  return encoded || XRP_BASE58_ALPHABET[0]
}
