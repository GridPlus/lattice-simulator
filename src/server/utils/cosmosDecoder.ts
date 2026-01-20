import { createHash } from 'crypto'

type DecodeType =
  | 'unsupported'
  | 'u32'
  | 'u64'
  | 'bytes'
  | 'string'
  | 'nested'
  | 'msgType'
  | 'msgData'
  | 'address'
  | 'maybeString'

type CosmosMsgType =
  | 'none'
  | 'send'
  | 'multiSend'
  | 'ibcTransfer'
  | 'delegate'
  | 'undelegate'
  | 'redelegate'
  | 'executeContract'
  | 'unknown'

interface ProtoItem {
  tag: number
  decodeType: DecodeType
  neverPrint?: boolean
  prefix?: string
  nested?: ProtoSpec
}

interface ProtoSpec {
  items: ProtoItem[]
}

interface DecodeContext {
  output: string[]
  messageTypes: string[]
  addressTags?: Record<string, string>
}

export interface CosmosDecodedDetails {
  details: string
  messageTypes: string[]
}

// SignDoc tags
const SIGN_DOC_TAG_TX = 1
const SIGN_DOC_TAG_AUTH = 2
const SIGN_DOC_TAG_CHAIN_ID = 3
const SIGN_DOC_TAG_ACCOUNT_NUM = 4

const SIGN_DOC_TAG_TX__MSGS = 1
const SIGN_DOC_TAG_TX__MEMO = 2
const SIGN_DOC_TAG_TX__TIMEOUT = 3
const SIGN_DOC_TAG_TX__EXT_OPTS = 1023
const SIGN_DOC_TAG_TX__NON_CRIT_EXT_OPTS = 2047

const SIGN_DOC_TAG_TX__MSGS__TYPE = 1
const SIGN_DOC_TAG_TX__MSGS__DATA = 2

const SIGN_DOC_TAG_AUTH__SIGNER_INFO = 1
const SIGN_DOC_TAG_AUTH__FEE = 2

const SIGN_DOC_TAG_AUTH__SIGNER_INFO__PUBKEY = 1
const SIGN_DOC_TAG_AUTH__SIGNER_INFO__MODE = 2
const SIGN_DOC_TAG_AUTH__SIGNER_INFO__SEQUENCE = 3

const SIGN_DOC_TAG_AUTH__SIGNER_INFO__MODE__SINGLE = 1
const SIGN_DOC_TAG_AUTH__SIGNER_INFO__MODE__MULTI = 2

const SIGN_DOC_TAG_AUTH__SIGNER_INFO__MODE__SINGLE__MODE = 1
const SIGN_DOC_TAG_AUTH__SIGNER_INFO__MODE__MULTI__MODE = 1

const SIGN_DOC_TAG_AUTH__FEE__AMOUNT = 1
const SIGN_DOC_TAG_AUTH__FEE__GAS_LIMIT = 2
const SIGN_DOC_TAG_AUTH__FEE__PAYER = 3
const SIGN_DOC_TAG_AUTH__FEE__GRANTER = 4

const COIN_TAG__DENOM = 1
const COIN_TAG__AMOUNT = 2

const INPUT_TAG__ADDRESS = 1
const INPUT_TAG__COIN = 2
const OUTPUT_TAG__ADDRESS = 1
const OUTPUT_TAG__COIN = 2

