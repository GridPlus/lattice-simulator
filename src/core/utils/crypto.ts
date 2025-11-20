/**
 * Cryptographic utility functions for Lattice1 Device Simulator
 */

import { createHash, randomBytes } from 'crypto'
import aes from 'aes-js'
import { ec as EC } from 'elliptic'
import { keccak256 } from 'viem/utils'
import { HARDENED_OFFSET } from '../constants'
import { ProtocolConstants } from '../types'

/**
 * Generates a random device ID
 *
 * Creates a unique 16-byte hexadecimal device identifier
 * for simulator instances.
 *
 * @returns Random device ID string
 */
export function generateDeviceId(): string {
  return randomBytes(16).toString('hex')
}

/**
 * Generates a proper p256 key pair
 *
 * Creates a real p256 private key and derives the corresponding
 * public key using elliptic curve cryptography.
 *
 * @returns Object containing public and private key buffers
 */
export function generateKeyPair(): { publicKey: Buffer; privateKey: Buffer } {
  const ec = new EC('p256')

  // Generate a proper p256 keypair
  const keyPair = ec.genKeyPair()

  // Get the private key as a 32-byte buffer
  const privateKey = Buffer.from(keyPair.getPrivate().toArray('be', 32))

  // Get the uncompressed public key as a 65-byte buffer (04 + X + Y)
  // Note: false = uncompressed format (65 bytes), true = compressed format (33 bytes)
  const publicKey = Buffer.from(keyPair.getPublic().encode('hex', false), 'hex')

  return { privateKey, publicKey }
}

/**
 * Parses a derivation path string into an array of numbers
 *
 * Converts BIP-32 path notation (e.g., "m/44'/60'/0'/0/0") into
 * numeric array with hardened offset applied.
 *
 * @param path - BIP-32 derivation path string starting with "m/"
 * @returns Array of path segment numbers with hardened offset
 * @throws {Error} When path format is invalid
 */
export function parseDerivationPath(path: string): number[] {
  if (!path.startsWith('m/')) {
    throw new Error('Derivation path must start with "m/"')
  }

  return path
    .slice(2) // Remove 'm/'
    .split('/')
    .map(segment => {
      const isHardened = segment.endsWith("'") || segment.endsWith('h')
      const index = parseInt(isHardened ? segment.slice(0, -1) : segment, 10)

      if (isNaN(index) || index < 0) {
        throw new Error(`Invalid path segment: ${segment}`)
      }

      return isHardened ? HARDENED_OFFSET + index : index
    })
}

/**
 * Formats a derivation path array as a string
 *
 * Converts numeric path array back to BIP-32 notation with
 * proper hardened notation (').
 *
 * @param path - Array of path segment numbers
 * @returns BIP-32 formatted path string
 */
export function formatDerivationPath(path: number[]): string {
  return (
    'm/' +
    path
      .map(segment => {
        if (segment >= HARDENED_OFFSET) {
          return `${segment - HARDENED_OFFSET}'`
        }
        return segment.toString()
      })
      .join('/')
  )
}

/**
 * Checks if a path segment is hardened
 *
 * Determines if a path segment uses hardened derivation based
 * on the hardened offset value.
 *
 * @param segment - Path segment number
 * @returns True if segment is hardened
 */
export function isHardened(segment: number): boolean {
  return segment >= HARDENED_OFFSET
}

/**
 * Gets the unhardened value of a path segment
 *
 * Removes the hardened offset to get the base segment value.
 *
 * @param segment - Path segment number (possibly hardened)
 * @returns Unhardened segment value
 */
export function getUnhardenedValue(segment: number): number {
  return segment >= HARDENED_OFFSET ? segment - HARDENED_OFFSET : segment
}

/**
 * Validates an Ethereum address
 *
 * Checks if the provided string is a valid Ethereum address
 * in hexadecimal format with 0x prefix.
 *
 * @param address - Address string to validate
 * @returns True if address format is valid
 */
export function isValidEthereumAddress(address: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(address)
}

/**
 * Validates a Bitcoin address (simple check)
 *
 * Performs basic format validation for Bitcoin addresses.
 * Supports legacy, P2SH, and bech32 formats.
 *
 * @param address - Address string to validate
 * @returns True if address format is valid
 */
export function isValidBitcoinAddress(address: string): boolean {
  // Simplified validation - in real implementation use proper address validation
  return (
    /^[13][a-km-zA-HJ-NP-Z1-9]{25,34}$/.test(address) || // Legacy
    /^bc1[a-z0-9]{39,59}$/.test(address) || // Bech32
    /^3[a-km-zA-HJ-NP-Z1-9]{25,34}$/.test(address)
  ) // P2SH
}

/**
 * Generates a mock Ethereum address from a public key
 *
 * Creates a simulated Ethereum address by hashing the public key.
 * This is a simplified implementation for simulation purposes.
 *
 * @param publicKey - Public key buffer
 * @returns Ethereum address with 0x prefix
 */
export function generateEthereumAddress(publicKey: Buffer): string {
  const hash = Buffer.from(keccak256(publicKey.slice(1)).replace(/^0x/, ''), 'hex')
  return '0x' + hash.slice(-20).toString('hex')
}

