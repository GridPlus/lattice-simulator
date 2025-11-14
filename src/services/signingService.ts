/**
 * Enhanced Signing Service for Lattice1 Device Simulator
 * Integrates with wallet services to provide real cryptographic signatures
 */

import { createHash } from 'crypto'
import {
  getPublicKey as blsGetPublicKey,
  sign as blsSign,
  utils as blsUtils,
} from '@noble/bls12-381'
import * as ed25519 from '@noble/ed25519'
import * as bitcoin from 'bitcoinjs-lib'
import * as cbor from 'cbor'
import { ec as EC } from 'elliptic'
import { Hash } from 'ox'
import * as tinySecp from 'tiny-secp256k1'
import { hashTypedData, type Hex } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import bdec from 'cbor-bigdecimal'
import { BITCOIN_NETWORKS } from './bitcoinWallet'
import {
  BITCOIN_VERSION_MAP,
  encodeChangePubkeyHash,
  parseBitcoinSignPayload,
  type ParsedBitcoinSignPayload,
} from '../shared/bitcoin'
import { EXTERNAL, HARDENED_OFFSET, SIGNING_SCHEMA } from '../shared/constants'
import { detectCoinTypeFromPath } from '../shared/utils'
import { resolveTinySecp } from '../shared/utils/ecc'
import {
  deriveHDKey,
  deriveEd25519Key,
  deriveBLS12381Key,
  formatDerivationPath,
} from '../shared/utils/hdWallet'
import { getWalletConfig } from '../shared/walletConfig'
import type { SignResponse } from '../shared/types/device'
import type {
  WalletAccount,
  EthereumWalletAccount,
  BitcoinWalletAccount,
  SolanaWalletAccount,
  WalletCoinType,
} from '../shared/types/wallet'

// Configure SHA-512 for @noble/ed25519 (required in v3.0+)
// The hashes.sha512 property needs to be set before using synchronous methods
if (!ed25519.hashes.sha512) {
  ed25519.hashes.sha512 = (message: Uint8Array) => {
    return new Uint8Array(createHash('sha512').update(message).digest())
  }
}

bdec(cbor)

let bitcoinLibInitialized = false
const ecc = resolveTinySecp(tinySecp)

const ensureBitcoinLib = () => {
  if (!bitcoinLibInitialized) {
    bitcoin.initEccLib(ecc as any)
    bitcoinLibInitialized = true
  }
}

/**
 * Signature result with metadata
 */
export interface SignatureResult {
  /** The signature bytes */
  signature?: Buffer
  /** Recovery ID for ECDSA signatures (Ethereum) */
  recovery?: number
  /** Full recovery identifier (includes parity & compression bits) */
  recoveryId?: number
  /** Signature format */
  format: 'der' | 'raw' | 'compact' | 'btc'
  /** Additional signature data */
  metadata?: {
    /** Ethereum address that signed (for ETH) */
    signer?: string
    /** Transaction hash (for transactions) */
    txHash?: string
    /** Public key used for signing */
    publicKey?: string
    /** Compressed public key representation */
    publicKeyCompressed?: string
  }
  /** Bitcoin-specific signing data */
  bitcoin?: SignResponse['bitcoin']
}

const isBuffer = (data: Buffer | Uint8Array | string): data is Buffer => Buffer.isBuffer(data)

const toBuffer = (value: Buffer | Uint8Array | string): Buffer => {
  if (isBuffer(value)) return value
  if (typeof value === 'string') {
    const hex = value.startsWith('0x') ? value.slice(2) : value
    return Buffer.from(hex, 'hex')
  }
  return Buffer.from(value)
}

/**
 * Signing request parameters
 */
export interface SigningRequest {
  /** HD derivation path for the signing key */
  path: number[]
  /** Data to sign */
  data: Buffer
  /** Signature curve (secp256k1, ed25519, etc.) */
  curve?: number
  /** Signature encoding format */
  encoding?: number
  /** Hash type for signing */
  hashType?: number
  /** Schema type (for transaction vs message signing) */
  schema?: number
  /** Whether this is a transaction or message */
  isTransaction?: boolean
  /** Original payload buffer */
  rawPayload?: Buffer
  /** Message protocol for ETH_MSG requests */
  protocol?: 'signPersonal' | 'eip712'
  /** Total length of the original message */
  messageLength?: number
  /** Indicates the payload was prehashed by the client */
  isPrehashed?: boolean
  /** Parsed Bitcoin transaction data */
  bitcoin?: ParsedBitcoinSignPayload
}

/**
 * Enhanced Signing Service
 *
 * Provides real cryptographic signing capabilities by integrating with
 * the simulator's wallet services. Supports ETH, BTC, and SOL signing
 * with proper key derivation and signature formats.
 */
export class SigningService {
  private secp256k1: EC

  constructor() {
    this.secp256k1 = new EC('secp256k1')
  }

  /**
   * Signs data using the appropriate wallet and cryptographic method
   *
   * @param request - Signing request parameters
   * @param walletAccounts - Available wallet accounts
   * @returns Promise resolving to signature result
   */
  async signData(
    request: SigningRequest,
    walletAccounts: Map<string, WalletAccount>,
  ): Promise<SignatureResult> {
    // ALWAYS log curve value to debug Ed25519 issue
    console.log('[SigningService] signData curve check:', {
      curve: request.curve,
      curveType: typeof request.curve,
      ED25519_CONST: EXTERNAL.SIGNING.CURVES.ED25519,
      SECP256K1_CONST: EXTERNAL.SIGNING.CURVES.SECP256K1,
      curveMatchEd25519: request.curve === EXTERNAL.SIGNING.CURVES.ED25519,
      curveMatchSecp: request.curve === EXTERNAL.SIGNING.CURVES.SECP256K1,
    })

    if (process.env.DEBUG_SIGNING === '1') {
      const debugInfo = {
        curve: request.curve,
        curveType: typeof request.curve,
        path: request.path,
        encoding: request.encoding,
        hashType: request.hashType,
        ED25519_CONST: EXTERNAL.SIGNING.CURVES.ED25519,
        BLS_CONST: EXTERNAL.SIGNING.CURVES.BLS12_381_G2,
        curveMatch: request.curve === EXTERNAL.SIGNING.CURVES.ED25519,
      }
      console.log('[SigningService] signData request', debugInfo)
      try {
      } catch {
        // ignore
      }
    }
    // Check if this is a BLS signing request
    if (request.curve === EXTERNAL.SIGNING.CURVES.BLS12_381_G2) {
      return this.signBLS12381(request)
    }

    // Handle Ed25519 signing regardless of coin type detection
    if (request.curve === EXTERNAL.SIGNING.CURVES.ED25519) {
      console.log('[SigningService] Routing to Ed25519 handler')
      return this.signEd25519(request)
    }

    console.log('[SigningService] NOT routing to Ed25519, continuing to coin-based logic')

    // Detect coin type from derivation path
    let coinType = detectCoinTypeFromPath(request.path)
    if (coinType === 'UNKNOWN' && request.encoding === EXTERNAL.SIGNING.ENCODINGS.EVM) {
      coinType = 'ETH'
    }

    if (coinType === 'UNKNOWN') {
      throw new Error('Unsupported coin type for signing request')
    }

    let walletAccount = this.findWalletAccount(request.path, coinType, walletAccounts)
    if (!walletAccount) {
      const accountIndex =
        request.path && request.path.length >= 3
          ? Math.max(request.path[2] - HARDENED_OFFSET, 0)
          : walletAccounts.size
      const baseAccount = {
        id: `auto-${coinType}-${(request.path || []).join('-') || 'root'}`,
        accountIndex,
        derivationPath: request.path ? [...request.path] : [],
        derivationPathString: request.path ? formatDerivationPath(request.path) : 'm',
        type: 'external' as const,
        coinType,
        isActive: false,
        name: `Auto ${coinType} account`,
        createdAt: Date.now(),
      }

      if (coinType === 'ETH') {
        walletAccount = {
          ...baseAccount,
          coinType: 'ETH',
          address: '',
          publicKey: '',
        } as EthereumWalletAccount
      } else if (coinType === 'BTC') {
        walletAccount = {
          ...baseAccount,
          coinType: 'BTC',
          address: '',
          publicKey: '',
          addressType: 'legacy',
        } as BitcoinWalletAccount
      } else if (coinType === 'SOL') {
        walletAccount = {
          ...baseAccount,
          coinType: 'SOL',
          address: '',
          publicKey: '',
        } as SolanaWalletAccount
      }
    }

    if (!walletAccount) {
      throw new Error(`No wallet account available for coin type: ${coinType}`)
    }

    // Set default path for request if not provided, but don't update wallet's path yet
    // (The specific signing function will update it after deriving new keys if needed)
    if (!request.path || request.path.length === 0) {
      const defaultEthPath = [HARDENED_OFFSET + 44, HARDENED_OFFSET + 60, HARDENED_OFFSET, 0, 0]
      request.path =
        walletAccount.derivationPath && walletAccount.derivationPath.length > 0
          ? [...walletAccount.derivationPath]
          : [...defaultEthPath]
    }

    console.log('[SigningService] Using wallet account for signing:', {
      id: walletAccount.id,
      coinType,
      derivationPath: walletAccount.derivationPath,
      privateKey: walletAccount.privateKey,
    })

    console.log('[SigningService] Request payload info:', {
      dataLength: request.data.length,
      rawPayloadLength: request.rawPayload ? request.rawPayload.length : undefined,
      hashType: request.hashType,
      encoding: request.encoding,
    })

    console.log('[SigningService] Request keys:', Object.keys(request))

    // Sign based on coin type
    switch (coinType) {
      case 'ETH':
        return this.signEthereum(request, walletAccount as EthereumWalletAccount)

      case 'BTC':
        return this.signBitcoin(request, walletAccount as BitcoinWalletAccount)

      case 'SOL':
        return this.signSolana(request, walletAccount as SolanaWalletAccount)

      default:
        throw new Error(`Unsupported coin type: ${coinType}`)
    }
  }