// Message tags
const MSG_SEND_TAG__FROM = 1
const MSG_SEND_TAG__TO = 2
const MSG_SEND_TAG__AMOUNT = 3
const MSG_MULTI_SEND_TAG__INPUT = 1
const MSG_MULTI_SEND_TAG__OUTPUT = 2
const MSG_EXECUTE_CONTRACT__SENDER = 1
const MSG_EXECUTE_CONTRACT__CONTRACT = 2
const MSG_EXECUTE_CONTRACT__EXECUTE_MSG = 3
const MSG_EXECUTE_CONTRACT__COINS = 5
const MSG_IBC_TRANSFER__SOURCE_PORT = 1
const MSG_IBC_TRANSFER__SOURCE_CHANNEL = 2
const MSG_IBC_TRANSFER__TOKEN = 3
const MSG_IBC_TRANSFER__SENDER = 4
const MSG_IBC_TRANSFER__RECEIVER = 5
const MSG_IBC_TRANSFER__TIMEOUT_HEIGHT = 6
const MSG_IBC_TRANSFER__TIMEOUT_TIMESTAMP = 7
const MSG_IBC_TRANSFER__MEMO = 8
const MSG_STAKING__DELEGATOR = 1
const MSG_STAKING__VALIDATOR = 2
const MSG_STAKING__AMOUNT = 3
const MSG_STAKING_REDELEGATE__VALIDATOR_SRC = 2
const MSG_STAKING_REDELEGATE__VALIDATOR_DST = 3
const MSG_STAKING_REDELEGATE__AMOUNT = 4

const coinBuf: ProtoSpec = {
  items: [
    {
      tag: COIN_TAG__DENOM,
      prefix: '\n  [Denom] ',
      decodeType: 'string',
    },
    {
      tag: COIN_TAG__AMOUNT,
      prefix: '\n  [Amount] ',
      decodeType: 'string',
    },
  ],
}

const inputBuf: ProtoSpec = {
  items: [
    {
      tag: INPUT_TAG__ADDRESS,
      prefix: '\n  [From] ',
      decodeType: 'address',
    },
    {
      tag: INPUT_TAG__COIN,
      decodeType: 'nested',
      nested: coinBuf,
    },
  ],
}

const outputBuf: ProtoSpec = {
  items: [
    {
      tag: OUTPUT_TAG__ADDRESS,
      prefix: '\n  [To] ',
      decodeType: 'address',
    },
    {
      tag: OUTPUT_TAG__COIN,
      decodeType: 'nested',
      nested: coinBuf,
    },
  ],
}

const msgExecuteContractBuf: ProtoSpec = {
  items: [
    {
      tag: MSG_EXECUTE_CONTRACT__SENDER,
      prefix: '\n  [Sender] ',
      decodeType: 'address',
    },
    {
      tag: MSG_EXECUTE_CONTRACT__CONTRACT,
      prefix: '\n  [Contract] ',
      decodeType: 'address',
    },
    {
      tag: MSG_EXECUTE_CONTRACT__EXECUTE_MSG,
      prefix: '\n  [Data]\n    ',
      decodeType: 'maybeString',
    },
    {
      tag: MSG_EXECUTE_CONTRACT__COINS,
      decodeType: 'nested',
      nested: coinBuf,
    },
  ],
}

const msgSendBuf: ProtoSpec = {
  items: [
    {
      tag: MSG_SEND_TAG__FROM,
      prefix: '\n  [From] ',
      decodeType: 'address',
    },
    {
      tag: MSG_SEND_TAG__TO,
      prefix: '\n  [To] ',
      decodeType: 'address',
    },
    {
      tag: MSG_SEND_TAG__AMOUNT,
      decodeType: 'nested',
      nested: coinBuf,
    },
  ],
}

const msgIbcTransferBuf: ProtoSpec = {
  items: [
    {
      tag: MSG_IBC_TRANSFER__SOURCE_PORT,
      prefix: '\n  [Port] ',
      decodeType: 'string',
    },
    {
      tag: MSG_IBC_TRANSFER__SOURCE_CHANNEL,
      prefix: '\n  [Channel] ',
      decodeType: 'string',
    },
    {
      tag: MSG_IBC_TRANSFER__TOKEN,
      decodeType: 'nested',
      nested: coinBuf,
    },
    {
      tag: MSG_IBC_TRANSFER__SENDER,
      prefix: '\n  [From] ',
      decodeType: 'address',
    },
    {
      tag: MSG_IBC_TRANSFER__RECEIVER,
      prefix: '\n  [To] ',
      decodeType: 'address',
    },
    {
      tag: MSG_IBC_TRANSFER__TIMEOUT_HEIGHT,
      neverPrint: true,
      decodeType: 'bytes',
    },
    {
      tag: MSG_IBC_TRANSFER__TIMEOUT_TIMESTAMP,
      prefix: '\n  [Timeout (ns)] ',
      decodeType: 'u64',
    },
    {
      tag: MSG_IBC_TRANSFER__MEMO,
      prefix: '\n  [Msg Memo] ',
      decodeType: 'string',
    },
  ],
}

