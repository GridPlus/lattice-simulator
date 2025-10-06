/**
 * HD Wallet Derivation Utilities for Lattice1 Device Simulator
 * Implements proper BIP-32/BIP-44 hierarchical deterministic wallet derivation
 */

import { HDKey } from '@scure/bip32'
import { HARDENED_OFFSET } from '../constants'
import { getWalletConfig } from '../walletConfig'
import type { WalletCoinType } from '../types/wallet'

/**
 * Standard BIP-44 derivation paths for supported coins
 */
export const BIP44_DERIVATION_PATHS = {
  ETH: {
    purpose: 44,
    coinType: 60,
    account: 0,
    change: 0, // 0 = external (receiving), 1 = internal (change)
  },
  BTC: {
    purpose: 44, // Can also be 49 (P2SH-P2WPKH) or 84 (P2WPKH)
    coinType: 0,
    account: 0,
    change: 0,
  },
  SOL: {
    purpose: 44,
    coinType: 501,
    account: 0,
    change: 0,
  },
} as const

/**
 * Bitcoin address type specific purposes
 */
export const BTC_PURPOSES = {
  legacy: 44, // P2PKH
  segwit: 84, // P2WPKH (native segwit)
  wrappedSegwit: 49, // P2SH-P2WPKH (wrapped segwit)
} as const

/**
 * Generates a BIP-44 derivation path array
 *
 * @param coinType - Cryptocurrency type
 * @param accountIndex - Account index (0, 1, 2, ...)
 * @param isInternal - Whether this is an internal (change) address
 * @param addressType - Bitcoin address type (optional, defaults to legacy)
 * @returns Derivation path as number array with hardened values
 */
export function generateDerivationPath(
  coinType: WalletCoinType,
  accountIndex: number = 0,
  isInternal: boolean = false,
  addressIndex: number = 0,
  addressType: 'legacy' | 'segwit' | 'wrappedSegwit' = 'legacy',
): number[] {
  const paths = BIP44_DERIVATION_PATHS[coinType]

  let purpose: number = paths.purpose

  // Use specific purpose for Bitcoin address types
  if (coinType === 'BTC') {
    switch (addressType) {
      case 'segwit':
        purpose = BTC_PURPOSES.segwit
        break
      case 'wrappedSegwit':
        purpose = BTC_PURPOSES.wrappedSegwit
        break
      default:
        purpose = BTC_PURPOSES.legacy
    }
  }

  // Validate input range first
  if (accountIndex < 0 || accountIndex > 2 * HARDENED_OFFSET - 1) {
    throw new Error(
      `Invalid account index: ${accountIndex}. Account index should be between 0 and ${HARDENED_OFFSET - 1}, or between ${HARDENED_OFFSET} and ${2 * HARDENED_OFFSET - 1} for hardened indices.`,
    )
  }

  // Normalize accountIndex: if it already has hardened offset, remove it to get logical index
  const logicalAccountIndex =
    accountIndex >= HARDENED_OFFSET ? accountIndex - HARDENED_OFFSET : accountIndex

  return [
    HARDENED_OFFSET + purpose, // Purpose (44', 49', 84')
    HARDENED_OFFSET + paths.coinType, // Coin type (0', 60', 501')
    HARDENED_OFFSET + logicalAccountIndex, // Account (0', 1', 2', ...)
    isInternal ? 1 : 0, // Change (0 = external, 1 = internal)
    addressIndex, // Address index (0, 1, 2, ...)
  ]
}

/**
 * Formats a derivation path array as a BIP-44 string
 *
 * @param path - Derivation path as number array
 * @returns BIP-44 formatted string (e.g., "m/44'/60'/0'/0/0")
 */
export function formatDerivationPath(path: number[]): string {
  const segments = path.map(segment => {
    if (segment >= HARDENED_OFFSET) {
      return `${segment - HARDENED_OFFSET}'`
    }
    return segment.toString()
  })

  return 'm/' + segments.join('/')
}

/**
 * Parses a BIP-44 derivation path string into number array
 *
 * @param pathString - BIP-44 path string (e.g., "m/44'/60'/0'/0/0")
 * @returns Derivation path as number array
 */
export function parseDerivationPath(pathString: string): number[] {
  if (!pathString.startsWith('m/')) {
    throw new Error('Derivation path must start with "m/"')
  }

  const segments = pathString.slice(2).split('/')

  return segments.map(segment => {
    const isHardened = segment.endsWith("'") || segment.endsWith('h')
    const value = parseInt(isHardened ? segment.slice(0, -1) : segment, 10)

    if (isNaN(value) || value < 0) {
      throw new Error(`Invalid path segment: ${segment}`)
    }

    return isHardened ? HARDENED_OFFSET + value : value
  })
}

