/**
 * Wallet Configuration System for Lattice1 Device Simulator
 * Handles mnemonic management and wallet configuration
 */

import { generateMnemonic, mnemonicToSeed } from '@scure/bip39'
import { wordlist } from '@scure/bip39/wordlists/english'
import { SIMULATOR_CONSTANTS } from './constants'

type WalletConfigGlobals = typeof globalThis & {
  __latticeMnemonicOverride?: string
}

const walletConfigGlobals = globalThis as WalletConfigGlobals

/**
 * Normalizes mnemonic formatting (trim spaces, collapse whitespace, lowercase)
 */
export function normalizeMnemonic(mnemonic: string): string {
  return mnemonic.trim().toLowerCase().replace(/\s+/g, ' ')
}

const WORDLIST_SET = new Set(wordlist)

export interface WalletConfig {
  mnemonic: string
  seed: Uint8Array
  isDefault: boolean
}

/**
 * Returns the currently configured mnemonic override, if any
 */
export function getWalletMnemonicOverride(): string | undefined {
  return walletConfigGlobals.__latticeMnemonicOverride
}

/**
 * Sets or clears the in-memory mnemonic override
 *
 * @param mnemonic - Mnemonic to set, or null/undefined to clear
 * @returns True if the override value changed
 */
export function setWalletMnemonicOverride(mnemonic: string | null | undefined): boolean {
  const normalized =
    typeof mnemonic === 'string' && mnemonic.trim().length > 0
      ? normalizeMnemonic(mnemonic)
      : undefined
  const current = walletConfigGlobals.__latticeMnemonicOverride

  if (!normalized) {
    if (current !== undefined) {
      delete walletConfigGlobals.__latticeMnemonicOverride
      return true
    }
    return false
  }

  if (current === normalized) {
    return false
  }

  walletConfigGlobals.__latticeMnemonicOverride = normalized
  return true
}

/**
 * Validates a mnemonic phrase using proper BIP39 validation
 *
 * @param mnemonic - The mnemonic phrase to validate
 * @returns True if the mnemonic is valid
 */
export function validateMnemonic(mnemonic: string): boolean {
  try {
    const normalized = normalizeMnemonic(mnemonic)
    if (!normalized) {
      return false
    }
    const words = normalized.split(' ')
    if (!(words.length === 12 || words.length === 24)) {
      return false
    }

    return words.every(word => WORDLIST_SET.has(word))
  } catch {
    return false
  }
}

/**
 * Gets the wallet configuration with mnemonic from environment or default
 *
 * @returns Promise<WalletConfig> object with mnemonic and derived seed
 */
export async function getWalletConfig(): Promise<WalletConfig> {
  let mnemonic: string | undefined
  let isDefault = false
  let source: 'override' | 'environment' | 'default' = 'default'

  // Prefer an explicit runtime override
  const overrideMnemonic = getWalletMnemonicOverride()
  if (overrideMnemonic) {
    if (validateMnemonic(overrideMnemonic)) {
      mnemonic = overrideMnemonic
      source = 'override'
    } else {
      console.warn('[WalletConfig] Ignoring invalid mnemonic override; clearing value')
      setWalletMnemonicOverride(null)
    }
  }

  if (!mnemonic) {
    // Check for mnemonic in environment variables
    const envMnemonicRaw = process.env.LATTICE_MNEMONIC || process.env.WALLET_MNEMONIC

    if (envMnemonicRaw) {
      const envMnemonic = normalizeMnemonic(envMnemonicRaw)

      if (validateMnemonic(envMnemonic)) {
        mnemonic = envMnemonic
        source = 'environment'
        console.log('[WalletConfig] Using mnemonic from environment variable')
      } else {
        console.warn(
          '[WalletConfig] Invalid mnemonic in environment variable, falling back to default',
        )
      }
    }
  }

  if (!mnemonic) {
    // Use default mnemonic when nothing else is provided
    mnemonic = normalizeMnemonic(SIMULATOR_CONSTANTS.DEFAULT_MNEMONIC)
    source = 'default'
    console.log('[WalletConfig] Using default mnemonic for development')
  }

  // Treat only the baked-in mnemonic as default
  isDefault = source === 'default'

  // Generate seed from mnemonic (using empty passphrase for simplicity)
  const seed = await mnemonicToSeed(mnemonic, '')

  return {
    mnemonic,
    seed,
    isDefault,
  }
}

/**
 * Generates a new random 24-word mnemonic
 *
 * @returns A new BIP39 mnemonic phrase
 */
export function generateNewMnemonic(): string {
  return generateMnemonic(wordlist, 256) // 256 bits = 24 words
}

/**
 * Gets environment variable configuration info
 *
 * @returns Object with environment variable names and their status
 */
export function getEnvInfo(): {
  envVars: string[]
  hasEnvMnemonic: boolean
  envMnemonicSource?: string
} {
  const envVars = ['LATTICE_MNEMONIC', 'WALLET_MNEMONIC']
  const latticeEnv = process.env.LATTICE_MNEMONIC
  const walletEnv = process.env.WALLET_MNEMONIC

  let hasEnvMnemonic = false
  let envMnemonicSource: string | undefined

  if (latticeEnv) {
    hasEnvMnemonic = true
    envMnemonicSource = 'LATTICE_MNEMONIC'
  } else if (walletEnv) {
    hasEnvMnemonic = true
    envMnemonicSource = 'WALLET_MNEMONIC'
  }

  return {
    envVars,
    hasEnvMnemonic,
    envMnemonicSource,
  }
}

/**
 * Logs wallet configuration status for debugging
 */
export async function logWalletConfigStatus(): Promise<void> {
  const config = await getWalletConfig()
  const envInfo = getEnvInfo()

  console.log('[WalletConfig] Configuration Status:')
  console.log(`  - Using ${config.isDefault ? 'default' : 'environment'} mnemonic`)
  console.log(`  - Environment variables checked: ${envInfo.envVars.join(', ')}`)

  if (envInfo.hasEnvMnemonic) {
    console.log(`  - Environment mnemonic source: ${envInfo.envMnemonicSource}`)
  }

  if (config.isDefault) {
    console.log('  - ⚠️  Using default development mnemonic. Set LATTICE_MNEMONIC for production.')
  }
}