const msgStakingDelegateBuf: ProtoSpec = {
  items: [
    {
      tag: MSG_STAKING__DELEGATOR,
      prefix: '\n  [Delegator] ',
      decodeType: 'address',
    },
    {
      tag: MSG_STAKING__VALIDATOR,
      prefix: '\n  [Validator] ',
      decodeType: 'address',
    },
    {
      tag: MSG_STAKING__AMOUNT,
      decodeType: 'nested',
      nested: coinBuf,
    },
  ],
}

const msgStakingRedelegateBuf: ProtoSpec = {
  items: [
    {
      tag: MSG_STAKING__DELEGATOR,
      prefix: '\n  [Delegator] ',
      decodeType: 'address',
    },
    {
      tag: MSG_STAKING_REDELEGATE__VALIDATOR_SRC,
      prefix: '\n  [Src Validator] ',
      decodeType: 'address',
    },
    {
      tag: MSG_STAKING_REDELEGATE__VALIDATOR_DST,
      prefix: '\n  [Dst Validator] ',
      decodeType: 'address',
    },
    {
      tag: MSG_STAKING_REDELEGATE__AMOUNT,
      decodeType: 'nested',
      nested: coinBuf,
    },
  ],
}

const msgMultiSendBuf: ProtoSpec = {
  items: [
    {
      tag: MSG_MULTI_SEND_TAG__INPUT,
      prefix: '\n[Input]',
      decodeType: 'nested',
      nested: inputBuf,
    },
    {
      tag: MSG_MULTI_SEND_TAG__OUTPUT,
      prefix: '\n[Output]',
      decodeType: 'nested',
      nested: outputBuf,
    },
  ],
}

const txMsgsBuf: ProtoSpec = {
  items: [
    {
      tag: SIGN_DOC_TAG_TX__MSGS__TYPE,
      prefix: '\n',
      decodeType: 'msgType',
    },
    {
      tag: SIGN_DOC_TAG_TX__MSGS__DATA,
      decodeType: 'msgData',
    },
  ],
}

const txBuf: ProtoSpec = {
  items: [
    {
      tag: SIGN_DOC_TAG_TX__MSGS,
      decodeType: 'nested',
      nested: txMsgsBuf,
    },
    {
      tag: SIGN_DOC_TAG_TX__MEMO,
      prefix: '\n\n[Memo] ',
      decodeType: 'string',
    },
    {
      tag: SIGN_DOC_TAG_TX__TIMEOUT,
      prefix: '\n\n[Timeout] ',
      decodeType: 'u64',
    },
    {
      tag: SIGN_DOC_TAG_TX__EXT_OPTS,
      decodeType: 'unsupported',
    },
    {
      tag: SIGN_DOC_TAG_TX__NON_CRIT_EXT_OPTS,
      decodeType: 'unsupported',
    },
  ],
}

const authInfoSignerModeSingleBuf: ProtoSpec = {
  items: [
    {
      tag: SIGN_DOC_TAG_AUTH__SIGNER_INFO__MODE__SINGLE__MODE,
      decodeType: 'u32',
      neverPrint: true,
    },
  ],
}

const authInfoSignerModeMultiBuf: ProtoSpec = {
  items: [
    {
      tag: SIGN_DOC_TAG_AUTH__SIGNER_INFO__MODE__MULTI__MODE,
      decodeType: 'u32',
      neverPrint: true,
    },
  ],
}

