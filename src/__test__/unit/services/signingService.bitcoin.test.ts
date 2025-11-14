import { createHash } from 'crypto'
import { describe, it, expect } from 'vitest'
import { SigningService } from '@/services/signingService'
import { EXTERNAL, HARDENED_OFFSET, SIGNING_SCHEMA } from '@/shared/constants'
import { parseBitcoinSignPayload } from '@/shared/bitcoin'
import { formatDerivationPath, deriveHDKey } from '@/shared/utils/hdWallet'
import type { BitcoinWalletAccount } from '@/shared/types/wallet'
import type { SigningRequest } from '@/services/signingService'
import { getWalletConfig } from '@/shared/walletConfig'
import * as bitcoin from 'bitcoinjs-lib'
import { ec as EC } from 'elliptic'

type TestScriptType = 'p2pkh' | 'p2sh-p2wpkh' | 'p2wpkh'

interface ScriptConfig {
  changeFormat: number
  recipientVersion: number
  scriptTypeByte: number
  purpose: number
  accountAddressType: BitcoinWalletAccount['addressType']
}

const BITCOIN_SCRIPT_CONFIG: Record<TestScriptType, ScriptConfig> = {
  p2pkh: {
    changeFormat: 0x00,
    recipientVersion: 0x00,
    scriptTypeByte: 0x01,
    purpose: HARDENED_OFFSET + 44,
    accountAddressType: 'legacy',
  },
  'p2sh-p2wpkh': {
    changeFormat: 0x05,
    recipientVersion: 0x05,
    scriptTypeByte: 0x03,
    purpose: HARDENED_OFFSET + 49,
    accountAddressType: 'wrapped-segwit',
  },
  p2wpkh: {
    changeFormat: 0xd0,
    recipientVersion: 0xd0,
    scriptTypeByte: 0x04,
    purpose: HARDENED_OFFSET + 84,
    accountAddressType: 'segwit',
  },
}

const stripLeadingZero = (value: Buffer): Buffer => {
  let offset = 0
  while (offset < value.length - 1 && value[offset] === 0x00) {
    offset += 1
  }
  return value.slice(offset)
}

const decodeDerSignature = (der: Buffer): { r: string; s: string } => {
  if (!Buffer.isBuffer(der) || der.length < 8) {
    throw new Error('Invalid DER signature buffer')
  }

  let offset = 0
  if (der[offset++] !== 0x30) {
    throw new Error('Invalid DER signature header')
  }

  const totalLength = der[offset++]
  if (totalLength !== der.length - 2) {
    throw new Error('DER signature length mismatch')
  }

  if (der[offset++] !== 0x02) {
    throw new Error('Invalid DER integer header for r')
  }
  const rLength = der[offset++]
  const r = stripLeadingZero(der.slice(offset, offset + rLength))
  offset += rLength

  if (der[offset++] !== 0x02) {
    throw new Error('Invalid DER integer header for s')
  }
  const sLength = der[offset++]
  const s = stripLeadingZero(der.slice(offset, offset + sLength))

  return {
    r: r.length ? r.toString('hex') : '0',
    s: s.length ? s.toString('hex') : '0',
  }
}

const buildUInt32LE = (value: number) => {
  const buf = Buffer.alloc(4)
  buf.writeUInt32LE(value, 0)
  return buf
}

const buildUInt64LE = (value: bigint) => {
  const buf = Buffer.alloc(8)
  const low = Number(value & BigInt(0xffffffff))
  const high = Number((value >> BigInt(32)) & BigInt(0xffffffff))
  buf.writeUInt32LE(low, 0)
  buf.writeUInt32LE(high, 4)
  return buf
}

interface PayloadResult {
  payload: Buffer
  signerPath: number[]
  parsed: ReturnType<typeof parseBitcoinSignPayload>
  scriptType: TestScriptType
}

const buildBitcoinPayload = (scriptType: TestScriptType): PayloadResult => {
  const config = BITCOIN_SCRIPT_CONFIG[scriptType]

  const changePath = [config.purpose, HARDENED_OFFSET + 0, HARDENED_OFFSET + 0, 1, 0]
  const signerPath = [config.purpose, HARDENED_OFFSET + 0, HARDENED_OFFSET + 0, 0, 0]

  const fee = BigInt(1000)
  const inputValue = BigInt(210000)
  const sendValue = BigInt(200000)
  const changeValue = inputValue - sendValue - fee

  const txHash = Buffer.from('aa'.repeat(32), 'hex')
  const recipientHash = Buffer.from('bb'.repeat(20), 'hex')

  const segments: Buffer[] = []

  segments.push(Buffer.from([config.changeFormat]))
  segments.push(buildUInt32LE(changePath.length))
  changePath.forEach(index => segments.push(buildUInt32LE(index)))

  segments.push(buildUInt32LE(Number(fee)))
  segments.push(Buffer.from([config.recipientVersion]))
  segments.push(recipientHash)
  segments.push(buildUInt64LE(sendValue))

  segments.push(Buffer.from([1])) // number of inputs
  segments.push(buildUInt32LE(signerPath.length))
  signerPath.forEach(index => segments.push(buildUInt32LE(index)))
  segments.push(buildUInt32LE(0)) // prevout index
  segments.push(buildUInt64LE(inputValue))
  segments.push(Buffer.from([config.scriptTypeByte]))
  segments.push(txHash)

  const payload = Buffer.concat(segments)
  const parsed = parseBitcoinSignPayload(payload)

  // Ensure change value calculation aligns with expectations
  expect(parsed.change.value).toBe(changeValue)

  return {
    payload,
    signerPath,
    parsed,
    scriptType,
  }
}