  /**
   * Signs data using Ethereum wallet (secp256k1)
   */
  private async signEthereum(
    request: SigningRequest,
    wallet: EthereumWalletAccount,
  ): Promise<SignatureResult> {
    const defaultEthPath = [HARDENED_OFFSET + 44, HARDENED_OFFSET + 60, HARDENED_OFFSET, 0, 0]

    const derivationPath =
      request.path && request.path.length > 0
        ? request.path
        : wallet.derivationPath && wallet.derivationPath.length > 0
          ? wallet.derivationPath
          : defaultEthPath

    const config = await getWalletConfig()
    const derivedKey = deriveHDKey(config.seed, derivationPath)

    if (!derivedKey.privateKey) {
      throw new Error('Failed to derive Ethereum private key from mnemonic')
    }

    const derivedPrivateKeyHex = `0x${Buffer.from(derivedKey.privateKey).toString('hex')}`
    wallet.privateKey = derivedPrivateKeyHex

    const privateKeyBuffer = Buffer.from((wallet.privateKey as string).slice(2), 'hex')
    const keyPair = this.secp256k1.keyFromPrivate(privateKeyBuffer)
    const publicKeyUncompressed = keyPair.getPublic(false, 'hex')
    const publicKeyCompressed = keyPair.getPublic(true, 'hex')

    wallet.publicKey = publicKeyUncompressed

    const derivedAccount = privateKeyToAccount(derivedPrivateKeyHex as Hex)
    wallet.address = derivedAccount.address
    // Use viem for Ethereum signing to match SDK behavior

    if (process.env.DEBUG_SIGNING === '1') {
      console.log('[SigningService] Derived Ethereum signing material', {
        path: derivationPath,
        privateKey: derivedPrivateKeyHex,
        address: wallet.address,
        publicKeyUncompressed,
        publicKeyCompressed,
        isPrehashed: request.isPrehashed ?? false,
        messageLength: request.messageLength ?? request.data.length,
        payloadLength: request.data.length,
      })
    }

    console.log('[SigningService] Active Ethereum account:', {
      address: wallet.address,
      derivationPath,
    })

    // For Ethereum, we need to handle different signature types
    // Check if this is message signing (schema 3 = ETH_MSG)
    if (request.schema === SIGNING_SCHEMA.ETH_MSG) {
      const protocol = request.protocol ?? 'signPersonal'

      if (protocol === 'signPersonal') {
        const messageBuffer = Buffer.from(request.data)
        if (messageBuffer.length === 0) {
          throw new Error('Invalid Request: message payload cannot be empty')
        }
        const messageHash = request.isPrehashed
          ? messageBuffer
          : this.isPrefixedPersonalMessage(messageBuffer)
            ? this.keccakBuffer(messageBuffer)
            : this.hashMessage(messageBuffer)
        const signature = this.secp256k1Sign(messageHash, privateKeyBuffer)

        const derSignature = this.formatDERSignature(signature.r, signature.s)

        if (process.env.DEBUG_SIGNING === '1') {
          const keyPair = this.secp256k1.keyFromPrivate(privateKeyBuffer)
          const isValid = keyPair.verify(messageHash, {
            r: signature.r,
            s: signature.s,
          })
          if (!isValid) {
            console.error('[SigningService] Signature verification failed (personal_sign)', {
              path: derivationPath,
              privateKey: derivedPrivateKeyHex,
              messageHash: messageHash.toString('hex'),
              r: signature.r.toString('hex'),
              s: signature.s.toString('hex'),
            })
          }
        }

        console.log('[SigningService] ETH personal_sign components:', {
          hash: messageHash.toString('hex'),
          r: signature.r.toString('hex'),
          s: signature.s.toString('hex'),
          recovery: signature.recovery,
          recoveryId: signature.recoveryId,
          prehashed: request.isPrehashed,
        })

        return {
          signature: derSignature,
          recovery: signature.recovery,
          recoveryId: signature.recoveryId,
          format: 'der',
          metadata: {
            signer: wallet.address,
            publicKey: publicKeyUncompressed,
            publicKeyCompressed,
          },
        }
      }

      if (protocol === 'eip712') {
        const typedDataBuffer = Buffer.from(request.data)
        let digest: Buffer

        if (request.isPrehashed) {
          if (typedDataBuffer.length < 32) {
            throw new Error(
              `Invalid prehashed EIP-712 payload: expected at least 32 bytes, received ${typedDataBuffer.length}`,
            )
          }
          if (typedDataBuffer.length > 32) {
            console.warn('[SigningService] Truncating prehashed EIP-712 payload to 32 bytes', {
              originalLength: typedDataBuffer.length,
            })
          }
          digest = Buffer.from(typedDataBuffer.subarray(0, 32))
        } else {
          digest = this.hashEip712Payload(typedDataBuffer)
        }
        console.log('[SigningService] EIP-712 branch', {
          isPrehashed: request.isPrehashed ?? false,
          payloadLength: typedDataBuffer.length,
          digestLength: digest.length,
          digest: digest.toString('hex'),
        })
        if (process.env.DEBUG_SIGNING === '1') {
          console.log('[SigningService] EIP-712 digest:', digest.toString('hex'))
        }

        const signature = this.secp256k1Sign(digest, privateKeyBuffer)
        const derSignature = this.formatDERSignature(signature.r, signature.s)

        console.log('[SigningService] EIP-712 signing input', {
          prehashed: request.isPrehashed,
          payloadLength: typedDataBuffer.length,
          digest: digest.toString('hex'),
        })

        console.log('[SigningService] EIP-712 signature components:', {
          hash: digest.toString('hex'),
          r: signature.r.toString('hex'),
          s: signature.s.toString('hex'),
          recovery: signature.recovery,
          recoveryId: signature.recoveryId,
          prehashed: request.isPrehashed,
        })

        if (process.env.DEBUG_SIGNING === '1') {
          const keyPair = this.secp256k1.keyFromPrivate(privateKeyBuffer)
          const isValid = keyPair.verify(digest, {
            r: signature.r,
            s: signature.s,
          })
          if (!isValid) {
            console.error('[SigningService] Signature verification failed (eip712)', {
              path: derivationPath,
              privateKey: derivedPrivateKeyHex,
              digest: digest.toString('hex'),
              r: signature.r.toString('hex'),
              s: signature.s.toString('hex'),
            })
          }
        }

        return {
          signature: derSignature,
          recovery: signature.recovery,
          recoveryId: signature.recoveryId,
          format: 'der',
          metadata: {
            signer: wallet.address,
            publicKey: publicKeyUncompressed,
            publicKeyCompressed,
          },
        }
      }

      throw new Error(`Unsupported Ethereum message protocol: ${protocol}`)
    } else {
      // Transaction signing
      let signingDigest: Buffer
      let signablePayload: Buffer | null = null

      if (request.hashType === EXTERNAL.SIGNING.HASHES.NONE) {
        signingDigest = toBuffer(request.data)
      } else if (
        request.encoding === EXTERNAL.SIGNING.ENCODINGS.EVM ||
        request.encoding === EXTERNAL.SIGNING.ENCODINGS.EIP7702_AUTH ||
        request.encoding === EXTERNAL.SIGNING.ENCODINGS.EIP7702_AUTH_LIST
      ) {
        // For EVM and EIP-7702 encodings, the SDK sends the full serialized transaction
        // including empty signature placeholders. We sign the hash of the full transaction.
        const txData = toBuffer(request.data)

        // Detect if this is a prehashed transaction (SDK prehashes large transactions)
        // Prehashed transactions have: first 32 bytes are the hash, rest are zeros
        let isPrehashed = false
        if (txData.length >= 32) {
          const first32 = txData.slice(0, 32)
          const rest = txData.slice(32)
          // Check if rest is all zeros
          const allZeros = rest.every(byte => byte === 0)
          if (allZeros && first32.some(byte => byte !== 0)) {
            isPrehashed = true
            console.log('[SigningService] Detected prehashed transaction')
          }
        }

        if (isPrehashed) {
          // Data is already hashed - use it directly as the signing digest
          signingDigest = txData.slice(0, 32)
          signablePayload = txData
          console.log('[SigningService] Using prehashed transaction data directly')
        } else {
          // Normal transaction - hash it
          const txHashBuf = Buffer.from(Hash.keccak256(txData))
          signingDigest = txHashBuf
          signablePayload = txData
        }
      } else {
        if (request.isPrehashed) {
          // Data is already hashed by the SDK - use it directly
          console.log('[SigningService] Prehashed data length:', request.data.length, 'bytes')
          console.log(
            '[SigningService] Prehashed data (first 64 chars):',
            request.data.toString('hex').slice(0, 64),
          )
          console.log(
            '[SigningService] Prehashed hashType:',
            request.hashType,
            '(1=SHA256, 2=KECCAK256)',
          )
          signingDigest = Buffer.from(request.data).slice(0, 32)
        } else {
          // Use the appropriate hash function based on hashType
          let txHashBuf: Buffer | null = null
          if (request.hashType === EXTERNAL.SIGNING.HASHES.SHA256) {
            const hash = createHash('sha256').update(request.data).digest()
            txHashBuf = Buffer.from(hash)
          } else {
            // Default to keccak256 for KECCAK256 and other hash types
            const dataBuffer = Buffer.isBuffer(request.data)
              ? request.data
              : Buffer.from(request.data)
            txHashBuf = Buffer.from(Hash.keccak256(dataBuffer))
          }
          signingDigest = txHashBuf ?? Buffer.alloc(0)
        }
      }

      const signature = this.secp256k1Sign(signingDigest, privateKeyBuffer)

      console.log('[SigningService] Signature components:', {
        hash: signingDigest.toString('hex'),
        r: signature.r.toString('hex'),
        s: signature.s.toString('hex'),
        recovery: signature.recovery,
        recoveryId: signature.recoveryId,
      })

      if (process.env.DEBUG_SIGNING === '1') {
        const keyPair = this.secp256k1.keyFromPrivate(privateKeyBuffer)
        const isValid = keyPair.verify(signingDigest, {
          r: signature.r,
          s: signature.s,
        })
        if (!isValid) {
          console.error('[SigningService] Signature verification failed (transaction)', {
            path: request.path,
            privateKey: derivedPrivateKeyHex,
            digest: signingDigest.toString('hex'),
            r: signature.r.toString('hex'),
            s: signature.s.toString('hex'),
          })
        }
      }

      try {
        const recovered = this.secp256k1.recoverPubKey(
          signingDigest,
          { r: signature.r, s: signature.s },
          signature.recoveryId,
        )
        const candidateUncompressed = recovered.encode('hex', false)
        if (candidateUncompressed !== publicKeyUncompressed) {
          console.warn(
            '[SigningService] Recovered pubkey does not match derived pubkey; using derived key instead',
          )
        }
      } catch (err) {
        console.warn('[SigningService] Failed to recover pubkey from signature', err)
      }

      const txHashMetadata =
        request.hashType === EXTERNAL.SIGNING.HASHES.NONE
          ? undefined
          : signablePayload
            ? `0x${signablePayload.toString('hex')}`
            : `0x${signingDigest.toString('hex')}`

      return {
        signature: this.formatDERSignature(signature.r, signature.s),
        recovery: signature.recovery,
        recoveryId: signature.recoveryId,
        format: 'der',
        metadata: {
          signer: wallet.address,
          publicKey: publicKeyUncompressed,
          publicKeyCompressed: publicKeyCompressed,
          txHash: txHashMetadata,
        },
      }
    }
  }