const authInfoSignerModeBuf: ProtoSpec = {
  items: [
    {
      tag: SIGN_DOC_TAG_AUTH__SIGNER_INFO__MODE__SINGLE,
      decodeType: 'nested',
      nested: authInfoSignerModeSingleBuf,
    },
    {
      tag: SIGN_DOC_TAG_AUTH__SIGNER_INFO__MODE__MULTI,
      decodeType: 'nested',
      nested: authInfoSignerModeMultiBuf,
    },
  ],
}

const authInfoSignerInfoBuf: ProtoSpec = {
  items: [
    {
      tag: SIGN_DOC_TAG_AUTH__SIGNER_INFO__PUBKEY,
      neverPrint: true,
      decodeType: 'string',
    },
    {
      tag: SIGN_DOC_TAG_AUTH__SIGNER_INFO__MODE,
      decodeType: 'nested',
      nested: authInfoSignerModeBuf,
    },
    {
      tag: SIGN_DOC_TAG_AUTH__SIGNER_INFO__SEQUENCE,
      decodeType: 'u64',
      neverPrint: true,
    },
  ],
}

const authInfoFeeBuf: ProtoSpec = {
  items: [
    {
      tag: SIGN_DOC_TAG_AUTH__FEE__AMOUNT,
      decodeType: 'nested',
      nested: coinBuf,
    },
    {
      tag: SIGN_DOC_TAG_AUTH__FEE__GAS_LIMIT,
      prefix: '\n  [Gas Limit] ',
      decodeType: 'u64',
    },
    {
      tag: SIGN_DOC_TAG_AUTH__FEE__PAYER,
      decodeType: 'unsupported',
    },
    {
      tag: SIGN_DOC_TAG_AUTH__FEE__GRANTER,
      decodeType: 'unsupported',
    },
  ],
}

const authInfoBuf: ProtoSpec = {
  items: [
    {
      tag: SIGN_DOC_TAG_AUTH__SIGNER_INFO,
      decodeType: 'nested',
      nested: authInfoSignerInfoBuf,
    },
    {
      tag: SIGN_DOC_TAG_AUTH__FEE,
      prefix: '\n[Fee]',
      decodeType: 'nested',
      nested: authInfoFeeBuf,
    },
  ],
}

const cosmosBufA: ProtoSpec = {
  items: [
    {
      tag: SIGN_DOC_TAG_TX,
      neverPrint: true,
      decodeType: 'nested',
      nested: txBuf,
    },
    {
      tag: SIGN_DOC_TAG_AUTH,
      decodeType: 'nested',
      nested: authInfoBuf,
    },
    {
      tag: SIGN_DOC_TAG_CHAIN_ID,
      prefix: '\n\n[Chain] ',
      decodeType: 'string',
    },
    {
      tag: SIGN_DOC_TAG_ACCOUNT_NUM,
      neverPrint: true,
      decodeType: 'u64',
    },
  ],
}

const cosmosBufB: ProtoSpec = {
  items: [
    {
      tag: SIGN_DOC_TAG_TX,
      decodeType: 'nested',
      nested: txBuf,
    },
    {
      tag: SIGN_DOC_TAG_AUTH,
      neverPrint: true,
      decodeType: 'nested',
      nested: authInfoBuf,
    },
    {
      tag: SIGN_DOC_TAG_CHAIN_ID,
      neverPrint: true,
      decodeType: 'string',
    },
    {
      tag: SIGN_DOC_TAG_ACCOUNT_NUM,
      neverPrint: true,
      decodeType: 'u64',
    },
  ],
}

const MSG_TYPE_MAP: Record<
  string,
  { type: CosmosMsgType; label: string; proto: ProtoSpec | null }