/**
 * Generates a mock Bitcoin address from a public key
 *
 * Creates a simulated Bitcoin address in the specified format.
 * This is a simplified implementation for simulation purposes.
 *
 * @param publicKey - Public key buffer
 * @param type - Address type (legacy, segwit, or wrapped-segwit)
 * @returns Bitcoin address string
 * @throws {Error} When address type is unknown
 */
export function generateBitcoinAddress(
  publicKey: Buffer,
  type: 'legacy' | 'segwit' | 'wrapped-segwit' = 'segwit',
): string {
  const hash = createHash('sha256').update(publicKey).digest()
  const shortHash = hash.slice(0, 20)

  switch (type) {
    case 'legacy':
      return '1' + shortHash.toString('hex').slice(0, 25)
    case 'segwit':
      return 'bc1' + shortHash.toString('hex').slice(0, 32)
    case 'wrapped-segwit':
      return '3' + shortHash.toString('hex').slice(0, 25)
    default:
      throw new Error(`Unknown Bitcoin address type: ${type}`)
  }
}

/**
 * Generates a mock Solana address from a public key
 *
 * Creates a simulated Solana address from the public key.
 * This is a simplified implementation for simulation purposes.
 *
 * @param publicKey - Public key buffer
 * @returns Base64-encoded Solana address
 */
export function generateSolanaAddress(publicKey: Buffer): string {
  // Solana addresses are base58-encoded public keys
  // This is a simplified mock implementation
  return publicKey.toString('base64').slice(0, 44)
}

/**
 * Performs mock HD key derivation (simplified for simulation)
 *
 * Derives a child key and chain code from parent values.
 * This is a simplified implementation for simulation purposes.
 *
 * @param parentKey - Parent private key
 * @param parentChainCode - Parent chain code
 * @param index - Child key index
 * @returns Object with derived key and chain code
 */
export function deriveChild(
  parentKey: Buffer,
  parentChainCode: Buffer,
  index: number,
): { key: Buffer; chainCode: Buffer } {
  // Simplified mock derivation - in real implementation use proper BIP32
  const data = Buffer.concat([
    parentKey,
    parentChainCode,
    Buffer.from([index >> 24, index >> 16, index >> 8, index]),
  ])

  const hash = createHash('sha512').update(data).digest()

  return {
    key: hash.slice(0, 32),
    chainCode: hash.slice(32),
  }
}

/**
 * Generates mock signature
 *
 * Creates a deterministic signature for simulation purposes.
 * This is not cryptographically secure and should only be used for testing.
 *
 * @param data - Data to sign
 * @param privateKey - Private key for signing
 * @returns 64-byte signature buffer (32 bytes r + 32 bytes s)
 */
export function mockSign(data: Buffer, privateKey: Buffer): Buffer {
  // Simplified mock signature - in real implementation use proper ECDSA
  const hash = createHash('sha256')
    .update(Buffer.concat([data, privateKey]))
    .digest()

  // Return a 64-byte signature (32 bytes r + 32 bytes s)
  return Buffer.concat([hash, createHash('sha256').update(hash).digest()])
}

/**
 * Generates a deterministic seed from a mnemonic phrase
 *
 * Creates a seed from a BIP-39 mnemonic phrase for HD wallet derivation.
 * This is a simplified implementation for simulation purposes.
 *
 * @param mnemonic - BIP-39 mnemonic phrase
 * @returns 64-byte seed buffer
 */
export function generateSeedFromMnemonic(mnemonic: string): Buffer {
  // Simplified seed generation - in real implementation use proper BIP39
  return createHash('sha512').update(mnemonic).digest()
}

/**
 * Validates a mnemonic phrase (basic check)
 *
 * Performs basic validation of BIP-39 mnemonic phrase format.
 * Checks word count and divisibility by 3.
 *
 * @param mnemonic - Mnemonic phrase to validate
 * @returns True if mnemonic format appears valid
 */
export function validateMnemonic(mnemonic: string): boolean {
  const words = mnemonic.trim().split(/\s+/)
  return words.length >= 12 && words.length <= 24 && words.length % 3 === 0
}

/**
 * AES-256-CBC decryption function
 *
 * Decrypts data using AES-256 in CBC mode with the standard IV used by GridPlus.
 * This matches the decryption used in the GridPlus SDK.
 *
 * @param data - Encrypted data buffer to decrypt
 * @param key - 32-byte AES key (shared secret)
 * @returns Decrypted data buffer
 */
export function aes256_decrypt(data: Buffer, key: Buffer): Buffer {
  const iv = Buffer.from(ProtocolConstants.aesIv)
  const aesCbc = new aes.ModeOfOperation.cbc(key, iv)
  return Buffer.from(aesCbc.decrypt(data))
}

/**
 * AES-256-CBC encryption function
 *
 * Encrypts data using AES-256 in CBC mode with the standard IV used by GridPlus.
 * This matches the encryption used in the GridPlus SDK.
 *
 * @param data - Data buffer to encrypt
 * @param key - 32-byte AES key (shared secret)
 * @returns Encrypted data buffer
 */
export function aes256_encrypt(data: Buffer, key: Buffer): Buffer {
  // Use the same IV as GridPlus SDK: 16 bytes of zeros
  const iv = Buffer.from(ProtocolConstants.aesIv)
  const aesCbc = new aes.ModeOfOperation.cbc(key, iv)
  const paddedData = data.length % 16 === 0 ? data : aes.padding.pkcs7.pad(data)
  return Buffer.from(aesCbc.encrypt(paddedData))
}