  /**
   * Signs data using Bitcoin wallet (secp256k1)
   *
   * TODO: This is a simplified implementation that needs to be enhanced to:
   * 1. Parse the Bitcoin transaction payload to extract inputs, outputs, fees
   * 2. Compute correct sighashes for each input based on type (legacy/p2wpkh/p2sh-p2wpkh)
   * 3. Sign each input with the correct derived key from the input's signer path
   * 4. Return multiple signatures (one per input)
   *
   * Current limitation: Only signs with a single key, doesn't compute proper Bitcoin sighashes
   */
  private async signBitcoin(
    request: SigningRequest,
    wallet: BitcoinWalletAccount,
  ): Promise<SignatureResult> {
    ensureBitcoinLib()

    if (this.isBitcoinTransactionRequest(request)) {
      return this.signBitcoinTransaction(request, wallet)
    }

    return this.signBitcoinMessage(request, wallet)
  }

  private async signBitcoinTransaction(
    request: SigningRequest,
    wallet: BitcoinWalletAccount,
  ): Promise<SignatureResult> {
    const rawPayload = request.rawPayload ?? request.data
    let parsed: ParsedBitcoinSignPayload | undefined = request.bitcoin

    if (!parsed) {
      parsed = parseBitcoinSignPayload(rawPayload)
    }

    if (!parsed || parsed.inputs.length === 0) {
      throw new Error('Unable to parse Bitcoin transaction inputs from payload')
    }

    const config = await getWalletConfig()
    const networkKey = parsed.network
    const network = BITCOIN_NETWORKS[networkKey]

    const toSafeNumber = (value: bigint) => {
      if (value > BigInt(Number.MAX_SAFE_INTEGER)) {
        throw new Error('Bitcoin value exceeds safe JavaScript integer range')
      }
      return Number(value)
    }

    const tx = new bitcoin.Transaction()
    tx.version = 2

    const derivedKeyCache = new Map<
      string,
      { privateKey: Buffer; publicKeyCompressed: Buffer; publicKeyUncompressed: Buffer }
    >()

    const deriveKeyForPath = (path: number[]) => {
      const cacheKey = path.join('/')
      if (!derivedKeyCache.has(cacheKey)) {
        const derived = deriveHDKey(config.seed, path)
        if (!derived.privateKey || !derived.publicKey) {
          throw new Error(`Failed to derive Bitcoin key for path ${formatDerivationPath(path)}`)
        }
        const privateKey = Buffer.from(derived.privateKey)
        const keyPair = this.secp256k1.keyFromPrivate(privateKey)
        const publicKeyCompressed = Buffer.from(keyPair.getPublic(true, 'hex'), 'hex')
        const publicKeyUncompressed = Buffer.from(keyPair.getPublic(false, 'hex'), 'hex')
        derivedKeyCache.set(cacheKey, { privateKey, publicKeyCompressed, publicKeyUncompressed })
      }
      return derivedKeyCache.get(cacheKey)!
    }

    parsed.inputs.forEach(input => {
      const txHashLE = Buffer.from(input.txHash).reverse()
      tx.addInput(txHashLE, input.index)
    })

    const recipientVersionInfo = BITCOIN_VERSION_MAP[parsed.recipient.version]
    if (!recipientVersionInfo) {
      throw new Error(
        `Unsupported Bitcoin recipient version byte 0x${parsed.recipient.version.toString(16)}`,
      )
    }

    const recipientNetwork = BITCOIN_NETWORKS[recipientVersionInfo.network]
    let recipientPayment: bitcoin.Payment | undefined

    if (recipientVersionInfo.type === 'p2pkh') {
      recipientPayment = bitcoin.payments.p2pkh({
        hash: parsed.recipient.pubkeyHash,
        network: recipientNetwork,
      })
    } else if (recipientVersionInfo.type === 'p2sh-p2wpkh') {
      recipientPayment = bitcoin.payments.p2sh({
        hash: parsed.recipient.pubkeyHash,
        network: recipientNetwork,
      })
    } else {
      recipientPayment = bitcoin.payments.p2wpkh({
        hash: parsed.recipient.pubkeyHash,
        network: recipientNetwork,
      })
    }

    if (!recipientPayment.output) {
      throw new Error('Failed to construct recipient output script for Bitcoin transaction')
    }

    tx.addOutput(recipientPayment.output, toSafeNumber(parsed.recipient.value))

    let changePubkeyHash: Buffer | undefined
    if (parsed.change.value > BigInt(0)) {
      if (!parsed.change.path || parsed.change.path.length === 0) {
        throw new Error('Missing change path for Bitcoin transaction with change output')
      }
      const changeKey = deriveKeyForPath(parsed.change.path)

      let changePayment: bitcoin.Payment | undefined
      if (parsed.change.addressType === 'p2pkh') {
        changePayment = bitcoin.payments.p2pkh({
          pubkey: changeKey.publicKeyCompressed,
          network,
        })
      } else if (parsed.change.addressType === 'p2sh-p2wpkh') {
        const p2wpkh = bitcoin.payments.p2wpkh({
          pubkey: changeKey.publicKeyCompressed,
          network,
        })
        changePayment = bitcoin.payments.p2sh({
          redeem: p2wpkh,
          network,
        })
      } else {
        changePayment = bitcoin.payments.p2wpkh({
          pubkey: changeKey.publicKeyCompressed,
          network,
        })
      }

      if (!changePayment?.output) {
        throw new Error('Failed to construct change output script for Bitcoin transaction')
      }

      tx.addOutput(changePayment.output, toSafeNumber(parsed.change.value))
      changePubkeyHash = changePayment.hash
    }

    const bitcoinSignatures: NonNullable<SignResponse['bitcoin']>['signatures'] = []
    const sighashType = bitcoin.Transaction.SIGHASH_ALL

    parsed.inputs.forEach((input, index) => {
      const keyMaterial = deriveKeyForPath(input.signerPath)
      const scriptForSignature = bitcoin.payments.p2pkh({
        pubkey: keyMaterial.publicKeyCompressed,
        network,
      }).output

      if (!scriptForSignature) {
        throw new Error('Failed to construct script for Bitcoin input signature')
      }

      let digest: Buffer
      if (input.scriptType === 'p2pkh') {
        digest = tx.hashForSignature(index, scriptForSignature, sighashType)
      } else {
        digest = tx.hashForWitnessV0(index, scriptForSignature, Number(input.value), sighashType)
      }

      const signatureParts = this.secp256k1Sign(digest, keyMaterial.privateKey)
      const derSignature = this.formatDERSignature(signatureParts.r, signatureParts.s)

      bitcoinSignatures.push({
        inputIndex: index,
        signature: derSignature,
        publicKey: keyMaterial.publicKeyCompressed,
        sighashType,
        signerPath: [...input.signerPath],
      })
    })

    if (!wallet.publicKey && bitcoinSignatures.length > 0) {
      wallet.publicKey = bitcoinSignatures[0].publicKey.toString('hex')
    }

    return {
      format: 'btc',
      bitcoin: {
        changePubkeyHash: encodeChangePubkeyHash(changePubkeyHash),
        changeAddressType: parsed.change.addressType,
        network: parsed.network,
        signatures: bitcoinSignatures,
      },
    }
  }