> = {
  '/cosmos.bank.v1beta1.MsgSend': {
    type: 'send',
    label: 'Send',
    proto: msgSendBuf,
  },
  '/cosmos.bank.v1beta1.MsgMultiSend': {
    type: 'multiSend',
    label: 'MultiSend',
    proto: msgMultiSendBuf,
  },
  '/ibc.applications.transfer.v1.MsgTransfer': {
    type: 'ibcTransfer',
    label: 'IBC Transfer',
    proto: msgIbcTransferBuf,
  },
  '/cosmos.staking.v1beta1.MsgDelegate': {
    type: 'delegate',
    label: 'Delegate',
    proto: msgStakingDelegateBuf,
  },
  '/cosmos.staking.v1beta1.MsgUndelegate': {
    type: 'undelegate',
    label: 'Undelegate',
    proto: msgStakingDelegateBuf,
  },
  '/cosmos.staking.v1beta1.MsgBeginRedelegate': {
    type: 'redelegate',
    label: 'Redelegate',
    proto: msgStakingRedelegateBuf,
  },
  '/cosmwasm.wasm.v1.MsgExecuteContract': {
    type: 'executeContract',
    label: 'Execute Contract',
    proto: msgExecuteContractBuf,
  },
  '/terra.wasm.v1beta1.MsgExecuteContract': {
    type: 'executeContract',
    label: 'Execute Contract',
    proto: msgExecuteContractBuf,
  },
}

const JSON_MSG_TYPE_MAP: Record<string, { type: CosmosMsgType; label: string }> = {
  'cosmos-sdk/MsgSend': { type: 'send', label: 'Send' },
  'cosmos-sdk/MsgMultiSend': { type: 'multiSend', label: 'MultiSend' },
  'cosmos-sdk/MsgDelegate': { type: 'delegate', label: 'Delegate' },
  'cosmos-sdk/MsgUndelegate': { type: 'undelegate', label: 'Undelegate' },
  'cosmos-sdk/MsgBeginRedelegate': { type: 'redelegate', label: 'Redelegate' },
  'cosmos-sdk/MsgTransfer': { type: 'ibcTransfer', label: 'IBC Transfer' },
  'cosmos-sdk/MsgExecuteContract': { type: 'executeContract', label: 'Execute Contract' },
  'wasm/MsgExecuteContract': { type: 'executeContract', label: 'Execute Contract' },
}

function readVarint32(buffer: Buffer, offset: number): { value: number; bytes: number } | null {
  if (offset >= buffer.length) {
    return null
  }
  let value = 0
  for (let index = 0; index < 5; index++) {
    if (offset + index >= buffer.length) {
      return null
    }
    const byte = buffer[offset + index]
    value |= (byte & 0x7f) << (7 * index)
    if (byte < 0x80) {
      return { value: value >>> 0, bytes: index + 1 }
    }
  }
  return null
}

function readVarint64(buffer: Buffer, offset: number): { value: bigint; bytes: number } | null {
  if (offset >= buffer.length) {
    return null
  }
  let value = 0n
  for (let index = 0; index < 10; index++) {
    if (offset + index >= buffer.length) {
      return null
    }
    const byte = buffer[offset + index]
    value |= BigInt(byte & 0x7f) << BigInt(7 * index)
    if (byte < 0x80) {
      return { value, bytes: index + 1 }
    }
  }
  return null
}

function isPrintableAsciiBuffer(buffer: Buffer): boolean {
  if (buffer.length === 0) {
    return false
  }
  for (const byte of buffer) {
    if (
      byte !== 0x00 &&
      byte !== 0x09 &&
      byte !== 0x0a &&
      byte !== 0x0d &&
      (byte < 0x20 || byte > 0x7e)
    ) {
      return false
    }
  }
  return true
}

function bufferToAscii(buffer: Buffer): string {
  const raw = buffer.toString('utf8')
  const nullIndex = raw.indexOf('\u0000')
  return nullIndex >= 0 ? raw.slice(0, nullIndex) : raw
}

function formatHex(buffer: Buffer): string {
  return `0x${buffer.toString('hex')}`
}

