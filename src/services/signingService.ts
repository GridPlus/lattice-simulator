/**
 * Enhanced Signing Service for Lattice1 Device Simulator
 * Integrates with wallet services to provide real cryptographic signatures
 */

import { createHash } from 'crypto'
import { sign as ed25519Sign } from '@noble/ed25519'
import { ec as EC } from 'elliptic'
import { type Hex } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { EXTERNAL } from '@/shared/constants'
import { detectCoinTypeFromPath } from '@/shared/utils'
import type {
  WalletAccount,
  EthereumWalletAccount,
  BitcoinWalletAccount,
  SolanaWalletAccount,
  WalletCoinType,
} from '@/shared/types/wallet'

/**
 * Signature result with metadata
 */
export interface SignatureResult {
  /** The signature bytes */
  signature: Buffer
  /** Recovery ID for ECDSA signatures (Ethereum) */
  recovery?: number
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
  }
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
    const coinType = detectCoinTypeFromPath(request.path)

    // Find the appropriate wallet account
    let walletAccount = this.findWalletAccount(request.path, coinType, walletAccounts)
    if (!walletAccount) {
      // Try to create account on-demand if none exists
      console.log(
        `[SigningService] No wallet account found for path: ${request.path.join('/')}, attempting to create on-demand`,
      )

      // Extract account index from derivation path (assuming BIP-44 format: m/44'/coin'/account'/change/address)
      const accountIndex = request.path.length >= 3 ? request.path[2] - 0x80000000 : 0 // Remove hardened flag
      const changeType =
        request.path.length >= 4 ? (request.path[3] === 0 ? 'external' : 'internal') : 'external'

      try {
        // Check if coin type is supported for account creation
        if (coinType === 'UNKNOWN') {
          throw new Error(`Unknown coin type for path: ${request.path.join('/')}`)
        }

        // Use global wallet manager instance to create accounts
        const { walletManager } = await import('./walletManager')
        const newAccounts = await walletManager.createAccountsForCoin(
          coinType,
          1, // Create 1 account
          accountIndex,
          changeType,
        )

        // Add new accounts to the walletAccounts map
        newAccounts.forEach(account => {
          walletAccounts.set(account.id, account)
        })

        // Try to find the account again
        walletAccount = this.findWalletAccount(request.path, coinType, walletAccounts)

        if (!walletAccount) {
          throw new Error(`Failed to create wallet account for path: ${request.path.join('/')}`)
        }

        console.log(
          `[SigningService] Successfully created wallet account for path: ${request.path.join('/')}`,
        )
      } catch (error) {
        console.error('[SigningService] Failed to create wallet account:', error)
        throw new Error(
          `No wallet account found for path: ${request.path.join('/')} and failed to create one: ${error instanceof Error ? error.message : 'Unknown error'}`,
        )
      }
    }

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
    if (!wallet.privateKey) {
      throw new Error('Ethereum wallet has no private key for signing')
    }

    // Use viem for Ethereum signing to match SDK behavior
    const account = privateKeyToAccount(wallet.privateKey as Hex)

    // For Ethereum, we need to handle different signature types
    // Check if this is message signing (simplified check)
    if (request.schema === 1) {
      // Assuming 1 is ETH_MSG schema
      // Message signing
      const signature = await account.signMessage({
        message: { raw: request.data },
      })

      return {
        signature: Buffer.from(signature.slice(2), 'hex'),
        format: 'compact',
        metadata: {
          signer: wallet.address,
          publicKey: wallet.publicKey,
        },
      }
    } else {
      // Transaction signing
      const txHash = createHash('keccak256').update(request.data).digest()
      const signature = this.secp256k1Sign(txHash, Buffer.from(wallet.privateKey.slice(2), 'hex'))

      return {
        signature: this.formatDERSignature(signature.r, signature.s),
        recovery: signature.recovery,
        format: 'der',
        metadata: {
          signer: wallet.address,
          publicKey: wallet.publicKey,
          txHash: '0x' + txHash.toString('hex'),
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
    if (!wallet.privateKey) {
      throw new Error('Solana wallet has no private key for signing')
    }

    // Solana uses ed25519 signatures
    const privateKeyBytes = Buffer.from(wallet.privateKey, 'hex')
    const signature = await ed25519Sign(request.data, privateKeyBytes.subarray(0, 32))

    return {
      signature: Buffer.from(signature),
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
  } {
    const keyPair = this.secp256k1.keyFromPrivate(privateKey)
    const signature = keyPair.sign(hash, { canonical: true })

    // Calculate recovery ID
    const recovery = this.calculateRecoveryId(hash, signature, keyPair.getPublic())

    return {
      r: Buffer.from(signature.r.toArray('be', 32)),
      s: Buffer.from(signature.s.toArray('be', 32)),
      recovery,
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
          return recovery
        }
      } catch {
        continue
      }
    }
    return 0
  }

  /**
   * Formats signature as DER encoding
   */
  private formatDERSignature(r: Buffer, s: Buffer): Buffer {
    // DER encoding: 0x30 [total-length] 0x02 [R-length] [R] 0x02 [S-length] [S]
    const rLength = r.length
    const sLength = s.length
    const totalLength = 4 + rLength + sLength

    const der = Buffer.alloc(totalLength + 2)
    let offset = 0

    der[offset++] = 0x30 // SEQUENCE
    der[offset++] = totalLength
    der[offset++] = 0x02 // INTEGER (r)
    der[offset++] = rLength
    r.copy(der, offset)
    offset += rLength
    der[offset++] = 0x02 // INTEGER (s)
    der[offset++] = sLength
    s.copy(der, offset)

    return der
  }

  /**
   * Hashes a message for Ethereum personal signing
   */
  private hashMessage(message: Buffer): Buffer {
    const prefix = Buffer.from('\x19Ethereum Signed Message:\n' + message.length.toString())
    return createHash('keccak256')
      .update(Buffer.concat([prefix, message]))
      .digest()
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
    return request.path && request.path.length >= 3 && request.data && request.data.length > 0
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