  private async signBitcoinMessage(
    request: SigningRequest,
    wallet: BitcoinWalletAccount,
  ): Promise<SignatureResult> {
    const derivationPath =
      request.path && request.path.length > 0
        ? request.path
        : wallet.derivationPath && wallet.derivationPath.length > 0
          ? wallet.derivationPath
          : null

    if (!derivationPath) {
      throw new Error('Bitcoin message signing requires a derivation path')
    }

    const config = await getWalletConfig()
    const derived = deriveHDKey(config.seed, derivationPath)
    if (!derived.privateKey || !derived.publicKey) {
      throw new Error('Failed to derive Bitcoin private key')
    }

    const privateKey = Buffer.from(derived.privateKey)
    const keyPair = this.secp256k1.keyFromPrivate(privateKey)
    const publicKeyUncompressed = keyPair.getPublic(false, 'hex')
    const publicKeyCompressed = keyPair.getPublic(true, 'hex')

    const messageBuffer = Buffer.isBuffer(request.data) ? request.data : Buffer.from(request.data)
    const hashType = request.hashType ?? EXTERNAL.SIGNING.HASHES.SHA256
    const digest = this.computeSecp256k1Digest(messageBuffer, hashType, request.isPrehashed)

    const signature = this.secp256k1Sign(digest, privateKey)
    const derSignature = this.formatDERSignature(signature.r, signature.s)

    return {
      signature: derSignature,
      recovery: signature.recovery,
      recoveryId: signature.recoveryId,
      format: 'der',
      metadata: {
        publicKey: publicKeyUncompressed,
        publicKeyCompressed,
      },
    }
  }

  private isBitcoinTransactionRequest(request: SigningRequest): boolean {
    if (request.schema === SIGNING_SCHEMA.BTC_TRANSFER) {
      return true
    }
    if (request.bitcoin && request.bitcoin.inputs.length > 0) {
      return true
    }
    return false
  }

  private computeSecp256k1Digest(data: Buffer, hashType: number, isPrehashed?: boolean): Buffer {
    if (isPrehashed) {
      return data.length >= 32 ? Buffer.from(data.slice(0, 32)) : Buffer.from(data)
    }

    if (hashType === EXTERNAL.SIGNING.HASHES.NONE) {
      return Buffer.from(data)
    }

    if (hashType === EXTERNAL.SIGNING.HASHES.SHA256) {
      return Buffer.from(createHash('sha256').update(data).digest())
    }

    const buffer = Buffer.isBuffer(data) ? data : Buffer.from(data)
    return Buffer.from(Hash.keccak256(buffer))
  }

  /**
   * Signs data using Solana wallet (ed25519)
   */
  private async signEd25519(request: SigningRequest): Promise<SignatureResult> {
    if (!request.path || request.path.length === 0) {
      throw new Error('Ed25519 signing requires a derivation path')
    }

    const config = await getWalletConfig()
    const { privateKey } = deriveEd25519Key(config.seed, request.path)
    const message = Buffer.from(request.data)
    const signature = await ed25519.sign(message, privateKey)
    const publicKey = await ed25519.getPublicKey(privateKey)

    if (process.env.DEBUG_SIGNING === '1') {
      const debugInfo = {
        path: request.path,
        messageLength: message.length,
        signature: Buffer.from(signature).toString('hex'),
        publicKey: Buffer.from(publicKey).toString('hex'),
      }
      console.log('[SigningService] Ed25519 signing', debugInfo)
    }

    return {
      signature: Buffer.from(signature),
      format: 'raw',
      metadata: {
        publicKey: Buffer.from(publicKey).toString('hex'),
      },
    }
  }