function maybeReplaceAddress(value: string, addressTags?: Record<string, string>): string {
  if (!addressTags) {
    return value
  }
  const tag = addressTags[value.toLowerCase()]
  if (!tag) {
    return value
  }
  return `(${tag})`
}

function recordMessageType(context: DecodeContext, label: string) {
  if (!context.messageTypes.includes(label)) {
    context.messageTypes.push(label)
  }
}

function printMsgType(context: DecodeContext, msgTypeStr: string, write: boolean): CosmosMsgType {
  const known = MSG_TYPE_MAP[msgTypeStr]
  if (known) {
    recordMessageType(context, known.label)
    if (write) {
      context.output.push(`\n[${known.label}]`)
    }
    return known.type
  }

  recordMessageType(context, msgTypeStr || 'Unknown')
  if (write) {
    context.output.push(`\n[${msgTypeStr}]\n  `)
  }
  return 'unknown'
}

function decodeProtobuf(
  buffer: Buffer,
  proto: ProtoSpec,
  context: DecodeContext,
  write: boolean,
): void {
  let offset = 0
  let msgType: CosmosMsgType = 'none'

  while (offset < buffer.length) {
    const tagInfo = readVarint32(buffer, offset)
    if (!tagInfo) {
      throw new Error('unsupported')
    }
    offset += tagInfo.bytes

    const fieldNumber = tagInfo.value >>> 3
    const item = proto.items.find(candidate => candidate.tag === fieldNumber)
    if (!item) {
      throw new Error('unsupported')
    }

    const shouldWrite = write && !item.neverPrint
    if (shouldWrite && item.prefix) {
      context.output.push(item.prefix)
    }

    switch (item.decodeType) {
      case 'unsupported':
        throw new Error('unsupported')

      case 'u32': {
        const valueInfo = readVarint32(buffer, offset)
        if (!valueInfo) {
          throw new Error('unsupported')
        }
        offset += valueInfo.bytes
        if (shouldWrite) {
          context.output.push(valueInfo.value.toString(10))
        }
        break
      }

      case 'u64': {
        const valueInfo = readVarint64(buffer, offset)
        if (!valueInfo) {
          throw new Error('unsupported')
        }
        offset += valueInfo.bytes
        if (shouldWrite) {
          context.output.push(valueInfo.value.toString(10))
        }
        break
      }

      case 'bytes':
      case 'string':
      case 'address':
      case 'maybeString': {
        const lengthInfo = readVarint32(buffer, offset)
        if (!lengthInfo) {
          throw new Error('unsupported')
        }
        offset += lengthInfo.bytes
        const length = lengthInfo.value
        if (length > buffer.length - offset) {
          throw new Error('unsupported')
        }
        const field = buffer.slice(offset, offset + length)
        if (shouldWrite) {
          const isMaybeString = item.decodeType === 'maybeString'
          const isString =
            item.decodeType === 'string' ||
            item.decodeType === 'address' ||
            (isMaybeString && isPrintableAsciiBuffer(field))

          if (isString) {
            const text = bufferToAscii(field)
            const value =
              item.decodeType === 'address' ? maybeReplaceAddress(text, context.addressTags) : text
            context.output.push(value)
          } else {
            context.output.push(formatHex(field))
          }
        }
        offset += length
        break
      }

      case 'msgType': {
        const lengthInfo = readVarint32(buffer, offset)
        if (!lengthInfo) {
          throw new Error('unsupported')
        }
        offset += lengthInfo.bytes
        const length = lengthInfo.value
        if (length > buffer.length - offset) {
          throw new Error('unsupported')
        }
        const msgTypeStr = bufferToAscii(buffer.slice(offset, offset + length))
        msgType = printMsgType(context, msgTypeStr, shouldWrite)
        offset += length
        break
      }

      case 'nested': {
        const lengthInfo = readVarint32(buffer, offset)
        if (!lengthInfo) {
          throw new Error('unsupported')
        }
        offset += lengthInfo.bytes
        const length = lengthInfo.value
        if (length > buffer.length - offset) {
          throw new Error('unsupported')
        }
        if (item.nested) {
          decodeProtobuf(buffer.slice(offset, offset + length), item.nested, context, shouldWrite)
        }
        offset += length
        break
      }

      case 'msgData': {
        const lengthInfo = readVarint32(buffer, offset)
        if (!lengthInfo) {
          throw new Error('unsupported')
        }
        offset += lengthInfo.bytes
        const length = lengthInfo.value
        if (length > buffer.length - offset) {
          throw new Error('unsupported')
        }
        const msgPayload = buffer.slice(offset, offset + length)

        if (msgType === 'unknown') {
          if (shouldWrite) {
            const hash = createHash('sha256').update(msgPayload).digest('hex')
            context.output.push('\n  [Msg Hash] ')
            context.output.push(`0x${hash}`)
          }
          offset += length
          break
        }

        if (msgType === 'none') {
          throw new Error('unsupported')
        }

        const messageSpec =
          Object.values(MSG_TYPE_MAP).find(entry => entry.type === msgType)?.proto ?? null

        if (!messageSpec) {
          throw new Error('unsupported')
        }

        decodeProtobuf(msgPayload, messageSpec, context, shouldWrite)
        offset += length
        break
      }

      default:
        throw new Error('unsupported')
    }
  }
}

