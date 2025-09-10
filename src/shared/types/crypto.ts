/**
 * Cryptographic types and HD wallet definitions
 */

export interface HDNode {
  privateKey: Buffer
  publicKey: Buffer
  chainCode: Buffer
  depth: number
  index: number
  parentFingerprint: Buffer
}

export interface DerivationPath {
  purpose: number
  coinType: number
  account: number
  change: number
  addressIndex: number
}

export interface AddressInfo {
  address: string
  publicKey: Buffer
  path: number[]
  index: number
}

export enum CoinType {
  Bitcoin = 0,
  BitcoinTestnet = 1,
  Ethereum = 60,
  Solana = 501,
}

export enum Purpose {
  BIP44 = 44, // Legacy Bitcoin, Ethereum
  BIP49 = 49, // Wrapped SegWit Bitcoin
  BIP84 = 84, // Native SegWit Bitcoin
}

export const HARDENED_OFFSET = 0x80000000

// Standard derivation paths
export const DerivationPaths = {
  // Ethereum
  ETH_DEFAULT: [HARDENED_OFFSET + 44, HARDENED_OFFSET + 60, HARDENED_OFFSET, 0, 0],
  ETH_LEDGER_LIVE: [HARDENED_OFFSET + 44, HARDENED_OFFSET + 60, HARDENED_OFFSET, 0, 0],
  ETH_LEDGER_LEGACY: [HARDENED_OFFSET + 44, HARDENED_OFFSET + 60, HARDENED_OFFSET, 0],

  // Bitcoin
  BTC_LEGACY: [HARDENED_OFFSET + 44, HARDENED_OFFSET + 0, HARDENED_OFFSET, 0, 0],
  BTC_SEGWIT: [HARDENED_OFFSET + 84, HARDENED_OFFSET + 0, HARDENED_OFFSET, 0, 0],
  BTC_WRAPPED_SEGWIT: [HARDENED_OFFSET + 49, HARDENED_OFFSET + 0, HARDENED_OFFSET, 0, 0],

  // Solana
  SOLANA: [HARDENED_OFFSET + 44, HARDENED_OFFSET + 501, HARDENED_OFFSET, HARDENED_OFFSET],
} as const

export interface CryptoOperations {
  // Key derivation
  derivePrivateKey(path: number[], seed?: Buffer): Buffer
  derivePublicKey(path: number[], seed?: Buffer): Buffer
  deriveAddress(path: number[], coinType: CoinType): string

  // Signing
  signTransaction(data: Buffer, privateKey: Buffer, curve: string): Buffer
  signMessage(message: Buffer, privateKey: Buffer, curve: string): Buffer

  // Encryption
  encrypt(data: Buffer, key: Buffer): Buffer
  decrypt(data: Buffer, key: Buffer): Buffer

  // Key management
  generateKeyPair(): { publicKey: Buffer; privateKey: Buffer }
  getSharedSecret(privateKey: Buffer, publicKey: Buffer): Buffer
}
