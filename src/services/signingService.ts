/**
 * Enhanced Signing Service for Lattice1 Device Simulator
 * Integrates with wallet services to provide real cryptographic signatures
 */

import { createHash } from 'crypto'
import * as ed25519 from '@noble/ed25519'
import { ec as EC } from 'elliptic'
import { type Hex } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { keccak256 } from 'viem/utils'
import { EXTERNAL, HARDENED_OFFSET } from '../shared/constants'
import { detectCoinTypeFromPath } from '../shared/utils'
import { deriveHDKey, deriveEd25519Key, formatDerivationPath } from '../shared/utils/hdWallet'
import { getWalletConfig } from '../shared/walletConfig'
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

/**
 * Signature result with metadata
 */
export interface SignatureResult {
  /** The signature bytes */
  signature: Buffer
  /** Recovery ID for ECDSA signatures (Ethereum) */
  recovery?: number
  /** Full recovery identifier (includes parity & compression bits) */
  recoveryId?: number
  /** Signature format */
  format: 'der' | 'raw' | 'compact'
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
    wallet.publicKey =
      wallet.publicKey ||
      (derivedKey.publicKey ? Buffer.from(derivedKey.publicKey).toString('hex') : wallet.publicKey)

    if (!wallet.address) {
      // Populate address if missing to keep metadata consistent
      const derivedAccount = privateKeyToAccount(derivedPrivateKeyHex as Hex)
      wallet.address = derivedAccount.address
    }

    // Use viem for Ethereum signing to match SDK behavior
    const privateKeyBuffer = Buffer.from((wallet.privateKey as string).slice(2), 'hex')
    const publicKeyUncompressed = this.secp256k1
      .keyFromPrivate(privateKeyBuffer)
      .getPublic(false, 'hex')
    const publicKeyCompressed = this.secp256k1
      .keyFromPrivate(privateKeyBuffer)
      .getPublic(true, 'hex')

    if (process.env.DEBUG_SIGNING === '1') {
      console.debug('[SigningService] Derived Ethereum signing material', {
        path: derivationPath,
        privateKey: derivedPrivateKeyHex,
        address: wallet.address,
        publicKeyUncompressed,
        publicKeyCompressed,
      })
    }

    console.log('[SigningService] Active Ethereum account:', {
      address: wallet.address,
      derivationPath,
    })

    // For Ethereum, we need to handle different signature types
    // Check if this is message signing (schema 3 = ETH_MSG)
    if (request.schema === 3) {
      // ETH_MSG schema (personal_sign, EIP-712)
      // Message signing - but need to return DER format like real device
      const messageHash = this.hashMessage(request.data)
      const signature = this.secp256k1Sign(messageHash, privateKeyBuffer)

      const derSignature = this.formatDERSignature(signature.r, signature.s)

      console.log('[SigningService] ETH_MSG Signature components:', {
        hash: messageHash.toString('hex'),
        r: signature.r.toString('hex'),
        s: signature.s.toString('hex'),
        recovery: signature.recovery,
        recoveryId: signature.recoveryId,
        derSignatureLength: derSignature.length,
        derSignaturePrefix: derSignature.slice(0, 10).toString('hex'),
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
          const txHashHex = keccak256(txData)
          signingDigest = Buffer.from(txHashHex.replace(/^0x/, ''), 'hex')
          signablePayload = txData
        }
      } else {
        const txHashHex = keccak256(request.data)
        signingDigest = Buffer.from(txHashHex.replace(/^0x/, ''), 'hex')
      }

      const signature = this.secp256k1Sign(signingDigest, privateKeyBuffer)

      console.log('[SigningService] Signature components:', {
        hash: signingDigest.toString('hex'),
        r: signature.r.toString('hex'),
        s: signature.s.toString('hex'),
        recovery: signature.recovery,
        recoveryId: signature.recoveryId,
      })

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
   */
  private async signBitcoin(
    request: SigningRequest,
    wallet: BitcoinWalletAccount,
  ): Promise<SignatureResult> {
    if (!wallet.privateKey) {
      throw new Error('Bitcoin wallet has no private key for signing')
    }

    // For Bitcoin, typically sign the hash of the transaction
    const hash = createHash('sha256').update(request.data).digest()
    const doubleHash = createHash('sha256').update(hash).digest()

    // Convert WIF private key to hex if needed
    let privateKeyHex = wallet.privateKey
    if (
      privateKeyHex.startsWith('L') ||
      privateKeyHex.startsWith('K') ||
      privateKeyHex.startsWith('5')
    ) {
      // This is WIF format, would need proper decoding
      // For now, assume it's already hex
      privateKeyHex = wallet.privateKey
    }

    const signature = this.secp256k1Sign(doubleHash, Buffer.from(privateKeyHex, 'hex'))

    return {
      signature: this.formatDERSignature(signature.r, signature.s),
      format: 'der',
      metadata: {
        publicKey: wallet.publicKey,
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
      console.debug('[SigningService] secp256k1Sign debug:', {
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
    const hashHex = keccak256(Buffer.concat([prefix, message]))
    return Buffer.from(hashHex.replace(/^0x/, ''), 'hex')
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