export function decodeCosmosSignDoc(
  data: Buffer,
  options?: { addressTags?: Record<string, string> },
): CosmosDecodedDetails | null {
  const tryJsonFallback = (): CosmosDecodedDetails | null => {
    if (!isPrintableAsciiBuffer(data)) {
      return null
    }
    const ascii = bufferToAscii(data).trim()
    if (!ascii) {
      return null
    }
    return formatCosmosJson(ascii, options?.addressTags)
  }

  const context: DecodeContext = {
    output: [],
    messageTypes: [],
    addressTags: options?.addressTags,
  }

  try {
    decodeProtobuf(data, cosmosBufA, context, true)
    decodeProtobuf(data, cosmosBufB, context, true)
    // eslint-disable-next-line unused-imports/no-unused-vars, @typescript-eslint/no-unused-vars
  } catch (_error) {
    return tryJsonFallback()
  }

  const details = context.output.join('').trim()
  if (!details) {
    return tryJsonFallback()
  }

  return {
    details,
    messageTypes: context.messageTypes,
  }
}

function formatCosmosJson(
  ascii: string,
  addressTags?: Record<string, string>,
): CosmosDecodedDetails {
  const messageTypes: string[] = []
  let doc: any = null
  try {
    doc = JSON.parse(ascii)
  } catch {
    return { details: ascii, messageTypes }
  }

  const output: string[] = []

  const chainId = doc?.chain_id ?? doc?.chainId
  if (chainId) {
    output.push(`\n\n[Chain] ${chainId}`)
  }

  if (doc?.fee) {
    output.push('\n[Fee]')
    const feeAmount = doc.fee.amount
    appendCoins(output, feeAmount)
    const gas = doc.fee.gas ?? doc.fee.gas_limit
    if (gas) {
      output.push(`\n  [Gas Limit] ${gas}`)
    }
  }

  if (doc?.memo) {
    output.push(`\n\n[Memo] ${doc.memo}`)
  }

  const msgs = Array.isArray(doc?.msgs)
    ? doc.msgs
    : Array.isArray(doc?.messages)
      ? doc.messages
      : []
  for (const msg of msgs) {
    const typeName = typeof msg?.type === 'string' ? msg.type : ''
    const value = msg?.value ?? msg
    const mapped = JSON_MSG_TYPE_MAP[typeName]
    if (mapped) {
      recordMessageType({ output, messageTypes }, mapped.label)
      output.push(`\n[${mapped.label}]`)
      appendMessageDetails(output, mapped.type, value, addressTags)
      continue
    }
    if (typeName) {
      recordMessageType({ output, messageTypes }, typeName)
      output.push(`\n[${typeName}]`)
    }
  }

  const details = output.join('').trim() || ascii
  return {
    details,
    messageTypes,
  }
}