  /**
   * Signs data using Solana wallet (ed25519)
   */
  private async signSolana(
    request: SigningRequest,
    wallet: SolanaWalletAccount,
  ): Promise<SignatureResult> {
    const derivationPath =
      request.path && request.path.length > 0
        ? request.path
        : wallet.derivationPath && wallet.derivationPath.length > 0
          ? wallet.derivationPath
          : [HARDENED_OFFSET + 44, HARDENED_OFFSET + 501, HARDENED_OFFSET, HARDENED_OFFSET, 0]

    // Always derive the key if wallet doesn't have private key OR if the derivation path has changed
    const shouldDerive =
      !wallet.privateKey ||
      !wallet.derivationPath ||
      wallet.derivationPath.length !== derivationPath.length ||
      wallet.derivationPath.some((value, idx) => value !== derivationPath[idx])

    if (shouldDerive) {
      const config = await getWalletConfig()
      const { privateKey } = deriveEd25519Key(config.seed, derivationPath)

      if (!privateKey || privateKey.length !== 32) {
        throw new Error('Failed to derive Solana private key from mnemonic')
      }

      const seed = Buffer.from(privateKey)
      wallet.privateKey = seed.toString('hex')

      // Derive the public key from the seed to ensure it matches
      const publicKey = ed25519.getPublicKey(seed)
      wallet.publicKey = Buffer.from(publicKey).toString('hex')

      // Update the wallet's derivation path
      wallet.derivationPath = [...derivationPath]
      wallet.derivationPathString = formatDerivationPath(derivationPath)

      if (process.env.DEBUG_SIGNING === '1') {
        console.debug('[SigningService] Derived Solana signing material', {
          path: derivationPath,
          seed: wallet.privateKey,
          publicKey: wallet.publicKey,
        })
      }
    }

    // Solana uses ed25519 signatures
    if (!wallet.privateKey) {
      throw new Error('Failed to derive Solana private key')
    }
    const privateKeyBytes = Buffer.from(wallet.privateKey, 'hex')

    // Use the first 32 bytes for the seed (ed25519 uses 32-byte seeds)
    const seed = privateKeyBytes.length === 32 ? privateKeyBytes : privateKeyBytes.subarray(0, 32)

    // Sign with ed25519 (now synchronous with configured hash)
    const signature = ed25519.sign(request.data, seed)
    const sigBuffer = Buffer.from(signature)

    if (process.env.DEBUG_SIGNING === '1') {
      console.debug('[SigningService] Ed25519 Signature', {
        dataToSign: request.data.toString('hex'),
        signatureLength: sigBuffer.length,
        signature: sigBuffer.toString('hex'),
      })
    }

    // Ed25519 signatures are 64 bytes: first 32 bytes are R, last 32 bytes are S
    // SDK expects raw format (not DER) for Ed25519
    const r = sigBuffer.slice(0, 32)
    const s = sigBuffer.slice(32, 64)

    console.log('[SigningService] Solana/Ed25519 signature components:', {
      r: r.toString('hex'),
      s: s.toString('hex'),
      fullSignature: sigBuffer.toString('hex'),
    })

    // Return raw signature format (R || S) for Ed25519
    // SDK parses this as: r = first 32 bytes, s = next 32 bytes
    return {
      signature: sigBuffer, // Raw 64-byte signature (R || S)
      format: 'raw',
      metadata: {
        signer: wallet.address,
        publicKey: wallet.publicKey,
      },
    }
  }

  /**
   * Signs data using BLS12-381 (for Ethereum 2.0)
   */
  private async signBLS12381(request: SigningRequest): Promise<SignatureResult> {
    const config = await getWalletConfig()
    const { privateKey } = deriveBLS12381Key(config.seed, request.path)

    if (!privateKey || privateKey.length !== 32) {
      throw new Error('Failed to derive BLS12-381 private key')
    }

    if (!request.data || request.data.length < 5) {
      throw new Error('BLS signing request missing payload data')
    }

    const dst = request.data.readUInt32LE(0)
    const message = request.data.slice(4)

    if (message.length === 0) {
      throw new Error('BLS signing request contains empty message')
    }

    const dstLabel = this.resolveBlsDstLabel(dst)
    const originalDstLabel =
      typeof blsUtils.getDSTLabel === 'function' ? blsUtils.getDSTLabel() : undefined
    if (dstLabel && typeof blsUtils.setDSTLabel === 'function') {
      blsUtils.setDSTLabel(dstLabel)
    }

    // Derive the G1 public key (48 bytes)
    const publicKey = blsGetPublicKey(privateKey)
    const publicKeyBuffer = Buffer.from(publicKey)

    // Sign the message - produces a G2 signature (96 bytes)
    const signature = await blsSign(message, privateKey)
    const signatureBuffer = Buffer.from(signature)

    if (dstLabel && originalDstLabel && dstLabel !== originalDstLabel) {
      blsUtils.setDSTLabel(originalDstLabel)
    }

    if (process.env.DEBUG_SIGNING === '1') {
      console.debug('[SigningService] BLS12-381 Signature', {
        path: request.path,
        dst,
        dataToSign: message.toString('hex'),
        publicKeyLength: publicKeyBuffer.length,
        publicKey: publicKeyBuffer.toString('hex'),
        signatureLength: signatureBuffer.length,
        signature: signatureBuffer.toString('hex'),
      })
    }

    console.log('[SigningService] BLS12-381 signature components:', {
      publicKeyLength: publicKeyBuffer.length,
      signatureLength: signatureBuffer.length,
      path: request.path,
    })

    // Return raw signature format for BLS
    return {
      signature: signatureBuffer, // Raw 96-byte G2 signature
      format: 'raw',
      metadata: {
        publicKey: publicKeyBuffer.toString('hex'),
      },
    }
  }

  private resolveBlsDstLabel(dst: number): string {
    if (dst === EXTERNAL.SIGNING.BLS_DST.BLS_DST_POP) {
      return 'BLS_SIG_BLS12381G2_XMD:SHA-256_SSWU_RO_POP_'
    }
    return 'BLS_SIG_BLS12381G2_XMD:SHA-256_SSWU_RO_NUL_'
  }

  /**
   * Performs secp256k1 signing with recovery
   */
  private secp256k1Sign(
    hash: Buffer,
    privateKey: Buffer,
  ): {
    r: Buffer
    s: Buffer
    recovery: number
    recoveryId: number
  } {
    const keyPair = this.secp256k1.keyFromPrivate(privateKey)
    const signature = keyPair.sign(hash, { canonical: true })

    const rawRecovery =
      typeof signature.recoveryParam === 'number'
        ? signature.recoveryParam
        : this.calculateRecoveryId(hash, signature, keyPair.getPublic())
    const recovery = rawRecovery & 1

    if (process.env.DEBUG_SIGNING === '1') {
      console.log('[SigningService] secp256k1Sign debug:', {
        hash: hash.toString('hex'),
        privateKey: privateKey.toString('hex'),
        r: signature.r.toString('hex'),
        s: signature.s.toString('hex'),
        rawRecovery,
        recovery,
        publicKey: keyPair.getPublic(false, 'hex'),
      })
    }

    return {
      r: Buffer.from(signature.r.toArray('be', 32)),
      s: Buffer.from(signature.s.toArray('be', 32)),
      recovery,
      recoveryId: rawRecovery,
    }
  }

  /**
   * Calculates recovery ID for ECDSA signature
   */
  private calculateRecoveryId(hash: Buffer, signature: any, publicKey: any): number {
    for (let recovery = 0; recovery < 4; recovery++) {
      try {
        const recoveredKey = this.secp256k1.recoverPubKey(hash, signature, recovery)
        if (recoveredKey.encode('hex') === publicKey.encode('hex')) {
          console.log(`[calculateRecoveryId] Found matching recovery ID: ${recovery}`)
          return recovery
        }
      } catch {
        continue
      }
    }
    console.log('[calculateRecoveryId] No matching recovery ID found, defaulting to 0')
    return 0
  }

  /**
   * Formats signature as DER encoding
   */
  private formatDERSignature(r: Buffer, s: Buffer): Buffer {
    const normalizeComponent = (component: Buffer) => {
      let normalized = Buffer.from(component)

      // Trim leading zeros
      while (normalized.length > 1 && normalized[0] === 0x00) {
        normalized = normalized.slice(1)
      }

      // Ensure the value is interpreted as positive
      if (normalized[0] & 0x80) {
        normalized = Buffer.concat([Buffer.from([0x00]), normalized])
      }

      return normalized
    }

    const normalizedR = normalizeComponent(r)
    const normalizedS = normalizeComponent(s)

    const sequence = Buffer.concat([
      Buffer.from([0x02, normalizedR.length]),
      normalizedR,
      Buffer.from([0x02, normalizedS.length]),
      normalizedS,
    ])

    const encodeLength = (length: number) => {
      if (length <= 0x7f) {
        return Buffer.from([length])
      }

      const bytes: number[] = []
      let remaining = length
      while (remaining > 0) {
        bytes.unshift(remaining & 0xff)
        remaining >>= 8
      }
      return Buffer.from([0x80 | bytes.length, ...bytes])
    }

    const lengthBytes = encodeLength(sequence.length)
    return Buffer.concat([Buffer.from([0x30]), lengthBytes, sequence])
  }

  /**
   * Hashes a message for Ethereum personal signing
   */
  private hashMessage(message: Buffer): Buffer {
    const prefix = Buffer.from('\x19Ethereum Signed Message:\n' + message.length.toString())
    return Buffer.from(Hash.keccak256(Buffer.concat([prefix, message])))
  }

  /**
   * Checks if a message already contains the Ethereum personal message prefix
   */
  private isPrefixedPersonalMessage(message: Buffer): boolean {
    const prefix = Buffer.from('\x19Ethereum Signed Message:\n')
    if (message.length <= prefix.length) {
      return false
    }
    return message.slice(0, prefix.length).equals(prefix)
  }

  /**
   * Computes a keccak256 hash of a buffer and returns it as a Buffer
   */
  private keccakBuffer(data: Buffer): Buffer {
    return Buffer.from(Hash.keccak256(data))
  }