/**
 * Derives HD key from master seed using derivation path
 *
 * @param seed - Master seed (from mnemonic)
 * @param derivationPath - BIP-44 derivation path
 * @returns Derived HDKey instance
 */
export function deriveHDKey(seed: Uint8Array, derivationPath: number[]): HDKey {
  // Create master key from seed
  const masterKey = HDKey.fromMasterSeed(seed)

  // Derive child key using path
  const pathString = formatDerivationPath(derivationPath)
  return masterKey.derive(pathString)
}

/**
 * Derives HD key from master seed using derivation path string
 *
 * @param seed - Master seed (from mnemonic)
 * @param pathString - BIP-44 path string (e.g., "m/44'/60'/0'/0/0")
 * @returns Derived HDKey instance
 */
export function deriveHDKeyFromPath(seed: Uint8Array, pathString: string): HDKey {
  const path = parseDerivationPath(pathString)
  return deriveHDKey(seed, path)
}

/**
 * Gets the master HD key from the current wallet configuration
 *
 * @returns Promise<HDKey> - Master HD key from current mnemonic
 */
export async function getMasterHDKey(): Promise<HDKey> {
  const config = await getWalletConfig()
  return HDKey.fromMasterSeed(config.seed)
}

/**
 * Derives multiple addresses from a base path
 *
 * @param coinType - Cryptocurrency type
 * @param accountIndex - Account index
 * @param isInternal - Whether to derive internal (change) addresses
 * @param count - Number of addresses to derive
 * @param startIndex - Starting address index (default: 0)
 * @param addressType - Bitcoin address type (optional)
 * @returns Promise<Array> of derived HDKey instances
 */
export async function deriveMultipleKeys(
  coinType: WalletCoinType,
  accountIndex: number = 0,
  isInternal: boolean = false,
  count: number = 1,
  startIndex: number = 0,
  addressType: 'legacy' | 'segwit' | 'wrappedSegwit' = 'legacy',
): Promise<HDKey[]> {
  const config = await getWalletConfig()
  const masterKey = HDKey.fromMasterSeed(config.seed)

  // Generate base derivation path (without final address index)
  const basePath = generateDerivationPath(coinType, accountIndex, isInternal, 0, addressType)
  basePath.pop() // Remove the address index (0)

  // Derive to the base path
  const basePathString = formatDerivationPath(basePath)
  const baseKey = masterKey.derive(basePathString)

  // Generate multiple addresses
  const keys: HDKey[] = []
  for (let i = 0; i < count; i++) {
    const addressIndex = startIndex + i
    const addressKey = baseKey.deriveChild(addressIndex)
    keys.push(addressKey)
  }

  return keys
}

/**
 * Gets derivation info for debugging purposes
 *
 * @param coinType - Cryptocurrency type
 * @param accountIndex - Account index
 * @param isInternal - Whether this is internal
 * @param addressType - Bitcoin address type
 * @returns Derivation info object
 */
export function getDerivationInfo(
  coinType: WalletCoinType,
  accountIndex: number = 0,
  isInternal: boolean = false,
  addressIndex: number = 0,
  addressType: 'legacy' | 'segwit' | 'wrappedSegwit' = 'legacy',
) {
  const path = generateDerivationPath(coinType, accountIndex, isInternal, addressIndex, addressType)
  const pathString = formatDerivationPath(path)
  const config = BIP44_DERIVATION_PATHS[coinType]

  return {
    coinType,
    accountIndex,
    isInternal,
    addressType: coinType === 'BTC' ? addressType : undefined,
    derivationPath: path,
    derivationPathString: pathString,
    purpose:
      coinType === 'BTC'
        ? addressType === 'segwit'
          ? BTC_PURPOSES.segwit
          : addressType === 'wrappedSegwit'
            ? BTC_PURPOSES.wrappedSegwit
            : BTC_PURPOSES.legacy
        : config.purpose,
    coinTypeValue: config.coinType,
  }
}

/**
 * Validates a derivation path
 *
 * @param path - Derivation path to validate
 * @returns Validation result with error message if invalid
 */
export function validateDerivationPath(path: number[]): { valid: boolean; error?: string } {
  if (path.length === 0) {
    return { valid: false, error: 'Path must contain at least one segment' }
  }

  if (path.length > 6) {
    return { valid: false, error: 'Path is too long (max 6 segments)' }
  }

  return { valid: true }
}