function appendMessageDetails(
  output: string[],
  messageType: CosmosMsgType,
  value: any,
  addressTags?: Record<string, string>,
) {
  if (!value) {
    return
  }

  if (messageType === 'send') {
    appendAddress(output, '\n  [From] ', value.from_address, addressTags)
    appendAddress(output, '\n  [To] ', value.to_address, addressTags)
    appendCoins(output, value.amount)
    return
  }

  if (messageType === 'multiSend') {
    if (Array.isArray(value.inputs)) {
      for (const input of value.inputs) {
        output.push('\n[Input]')
        appendAddress(output, '\n  [From] ', input?.address, addressTags)
        appendCoins(output, input?.coins ?? input?.amount)
      }
    }
    if (Array.isArray(value.outputs)) {
      for (const out of value.outputs) {
        output.push('\n[Output]')
        appendAddress(output, '\n  [To] ', out?.address, addressTags)
        appendCoins(output, out?.coins ?? out?.amount)
      }
    }
    return
  }

  if (messageType === 'delegate' || messageType === 'undelegate') {
    appendAddress(output, '\n  [Delegator] ', value.delegator_address, addressTags)
    appendAddress(output, '\n  [Validator] ', value.validator_address, addressTags)
    appendCoins(output, value.amount)
    return
  }

  if (messageType === 'redelegate') {
    appendAddress(output, '\n  [Delegator] ', value.delegator_address, addressTags)
    appendAddress(output, '\n  [Src Validator] ', value.validator_src_address, addressTags)
    appendAddress(output, '\n  [Dst Validator] ', value.validator_dst_address, addressTags)
    appendCoins(output, value.amount)
    return
  }

  if (messageType === 'ibcTransfer') {
    appendString(output, '\n  [Port] ', value.source_port)
    appendString(output, '\n  [Channel] ', value.source_channel)
    appendCoins(output, value.token)
    appendAddress(output, '\n  [From] ', value.sender, addressTags)
    appendAddress(output, '\n  [To] ', value.receiver, addressTags)
    appendString(output, '\n  [Timeout (ns)] ', value.timeout_timestamp)
    appendString(output, '\n  [Msg Memo] ', value.memo)
    return
  }

  if (messageType === 'executeContract') {
    appendAddress(output, '\n  [Sender] ', value.sender, addressTags)
    appendAddress(output, '\n  [Contract] ', value.contract, addressTags)
    if (value.msg !== undefined) {
      const msgValue = typeof value.msg === 'string' ? value.msg : JSON.stringify(value.msg)
      output.push(`\n  [Data]\n    ${msgValue}`)
    }
    appendCoins(output, value.funds)
  }
}

function appendCoins(output: string[], coins: any) {
  if (!coins) {
    return
  }
  const list = Array.isArray(coins) ? coins : [coins]
  for (const coin of list) {
    if (!coin) {
      continue
    }
    const denom = coin.denom ?? coin.denomination
    const amount = coin.amount ?? coin.value
    if (denom !== undefined) {
      output.push(`\n  [Denom] ${denom}`)
    }
    if (amount !== undefined) {
      output.push(`\n  [Amount] ${amount}`)
    }
  }
}

function appendAddress(
  output: string[],
  prefix: string,
  value: any,
  addressTags?: Record<string, string>,
) {
  if (!value) {
    return
  }
  const address = String(value)
  output.push(prefix)
  output.push(maybeReplaceAddress(address, addressTags))
}

function appendString(output: string[], prefix: string, value: any) {
  if (value === undefined || value === null) {
    return
  }
  output.push(prefix)
  output.push(String(value))
}
