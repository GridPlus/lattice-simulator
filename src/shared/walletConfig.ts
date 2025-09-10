/**
 * Wallet Configuration System for Lattice1 Device Simulator
 * Handles mnemonic management and wallet configuration
 */

import {
  validateMnemonic as validateBip39Mnemonic,
  generateMnemonic,
  mnemonicToSeed,
} from '@scure/bip39'
import { wordlist } from '@scure/bip39/wordlists/english'
import { SIMULATOR_CONSTANTS } from './constants'

export interface WalletConfig {
  mnemonic: string
  seed: Uint8Array
  isDefault: boolean
}

/**
 * Validates a mnemonic phrase using proper BIP39 validation
 *
 * @param mnemonic - The mnemonic phrase to validate
 * @returns True if the mnemonic is valid
 */
export function validateMnemonic(mnemonic: string): boolean {
  try {
    return validateBip39Mnemonic(mnemonic, wordlist)
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
  let mnemonic: string
  let isDefault = false

  // Check for mnemonic in environment variables
  const envMnemonic = process.env.LATTICE_MNEMONIC || process.env.WALLET_MNEMONIC

  if (envMnemonic) {
    // Validate the environment mnemonic
    if (validateMnemonic(envMnemonic)) {
      mnemonic = envMnemonic
      console.log('[WalletConfig] Using mnemonic from environment variable')
    } else {
      console.warn(
        '[WalletConfig] Invalid mnemonic in environment variable, falling back to default',
      )
      mnemonic = SIMULATOR_CONSTANTS.DEFAULT_MNEMONIC
      isDefault = true
    }
  } else {
    // Use default mnemonic
    mnemonic = SIMULATOR_CONSTANTS.DEFAULT_MNEMONIC
    isDefault = true
    console.log('[WalletConfig] Using default mnemonic for development')
  }

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