  private convertMapsToObjects(value: any): any {
    if (Buffer.isBuffer(value) || ArrayBuffer.isView(value)) {
      return this.normalizeBinaryValue(value as Buffer | ArrayBufferView)
    }

    if (value instanceof Map) {
      const obj: Record<string, any> = {}
      for (const [key, entry] of Array.from(value.entries())) {
        const normalizedKey =
          typeof key === 'string'
            ? key
            : Buffer.isBuffer(key) || ArrayBuffer.isView(key)
              ? this.normalizeBinaryValue(key as Buffer | ArrayBufferView)
              : String(key)
        obj[normalizedKey] = this.convertMapsToObjects(entry)
      }
      return obj
    }

    if (Array.isArray(value)) {
      return value.map(item => this.convertMapsToObjects(item))
    }

    if (value && typeof value === 'object') {
      const obj: Record<string, any> = {}
      for (const [key, entry] of Object.entries(value)) {
        const normalizedKey =
          typeof key === 'string'
            ? key
            : Buffer.isBuffer(key)
              ? this.normalizeBinaryValue(key)
              : String(key)
        obj[normalizedKey] = this.convertMapsToObjects(entry)
      }
      return obj
    }

    return value
  }

  private sanitizeTypedData(value: any): any {
    if (!value || typeof value !== 'object') {
      return value
    }

    if (value.types && typeof value.types === 'object') {
      const sanitizedTypes: Record<string, any> = {}
      for (const [typeName, entries] of Object.entries(value.types)) {
        if (!Array.isArray(entries)) {
          sanitizedTypes[typeName] = entries
          continue
        }

        const sanitizedEntries = [] as Array<{ name: string; type: string; components?: any[] }>
        for (const entry of entries) {
          try {
            const normalizedEntry = this.normalizeTypeEntry(entry)
            if (normalizedEntry.name && normalizedEntry.type) {
              sanitizedEntries.push(normalizedEntry)
            }
          } catch (error) {
            const detail = error instanceof Error ? error.message : String(error)
            console.warn('[SigningService] Skipping invalid EIP-712 type entry', {
              typeName,
              entry,
              detail,
            })
          }
        }

        sanitizedTypes[typeName] = sanitizedEntries
      }
      value.types = sanitizedTypes

      if (value.primaryType && typeof value.primaryType === 'string' && value.message) {
        this.ensureStructTypeCoverage(value.primaryType, value.message, value.types)
        this.coerceTypedValues(value.primaryType, value.message, value.types)
      }

      this.coerceTypedValues('EIP712Domain', value.domain, value.types)
    }

    return value
  }

  private normalizeTypeEntry(entry: any): { name: string; type: string; components?: any[] } {
    if (!entry || typeof entry !== 'object') {
      throw new Error(`Invalid EIP-712 type entry: ${JSON.stringify(entry)}`)
    }

    const normalized: { name: string; type: string; components?: any[] } = { name: '', type: '' }

    const nameCandidate =
      entry.name ??
      entry.Name ??
      (typeof entry.get === 'function' ? entry.get('name') : undefined) ??
      entry[0] ??
      entry['0']

    const typeCandidate =
      entry.type ??
      entry.Type ??
      (typeof entry.get === 'function' ? entry.get('type') : undefined) ??
      entry[1] ??
      entry['1']

    const normalizedName = this.normalizeUnknownValueToString(nameCandidate)

    const normalizedType =
      this.normalizeUnknownValueToString(typeCandidate) ??
      this.normalizeUnknownValueToString(
        Object.entries(entry)
          .filter(([key]) => key !== 'name' && key !== 'Name' && key !== 'components')
          .map(([, value]) => value)[0],
      )

    if (!normalizedName || !normalizedType) {
      const debugEntry = JSON.stringify(entry, (_key, entryValue) => {
        if (Buffer.isBuffer(entryValue)) {
          return `0x${entryValue.toString('hex')}`
        }
        if (ArrayBuffer.isView(entryValue)) {
          const view = entryValue as ArrayBufferView
          return `0x${Buffer.from(view.buffer, view.byteOffset, view.byteLength).toString('hex')}`
        }
        return entryValue
      })
      throw new Error(`Failed to normalize EIP-712 type entry: ${debugEntry}`)
    }

    const namePattern = /^[A-Za-z0-9_][A-Za-z0-9_]*$/
    const typePattern = /^[A-Za-z][A-Za-z0-9_\[\]]*$/

    if (!namePattern.test(normalizedName) || !typePattern.test(normalizedType)) {
      throw new Error(`Invalid EIP-712 identifier: name=${normalizedName} type=${normalizedType}`)
    }

    normalized.name = normalizedName
    normalized.type = normalizedType

    if (entry.components && Array.isArray(entry.components)) {
      normalized.components = entry.components.map((component: any) =>
        this.normalizeTypeEntry(component),
      )
    }

    return normalized
  }

  private ensureStructTypeCoverage(
    typeName: string,
    data: any,
    types: Record<string, Array<{ name: string; type: string; components?: any[] }>>,
  ): void {
    if (!types?.[typeName] || !Array.isArray(types[typeName]) || !data) {
      return
    }

    const entries = types[typeName]
    const existing = new Map(entries.map(entry => [entry.name, entry.type]))

    if (Array.isArray(data)) {
      const sample = data.find(item => item !== null && item !== undefined)
      if (sample && typeof sample === 'object' && !Array.isArray(sample)) {
        this.ensureStructTypeCoverage(typeName, sample, types)
      }
      return
    }

    if (typeof data !== 'object') {
      return
    }

    for (const [key, fieldValue] of Object.entries(data)) {
      const isObjectLike =
        fieldValue !== null &&
        typeof fieldValue === 'object' &&
        !Buffer.isBuffer(fieldValue) &&
        !ArrayBuffer.isView(fieldValue)

      if (!existing.has(key) && typeName !== 'EIP712Domain' && isObjectLike) {
        const inferred = this.inferEip712Type(fieldValue, key, typeName, types)
        entries.push({ name: key, type: inferred })
        existing.set(key, inferred)
      }

      const resolvedType = existing.get(key)
      if (!resolvedType) {
        continue
      }

      if (resolvedType === 'bool') {
        if (typeof fieldValue !== 'boolean') {
          data[key] =
            fieldValue === true || fieldValue === 'true' || fieldValue === '1' || fieldValue === 1
        }
        continue
      }

      if (Array.isArray(fieldValue)) {
        const elementType = resolvedType.endsWith('[]') ? resolvedType.slice(0, -2) : null
        const sample = fieldValue.find(item => item !== null && item !== undefined)
        if (elementType && sample && typeof sample === 'object' && !Array.isArray(sample)) {
          this.ensureStructTypeCoverage(elementType, sample, types)
        }
        continue
      }

      if (fieldValue && typeof fieldValue === 'object' && !this.isPrimitiveType(resolvedType)) {
        this.ensureStructTypeCoverage(resolvedType, fieldValue, types)
      }
    }
  }

  private inferEip712Type(
    value: any,
    fieldName: string,
    parentType: string,
    types?: Record<string, Array<{ name: string; type: string; components?: any[] }>>,
  ): string {
    if (value === null || value === undefined) {
      return 'string'
    }

    if (Array.isArray(value)) {
      const sample = value.find(item => item !== null && item !== undefined)
      const elementType = sample
        ? this.inferEip712Type(sample, `${fieldName || 'item'}Item`, parentType, types)
        : 'string'
      return elementType.endsWith('[]') ? elementType : `${elementType}[]`
    }

    if (typeof value === 'boolean') {
      return 'bool'
    }

    if (typeof value === 'bigint') {
      const valueString = value.toString()
      return valueString.startsWith('-') ? 'int256' : 'uint256'
    }

    if (typeof value === 'number') {
      if (!Number.isFinite(value)) {
        return 'string'
      }
      if (Number.isInteger(value)) {
        return value >= 0 ? 'uint256' : 'int256'
      }
      return 'string'
    }

    if (typeof value === 'string') {
      const trimmed = value.trim()
      if (/^0x[0-9a-fA-F]{40}$/.test(trimmed)) {
        return 'address'
      }
      if (/^0x[0-9a-fA-F]*$/.test(trimmed)) {
        const byteLength = Math.ceil((trimmed.length - 2) / 2)
        if (byteLength === 20) {
          return 'address'
        }
        if (byteLength === 32) {
          return 'bytes32'
        }
        if (byteLength > 0 && byteLength <= 32 && Number.isInteger(byteLength)) {
          return `bytes${byteLength}`
        }
        return 'bytes'
      }
      if (/^-?\d+$/.test(trimmed)) {
        return trimmed.startsWith('-') ? 'int256' : 'uint256'
      }
      return 'string'
    }

    if (Buffer.isBuffer(value) || ArrayBuffer.isView(value)) {
      const length = Buffer.isBuffer(value) ? value.length : (value as ArrayBufferView).byteLength
      if (length === 20) {
        return 'address'
      }
      if (length === 32) {
        return 'bytes32'
      }
      if (length > 0 && length <= 32) {
        return `bytes${length}`
      }
      return 'bytes'
    }

    if (value && typeof value === 'object' && types) {
      let structName = this.generateInferredStructName(parentType, fieldName, types)

      if (types[structName] && !(types[structName] as any).__inferred) {
        let counter = 1
        let candidate = `${structName}${counter}`
        while (types[candidate] && !(types[candidate] as any).__inferred) {
          counter++
          candidate = `${structName}${counter}`
        }
        structName = candidate
      }

      if (!types[structName]) {
        const newType: Array<{ name: string; type: string; components?: any[] }> & {
          __inferred?: boolean
        } = []
        Object.defineProperty(newType, '__inferred', {
          value: true,
          enumerable: false,
        })
        types[structName] = newType
      }

      this.ensureStructTypeCoverage(structName, value, types)
      return structName
    }

    return 'string'
  }