const createWalletAccount = (
  signerPath: number[],
  scriptType: TestScriptType,
): BitcoinWalletAccount => {
  const config = BITCOIN_SCRIPT_CONFIG[scriptType]
  return {
    id: `btc-${scriptType}`,
    accountIndex: 0,
    derivationPath: signerPath,
    derivationPathString: formatDerivationPath(signerPath),
    type: 'external',
    coinType: 'BTC',
    isActive: true,
    name: `Test BTC ${scriptType} account`,
    createdAt: Date.now(),
    address: '',
    publicKey: '',
    addressType: config.accountAddressType,
  }
}

const createSigningRequest = (
  payload: Buffer,
  signerPath: number[],
  parsed: ReturnType<typeof parseBitcoinSignPayload>,
): SigningRequest => ({
  path: signerPath,
  data: payload,
  curve: EXTERNAL.SIGNING.CURVES.SECP256K1,
  encoding: EXTERNAL.SIGNING.ENCODINGS.NONE,
  hashType: EXTERNAL.SIGNING.HASHES.NONE,
  schema: 0,
  isTransaction: true,
  rawPayload: payload,
  bitcoin: parsed,
})

const verifyBitcoinSignature = async (
  scriptType: TestScriptType,
  parsed: ReturnType<typeof parseBitcoinSignPayload>,
  signatureEntry: { signature: Buffer; publicKey: Buffer },
) => {
  const network = bitcoin.networks.bitcoin
  const curve = new EC('secp256k1')
  const walletConfig = await getWalletConfig()
  const tx = new bitcoin.Transaction()
  tx.version = 2

  parsed.inputs.forEach(input => {
    tx.addInput(Buffer.from(input.txHash).reverse(), input.index)
  })

  // Recipient output
  const recipientPayment =
    scriptType === 'p2pkh'
      ? bitcoin.payments.p2pkh({ hash: parsed.recipient.pubkeyHash, network })
      : scriptType === 'p2sh-p2wpkh'
        ? bitcoin.payments.p2sh({ hash: parsed.recipient.pubkeyHash, network })
        : bitcoin.payments.p2wpkh({ hash: parsed.recipient.pubkeyHash, network })

  if (!recipientPayment.output) {
    throw new Error('Failed to build recipient output script')
  }
  tx.addOutput(recipientPayment.output, Number(parsed.recipient.value))

  // Change output
  if (parsed.change.value > BigInt(0)) {
    const changeKey = deriveHDKey(walletConfig.seed, parsed.change.path)
    if (!changeKey.privateKey) {
      throw new Error('Failed to derive change key')
    }
    const changeKeyPair = curve.keyFromPrivate(Buffer.from(changeKey.privateKey))
    const changePubkey = Buffer.from(changeKeyPair.getPublic(true, 'hex'), 'hex')
    let changePayment: bitcoin.Payment
    if (parsed.change.addressType === 'p2pkh') {
      changePayment = bitcoin.payments.p2pkh({
        pubkey: changePubkey,
        network,
      })
    } else if (parsed.change.addressType === 'p2sh-p2wpkh') {
      const redeem = bitcoin.payments.p2wpkh({
        pubkey: changePubkey,
        network,
      })
      changePayment = bitcoin.payments.p2sh({
        redeem,
        network,
      })
    } else {
      changePayment = bitcoin.payments.p2wpkh({
        pubkey: changePubkey,
        network,
      })
    }
    if (!changePayment.output) {
      throw new Error('Failed to build change output script')
    }
    tx.addOutput(changePayment.output, Number(parsed.change.value))
  }

  const scriptForSignature = bitcoin.payments.p2pkh({
    pubkey: signatureEntry.publicKey,
    network,
  }).output

  if (!scriptForSignature) {
    throw new Error('Failed to build script for signature verification')
  }

  const digest =
    scriptType === 'p2pkh'
      ? tx.hashForSignature(0, scriptForSignature, bitcoin.Transaction.SIGHASH_ALL)
      : tx.hashForWitnessV0(
          0,
          scriptForSignature,
          Number(parsed.inputs[0].value),
          bitcoin.Transaction.SIGHASH_ALL,
        )

  const signingDerived = deriveHDKey(walletConfig.seed, parsed.inputs[0].signerPath)
  if (!signingDerived.privateKey) {
    throw new Error('Failed to derive signing key')
  }

  const signingKey = curve.keyFromPrivate(Buffer.from(signingDerived.privateKey))
  const expectedPublicKey = Buffer.from(signingKey.getPublic(true, 'hex'), 'hex')
  expect(signatureEntry.publicKey.equals(expectedPublicKey)).toBe(true)
  const decodedSignature = decodeDerSignature(signatureEntry.signature)
  const isValid = signingKey.verify(digest, decodedSignature)

  expect(isValid).toBe(true)
}

