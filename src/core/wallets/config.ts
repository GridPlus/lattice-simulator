/**
 * Wallet Configuration System for Lattice1 Device Simulator
 * Handles mnemonic management and wallet configuration
 */

import { generateMnemonic, mnemonicToSeed } from '@scure/bip39'
import { wordlist } from '@scure/bip39/wordlists/english'
import { SIMULATOR_CONSTANTS } from '../protocol/constants'
import { debug } from '../protocol/debug'

type WalletConfigGlobals = typeof globalThis & {
  __latticeMnemonicOverride?: string
  __latticeSeedOverride?: Uint8Array
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

export interface EnvironmentConfig {
  isCI: boolean
  noDelay: boolean
  autoApprove: boolean
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

export function getWalletSeedOverride(): Uint8Array | undefined {
  return walletConfigGlobals.__latticeSeedOverride
}

export function setWalletSeedOverride(
  seed: Uint8Array | null | undefined,
  mnemonic?: string | null,
): boolean {
  const current = walletConfigGlobals.__latticeSeedOverride

  if (!seed || seed.length === 0) {
    if (current) {
      delete walletConfigGlobals.__latticeSeedOverride
      if (mnemonic !== undefined) {
        setWalletMnemonicOverride(mnemonic)
      }
      return true
    }
    if (mnemonic !== undefined) {
      setWalletMnemonicOverride(mnemonic)
    }
    return false
  }

  const normalized = new Uint8Array(seed)
  let changed = false

  if (!current || current.length !== normalized.length) {
    changed = true
  } else {
    for (let i = 0; i < normalized.length; i++) {
      if (current[i] !== normalized[i]) {
        changed = true
        break
      }
    }
  }

  walletConfigGlobals.__latticeSeedOverride = normalized

  if (mnemonic !== undefined) {
    setWalletMnemonicOverride(mnemonic)
  }

  return changed
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
      debug.wallet('[WalletConfig] Ignoring invalid mnemonic override; clearing value')
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
        debug.wallet('[WalletConfig] Using mnemonic from environment variable')
      } else {
        debug.wallet(
          '[WalletConfig] Invalid mnemonic in environment variable, falling back to default',
        )
      }
    }
  }

  if (!mnemonic) {
    // Use default mnemonic when nothing else is provided
    mnemonic = normalizeMnemonic(SIMULATOR_CONSTANTS.DEFAULT_MNEMONIC)
    source = 'default'
    debug.wallet('[WalletConfig] Using default mnemonic for development')
  }

  // Treat only the baked-in mnemonic as default
  isDefault = source === 'default'

  const seedOverride = getWalletSeedOverride()

  if (seedOverride) {
    debug.wallet('[WalletConfig] Using seed override', { source })
    return {
      mnemonic,
      seed: new Uint8Array(seedOverride),
      isDefault: false,
    }
  }

  // Generate seed from mnemonic (using empty passphrase for simplicity)
  const seed = await mnemonicToSeed(mnemonic, '')

  debug.wallet('[WalletConfig] Derived seed from mnemonic', { source, isDefault })

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
 * Derive a seed from a provided mnemonic without mutating global overrides.
 */
export async function deriveSeedFromMnemonic(mnemonic: string): Promise<Uint8Array> {
  const normalized = normalizeMnemonic(mnemonic)
  return mnemonicToSeed(normalized, '')
}

/**
 * Gets environment configuration for CI, delays, and auto-approval
 *
 * @returns EnvironmentConfig object with CI detection and behavior settings
 */
export function getEnvironmentConfig(): EnvironmentConfig {
  const isSet = (value?: string) => ['1', 'true', 'yes'].includes(value?.toLowerCase() || '0')

  // Detect CI environment
  const isCI =
    isSet(process.env.CI) ||
    isSet(process.env.GITHUB_ACTIONS) ||
    isSet(process.env.TRAVIS) ||
    isSet(process.env.CIRCLECI)

  // NO_DELAY: explicit setting OR default to true in CI
  const noDelay = isSet(process.env.NO_DELAY) || (!isSet(process.env.NO_DELAY) && isCI)

  // LATTICE_AUTO_APPROVE: explicit setting OR default to true in CI
  const autoApprove =
    isSet(process.env.LATTICE_AUTO_APPROVE) || (!isSet(process.env.LATTICE_AUTO_APPROVE) && isCI)

  return {
    isCI,
    noDelay,
    autoApprove,
  }
}

/**
 * Gets comprehensive environment information including all relevant env vars
 *
 * @returns Object with all environment variable information
 */
export function getEnv(): {
  envVars: string[]
  hasEnvMnemonic: boolean
  envMnemonicSource?: string
  isCI: boolean
  noDelay: boolean
  autoApprove: boolean
  ciDetectedFrom: string[]
} {
  const mnemonicInfo = getMnemonicEnvInfo()
  const envConfig = getEnvironmentConfig()

  // Track which CI indicators were detected
  const ciDetectedFrom: string[] = []
  if (process.env.CI === '1') ciDetectedFrom.push('CI=1')
  if (process.env.GITHUB_ACTIONS === 'true') ciDetectedFrom.push('GITHUB_ACTIONS=true')
  if (process.env.TRAVIS === 'true') ciDetectedFrom.push('TRAVIS=true')
  if (process.env.CIRCLECI === 'true') ciDetectedFrom.push('CIRCLECI=true')

  return {
    ...mnemonicInfo,
    ...envConfig,
    ciDetectedFrom,
  }
}

/**
 * Gets mnemonic-related environment variable configuration info
 *
 * @returns Object with mnemonic environment variable names and their status
 */
export function getMnemonicEnvInfo(): {
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
  const envInfo = getEnv()

  debug.wallet('[WalletConfig] Configuration Status:')
  debug.wallet(`  - Using ${config.isDefault ? 'default' : 'environment'} mnemonic`)
  debug.wallet(`  - Environment variables checked: ${envInfo.envVars.join(', ')}`)
  debug.wallet(`  - CI Environment: ${envInfo.isCI ? 'Yes' : 'No'}`)
  debug.wallet(`  - No Delay: ${envInfo.noDelay ? 'Yes' : 'No'}`)
  debug.wallet(`  - Auto Approve: ${envInfo.autoApprove ? 'Yes' : 'No'}`)

  if (envInfo.hasEnvMnemonic) {
    debug.wallet(`  - Environment mnemonic source: ${envInfo.envMnemonicSource}`)
  }

  if (envInfo.isCI && envInfo.ciDetectedFrom.length > 0) {
    debug.wallet(`  - CI detected from: ${envInfo.ciDetectedFrom.join(', ')}`)
  }

  if (config.isDefault) {
    debug.wallet('  - ⚠️  Using default development mnemonic. Set LATTICE_MNEMONIC for production.')
  }
}