  private generateInferredStructName(
    parentType: string,
    fieldName: string,
    types: Record<string, Array<{ name: string; type: string; components?: any[] }>>,
  ): string {
    const parentSegment = this.formatIdentifierSegment(parentType) || 'Inferred'
    const fieldSegment = this.formatIdentifierSegment(fieldName) || 'Field'
    const baseName = `Inferred${parentSegment}${fieldSegment}`

    if (!types[baseName] || (types[baseName] as any).__inferred) {
      return baseName
    }

    let counter = 1
    let candidate = `${baseName}${counter}`
    while (types[candidate] && !(types[candidate] as any).__inferred) {
      counter++
      candidate = `${baseName}${counter}`
    }
    return candidate
  }

  private formatIdentifierSegment(value: string): string {
    if (!value) {
      return ''
    }
    const sanitized = value.replace(/[^A-Za-z0-9]+/g, ' ').trim()
    if (!sanitized.length) {
      return ''
    }
    return sanitized
      .split(/\s+/)
      .filter(Boolean)
      .map(segment => segment.charAt(0).toUpperCase() + segment.slice(1))
      .join('')
  }

  private coerceTypedValues(
    typeName: string,
    data: any,
    types: Record<string, Array<{ name: string; type: string; components?: any[] }>>,
  ): void {
    if (!data || typeof data !== 'object') {
      return
    }

    const entries = types?.[typeName]
    if (!entries) {
      return
    }

    for (const entry of entries) {
      const { name, type } = entry
      if (!(name in data)) {
        continue
      }

      const value = data[name]

      if (type.endsWith('[]')) {
        if (!Array.isArray(value)) {
          continue
        }
        const elementType = type.slice(0, -2)
        if (this.isPrimitiveType(elementType)) {
          data[name] = value.map(item => this.coerceScalarValue(elementType, item))
        } else {
          data[name] = value.map(item => {
            if (item && typeof item === 'object') {
              this.coerceTypedValues(elementType, item, types)
            }
            return item
          })
        }
        continue
      }

      if (this.isPrimitiveType(type)) {
        data[name] = this.coerceScalarValue(type, value)
      } else if (value && typeof value === 'object') {
        this.coerceTypedValues(type, value, types)
      }
    }
  }

  private isPrimitiveType(type: string): boolean {
    const base = type.toLowerCase().replace(/\[\]$/, '')
    return (
      base === 'address' ||
      base === 'bool' ||
      base === 'string' ||
      base === 'bytes' ||
      base.startsWith('bytes') ||
      base.startsWith('uint') ||
      base.startsWith('int')
    )
  }

  private coerceScalarValue(type: string, value: any): any {
    const baseType = type.toLowerCase()

    if (baseType === 'bool') {
      if (typeof value === 'boolean') return value
      if (typeof value === 'number') return value !== 0
      if (typeof value === 'string') {
        const normalized = value.trim().toLowerCase()
        if (normalized === 'true') return true
        if (normalized === 'false') return false
        if (normalized === '1') return true
        if (normalized === '0') return false
      }
      return Boolean(value)
    }

    if (baseType === 'string') {
      if (value === undefined || value === null) return ''
      const str = typeof value === 'string' ? value : String(value)
      return str.replace(/\u0000+/g, '')
    }

    if (baseType === 'address') {
      return this.normalizeAddress(value)
    }

    if (baseType === 'bytes') {
      return this.ensureHexString(value)
    }

    if (baseType.startsWith('bytes')) {
      const targetLength = parseInt(baseType.slice(5), 10)
      if (Number.isFinite(targetLength) && targetLength > 0) {
        const hex = this.ensureHexString(value)
        const raw = hex.slice(2)
        const padded = raw.padStart(targetLength * 2, '0')
        return `0x${padded.slice(-targetLength * 2)}`
      }
      return this.ensureHexString(value)
    }

    if (baseType.startsWith('uint') || baseType.startsWith('int')) {
      const bitsRaw = parseInt(baseType.replace(/^[a-z]+/i, ''), 10)
      const bitWidth = Number.isInteger(bitsRaw) && bitsRaw > 0 ? bitsRaw : 256
      if (process.env.DEBUG_SIGNING === '1') {
        console.log('[SigningService] coerceScalarValue bits', {
          type: baseType,
          parsedBits: bitsRaw,
          bitWidth,
        })
      }
      const modulus = BigInt(1) << BigInt(bitWidth)
      const halfModulus = modulus >> BigInt(1)

      const toBigInt = (input: any): bigint => {
        if (typeof input === 'bigint') return input
        if (typeof input === 'number') {
          if (!Number.isFinite(input)) {
            return BigInt(0)
          }
          return BigInt(Math.trunc(input))
        }
        if (typeof input === 'boolean') return input ? BigInt(1) : BigInt(0)
        if (typeof input === 'string') {
          const trimmed = input.trim()
          if (!trimmed.length) return BigInt(0)
          try {
            if (/^-?0x/i.test(trimmed)) {
              return BigInt(trimmed)
            }
            return BigInt(trimmed)
          } catch {
            return BigInt(0)
          }
        }
        if (ArrayBuffer.isView(input) || Buffer.isBuffer(input)) {
          const hex = Buffer.isBuffer(input)
            ? input.toString('hex')
            : Buffer.from(input.buffer, input.byteOffset, input.byteLength).toString('hex')
          if (!hex.length) {
            return BigInt(0)
          }
          return BigInt(`0x${hex}`)
        }
        return BigInt(0)
      }

      const normalizeUnsigned = (input: bigint): bigint => {
        if (modulus === BigInt(0)) {
          return BigInt(0)
        }
        const wrapped = ((input % modulus) + modulus) % modulus
        return wrapped
      }

      const normalizeSigned = (input: bigint): bigint => {
        if (modulus === BigInt(0)) {
          return BigInt(0)
        }
        let wrapped = ((input % modulus) + modulus) % modulus
        if (wrapped >= halfModulus) {
          wrapped -= modulus
        }
        return wrapped
      }

      const bigintValue = toBigInt(value)
      if (baseType.startsWith('uint')) {
        const normalized = normalizeUnsigned(bigintValue)
        if (process.env.DEBUG_SIGNING === '1') {
          console.log('[SigningService] coerceScalarValue uint', {
            type: baseType,
            originalDecimal: bigintValue.toString(),
            normalizedDecimal: normalized.toString(),
            originalHex: this.formatBigIntForLogging(bigintValue),
            normalizedHex: this.formatBigIntForLogging(normalized),
          })
        }
        return normalized
      }
      const normalized = normalizeSigned(bigintValue)
      if (process.env.DEBUG_SIGNING === '1') {
        console.log('[SigningService] coerceScalarValue int', {
          type: baseType,
          originalDecimal: bigintValue.toString(),
          normalizedDecimal: normalized.toString(),
          originalHex: this.formatBigIntForLogging(bigintValue),
          normalizedHex: this.formatBigIntForLogging(normalized),
        })
      }
      return normalized
    }

    if (ArrayBuffer.isView(value) || Buffer.isBuffer(value)) {
      return this.ensureHexString(value)
    }

    return value
  }

