/**
 * Cryptographic utility functions for Lattice1 Device Simulator
 */

import { createHash, randomBytes } from 'crypto'
import { HARDENED_OFFSET } from '../lib/constants'

/**
 * Generate a random device ID
 */
export function generateDeviceId(): string {
  return randomBytes(16).toString('hex')
}

/**
 * Generate a random key pair (mock implementation)
 */
export function generateKeyPair(): { publicKey: Buffer; privateKey: Buffer } {
  const privateKey = randomBytes(32)
  // Mock public key derivation (in real implementation, use proper EC)
  const publicKey = createHash('sha256').update(privateKey).digest()
  
  return { privateKey, publicKey }
}

/**
 * Parse a derivation path string into an array of numbers
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
 * Format a derivation path array as a string
 */
export function formatDerivationPath(path: number[]): string {
  return 'm/' + path.map(segment => {
    if (segment >= HARDENED_OFFSET) {
      return `${segment - HARDENED_OFFSET}'`
    }
    return segment.toString()
  }).join('/')
}

/**
 * Check if a path segment is hardened
 */
export function isHardened(segment: number): boolean {
  return segment >= HARDENED_OFFSET
}

/**
 * Get the unhardened value of a path segment
 */
export function getUnhardenedValue(segment: number): number {
  return segment >= HARDENED_OFFSET ? segment - HARDENED_OFFSET : segment
}

/**
 * Validate an Ethereum address
 */
export function isValidEthereumAddress(address: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(address)
}

/**
 * Validate a Bitcoin address (simple check)
 */
export function isValidBitcoinAddress(address: string): boolean {
  // Simplified validation - in real implementation use proper address validation
  return /^[13][a-km-zA-HJ-NP-Z1-9]{25,34}$/.test(address) || // Legacy
         /^bc1[a-z0-9]{39,59}$/.test(address) || // Bech32
         /^3[a-km-zA-HJ-NP-Z1-9]{25,34}$/.test(address) // P2SH
}

/**
 * Generate a mock Ethereum address from a public key
 */
export function generateEthereumAddress(publicKey: Buffer): string {
  const hash = createHash('keccak256').update(publicKey.slice(1)).digest()
  return '0x' + hash.slice(-20).toString('hex')
}

/**
 * Generate a mock Bitcoin address from a public key
 */
export function generateBitcoinAddress(publicKey: Buffer, type: 'legacy' | 'segwit' | 'wrapped-segwit' = 'segwit'): string {
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
 * Generate a mock Solana address from a public key
 */
export function generateSolanaAddress(publicKey: Buffer): string {
  // Solana addresses are base58-encoded public keys
  // This is a simplified mock implementation
  return publicKey.toString('base64').slice(0, 44)
}

/**
 * Mock HD key derivation (simplified for simulation)
 */
export function deriveChild(
  parentKey: Buffer,
  parentChainCode: Buffer,
  index: number
): { key: Buffer; chainCode: Buffer } {
  // Simplified mock derivation - in real implementation use proper BIP32
  const data = Buffer.concat([
    parentKey,
    parentChainCode,
    Buffer.from([index >> 24, index >> 16, index >> 8, index])
  ])
  
  const hash = createHash('sha512').update(data).digest()
  
  return {
    key: hash.slice(0, 32),
    chainCode: hash.slice(32)
  }
}

/**
 * Mock signature generation
 */
export function mockSign(data: Buffer, privateKey: Buffer): Buffer {
  // Simplified mock signature - in real implementation use proper ECDSA
  const hash = createHash('sha256').update(Buffer.concat([data, privateKey])).digest()
  
  // Return a 64-byte signature (32 bytes r + 32 bytes s)
  return Buffer.concat([hash, createHash('sha256').update(hash).digest()])
}

/**
 * Generate a deterministic seed from a mnemonic phrase
 */
export function generateSeedFromMnemonic(mnemonic: string): Buffer {
  // Simplified seed generation - in real implementation use proper BIP39
  return createHash('sha512').update(mnemonic).digest()
}

/**
 * Validate a mnemonic phrase (basic check)
 */
export function validateMnemonic(mnemonic: string): boolean {
  const words = mnemonic.trim().split(/\s+/)
  return words.length >= 12 && words.length <= 24 && words.length % 3 === 0
}