describe('SigningService - Bitcoin signing', () => {
  const signingService = new SigningService()

  ;(['p2pkh', 'p2sh-p2wpkh', 'p2wpkh'] as TestScriptType[]).forEach(scriptType => {
    it(`produces valid signatures for ${scriptType} inputs`, async () => {
      const { payload, signerPath, parsed } = buildBitcoinPayload(scriptType)
      const signingRequest = createSigningRequest(payload, signerPath, parsed)
      const walletAccount = createWalletAccount(signerPath, scriptType)

      const walletAccounts = new Map<string, BitcoinWalletAccount>()
      walletAccounts.set(walletAccount.id, walletAccount)

      const result = await signingService.signData(signingRequest, walletAccounts)

      expect(result.format).toBe('btc')
      expect(result.bitcoin).toBeDefined()
      expect(result.bitcoin?.signatures.length).toBe(1)

      const signatureEntry = result.bitcoin!.signatures[0]
      expect(signatureEntry.publicKey.length).toBe(33)
      expect(signatureEntry.sighashType).toBe(bitcoin.Transaction.SIGHASH_ALL)

      // Change address metadata should map correctly
      expect(result.bitcoin?.changeAddressType).toBe(
        scriptType === 'p2pkh' ? 'p2pkh' : scriptType === 'p2sh-p2wpkh' ? 'p2sh-p2wpkh' : 'p2wpkh',
      )

      await verifyBitcoinSignature(scriptType, parsed, signatureEntry)
    })
  })

  describe('message signing', () => {
    const messagePath = [HARDENED_OFFSET + 84, HARDENED_OFFSET + 0, HARDENED_OFFSET, 0, 0]

    it('signs SHA256 hashed messages using BTC paths', async () => {
      const walletAccount = createWalletAccount(messagePath, 'p2wpkh')
      const walletAccounts = new Map<string, BitcoinWalletAccount>([
        [walletAccount.id, walletAccount],
      ])
      const message = Buffer.from('GridPlus Bitcoin message signing test')

      const signingRequest: SigningRequest = {
        path: messagePath,
        data: message,
        curve: EXTERNAL.SIGNING.CURVES.SECP256K1,
        encoding: EXTERNAL.SIGNING.ENCODINGS.NONE,
        hashType: EXTERNAL.SIGNING.HASHES.SHA256,
        schema: SIGNING_SCHEMA.GENERAL_SIGNING,
        isTransaction: false,
      }

      const result = await signingService.signData(signingRequest, walletAccounts)
      expect(result.format).toBe('der')
      expect(result.bitcoin).toBeUndefined()
      expect(result.signature).toBeDefined()

      const signatureBuffer = Buffer.from(result.signature!)
      const decodedSignature = decodeDerSignature(signatureBuffer)

      const walletConfig = await getWalletConfig()
      const derived = deriveHDKey(walletConfig.seed, messagePath)
      expect(derived.privateKey).toBeDefined()

      const curve = new EC('secp256k1')
      const keyPair = curve.keyFromPrivate(Buffer.from(derived.privateKey!))
      const digest = createHash('sha256').update(message).digest()
      const isValid = keyPair.verify(digest, decodedSignature)

      expect(isValid).toBe(true)
      expect(result.metadata?.publicKey).toBeDefined()
      expect(result.metadata?.publicKeyCompressed).toBeDefined()
    })

    it('respects prehashed inputs for BTC message signing', async () => {
      const walletAccount = createWalletAccount(messagePath, 'p2wpkh')
      const walletAccounts = new Map<string, BitcoinWalletAccount>([
        [walletAccount.id, walletAccount],
      ])
      const digest = Buffer.from('11'.repeat(32), 'hex')

      const signingRequest: SigningRequest = {
        path: messagePath,
        data: digest,
        curve: EXTERNAL.SIGNING.CURVES.SECP256K1,
        encoding: EXTERNAL.SIGNING.ENCODINGS.NONE,
        hashType: EXTERNAL.SIGNING.HASHES.SHA256,
        schema: SIGNING_SCHEMA.GENERAL_SIGNING,
        isTransaction: false,
        isPrehashed: true,
      }

      const result = await signingService.signData(signingRequest, walletAccounts)
      expect(result.signature).toBeDefined()

      const signatureBuffer = Buffer.from(result.signature!)
      const decodedSignature = decodeDerSignature(signatureBuffer)

      const walletConfig = await getWalletConfig()
      const derived = deriveHDKey(walletConfig.seed, messagePath)
      const curve = new EC('secp256k1')
      const keyPair = curve.keyFromPrivate(Buffer.from(derived.privateKey!))
      const isValid = keyPair.verify(digest, decodedSignature)
      expect(isValid).toBe(true)
    })
  })
})