  private ensureHexString(value: any): string {
    if (typeof value === 'string') {
      if (/^0x[0-9a-fA-F]*$/.test(value)) {
        const hex = value.slice(2)
        const normalized = hex.length % 2 === 0 ? hex : `0${hex}`
        return `0x${normalized.toLowerCase()}`
      }
      return `0x${Buffer.from(value, 'utf8').toString('hex')}`
    }

    if (typeof value === 'number' || typeof value === 'bigint') {
      let hex = BigInt(value).toString(16)
      if (hex.length % 2) hex = `0${hex}`
      return `0x${hex}`
    }

    if (typeof value === 'boolean') {
      return value ? '0x01' : '0x00'
    }

    if (Buffer.isBuffer(value)) {
      return `0x${value.toString('hex')}`
    }

    if (ArrayBuffer.isView(value)) {
      return `0x${Buffer.from(value.buffer, value.byteOffset, value.byteLength).toString('hex')}`
    }

    if (value && typeof value === 'object' && 'toString' in value) {
      return this.ensureHexString(value.toString())
    }

    return '0x'
  }

  private normalizeAddress(value: any): string {
    const hex = this.ensureHexString(value)
    const raw = hex.slice(2).padStart(40, '0').slice(-40)
    return `0x${raw.toLowerCase()}`
  }

  private normalizeUnknownValueToString(value: any): string | null {
    if (value === undefined || value === null) {
      return null
    }

    if (typeof value === 'string') {
      return value
    }

    if (typeof value === 'number' || typeof value === 'bigint') {
      return value.toString()
    }

    if (Buffer.isBuffer(value) || ArrayBuffer.isView(value)) {
      return this.normalizeBinaryValue(value as Buffer | ArrayBufferView)
    }

    if (typeof value === 'object' && typeof value.toString === 'function') {
      const stringValue = value.toString()
      if (typeof stringValue === 'string' && stringValue !== '[object Object]') {
        return stringValue
      }
    }

    return null
  }

  private normalizeBinaryValue(value: Buffer | ArrayBufferView): string {
    const buffer = Buffer.isBuffer(value)
      ? value
      : Buffer.from(value.buffer, value.byteOffset, value.byteLength)
    if (buffer.length === 0) {
      return '0x'
    }

    const looksUtf16le =
      buffer.length % 2 === 0 &&
      buffer.length > 0 &&
      buffer.every((byte, index) => (index % 2 === 1 ? byte === 0 : true))

    if (looksUtf16le) {
      const asciiBytes = Buffer.alloc(buffer.length / 2)
      for (let i = 0; i < buffer.length; i += 2) {
        asciiBytes[i / 2] = buffer[i]
      }
      const asciiCandidate = asciiBytes.toString('utf8')
      if (this.isPrintableAscii(asciiCandidate)) {
        return asciiCandidate.replace(/\u0000+/g, '')
      }
    }

    const ascii = buffer.toString('utf8')
    if (this.isPrintableAscii(ascii)) {
      return ascii.replace(/\u0000+/g, '')
    }

    return `0x${buffer.toString('hex')}`
  }

  private isPrintableAscii(value: string): boolean {
    if (!value.length) {
      return false
    }

    for (let index = 0; index < value.length; index++) {
      const code = value.charCodeAt(index)
      const isPrintable =
        (code >= 0x20 && code <= 0x7e) || code === 0x0a || code === 0x0d || code === 0x09
      if (!isPrintable) {
        return false
      }
    }

    return true
  }

  /**
   * Formats bigint values as hex strings for logging, preserving sign.
   */
  private formatBigIntForLogging(value: bigint): string {
    if (value === BigInt(0)) {
      return '0x0'
    }
    const hex = (value < BigInt(0) ? -value : value).toString(16)
    return value < BigInt(0) ? `-0x${hex}` : `0x${hex}`
  }

  private hashEip712Payload(payload: Buffer): Buffer {
    const decodedTypedData = this.removeNullTerminators(
      this.sanitizeTypedData(this.convertMapsToObjects(this.decodeEip712Payload(payload))),
    )

    if (process.env.DEBUG_SIGNING === '1') {
      const replacer = (_key: string, value: any) =>
        typeof value === 'bigint' ? this.formatBigIntForLogging(value) : value
      console.log(
        '[SigningService] Decoded EIP-712 data for hashing:',
        JSON.stringify(decodedTypedData, replacer, 2),
      )
    }

    if (
      !decodedTypedData.domain ||
      !decodedTypedData.types ||
      !decodedTypedData.primaryType ||
      !decodedTypedData.message
    ) {
      throw new Error(
        `Invalid EIP-712 structure: missing required fields. Domain: ${!!decodedTypedData.domain}, Types: ${!!decodedTypedData.types}, PrimaryType: ${!!decodedTypedData.primaryType}, Message: ${!!decodedTypedData.message}`,
      )
    }

    const hash = hashTypedData({
      domain: decodedTypedData.domain,
      types: decodedTypedData.types,
      primaryType: decodedTypedData.primaryType,
      message: decodedTypedData.message,
    })

    if (process.env.DEBUG_SIGNING === '1') {
      console.log('[SigningService] Calculated EIP-712 hash:', hash)
    }

    return Buffer.from(hash.slice(2), 'hex')
  }

  private decodeEip712Payload(payload: Buffer): any {
    try {
      let decoded: any
      try {
        decoded = cbor.decodeFirstSync(payload)
      } catch (error) {
        try {
          const [first] = cbor.decodeAllSync(payload)
          if (first !== undefined) {
            decoded = first
          }
        } catch {
          // ignore and continue to next fallback
        }

        if (!decoded) {
          let end = payload.length
          while (end > 0 && payload[end - 1] === 0) {
            end--
          }
          if (end > 0 && end !== payload.length) {
            try {
              decoded = cbor.decodeFirstSync(payload.slice(0, end))
            } catch {
              // ignore
            }
          }
        }

        if (!decoded) {
          throw error
        }
      }
      return decoded
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error)
      console.error('[SigningService] Failed to decode EIP-712 payload', detail)
      throw new Error(`Failed to decode EIP-712 payload: ${detail}`)
    }
  }

  private removeNullTerminators(value: any): any {
    if (typeof value === 'string') {
      return value.replace(/\u0000+/g, '')
    }

    if (Array.isArray(value)) {
      return value.map(item => this.removeNullTerminators(item))
    }

    if (value && typeof value === 'object') {
      for (const [key, entry] of Object.entries(value)) {
        value[key] = this.removeNullTerminators(entry)
      }
    }

    return value
  }

  /**
   * Finds the appropriate wallet account for a derivation path
   */
  private findWalletAccount(
    path: number[],
    coinType: WalletCoinType | 'UNKNOWN',
    walletAccounts: Map<string, WalletAccount>,
  ): WalletAccount | null {
    // Look for wallet account that matches the derivation path
    let foundAccount: WalletAccount | null = null
    console.log(
      `[SigningService] Finding wallet account for path: ${path.join('/')}, walletAccounts.size: ${walletAccounts.size}`,
    )
    walletAccounts.forEach(account => {
      if (account.coinType === coinType) {
        // Check if derivation paths match
        if (this.pathsMatch(account.derivationPath, path)) {
          foundAccount = account
        }
      }
    })
    if (foundAccount) {
      return foundAccount
    }

    // If no exact match, find the first account of the right coin type
    walletAccounts.forEach(account => {
      if (!foundAccount && account.coinType === coinType && account.privateKey) {
        foundAccount = account
      }
    })

    return foundAccount
  }

  /**
   * Checks if two derivation paths match
   */
  private pathsMatch(path1: number[], path2: number[]): boolean {
    if (path1.length !== path2.length) return false
    return path1.every((segment, index) => segment === path2[index])
  }

  /**
   * Validates signing request parameters
   */
  validateSigningRequest(request: SigningRequest): boolean {
    if (!request.path || request.path.length === 0) {
      return false
    }
    if (!Array.isArray(request.path) || !request.path.every(idx => Number.isInteger(idx))) {
      return false
    }
    if (!request.data || request.data.length === 0) {
      return false
    }
    return true
  }

  /**
   * Gets supported signature curves
   */
  getSupportedCurves(): number[] {
    return [EXTERNAL.SIGNING.CURVES.SECP256K1, EXTERNAL.SIGNING.CURVES.ED25519]
  }

  /**
   * Gets supported signature encodings
   */
  getSupportedEncodings(): number[] {
    return [
      1, // DER
      2, // COMPACT
    ]
  }
}

/**
 * Default signing service instance
 */
export const signingService = new SigningService()
