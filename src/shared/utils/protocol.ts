/**
 * Protocol utility functions for Lattice1 Device Simulator
 */

import { randomBytes } from 'crypto'
import {
  LatticeResponseCode,
  LatticeSecureEncryptedRequestType,
  type DeviceResponse,
  type WalletPath,
  type AddressInfo,
  type WalletCoinType,
} from '../types'
import {
  generateEthereumAddress,
  generateBitcoinAddress,
  generateSolanaAddress,
  deriveChild,
  generateSeedFromMnemonic,
} from './crypto'
import { DERIVATION_PATHS, SIMULATOR_CONSTANTS } from '../constants'

/**
 * Generates a unique request ID
 *
 * Creates a random 8-byte hexadecimal identifier for tracking requests.
 *
 * @returns Unique request ID string
 */
export function generateRequestId(): string {
  return randomBytes(8).toString('hex')
}

/**
 * Create a device response object
 */
export function createDeviceResponse<T = any>(
  success: boolean,
  code: LatticeResponseCode,
  data?: T,
  error?: string,
): DeviceResponse<T> {
  return {
    success,
    code,
    data,
    error: error || (success ? undefined : getErrorMessage(code)),
  } as DeviceResponse<T>
}

/**
 * Gets error message for response code
 *
 * Maps Lattice response codes to human-readable error messages.
 *
 * @param code - The Lattice response code
 * @returns Human-readable error message
 */
export function getErrorMessage(code: LatticeResponseCode): string {
  const messages = {
    [LatticeResponseCode.success]: '',
    [LatticeResponseCode.invalidMsg]: 'Invalid Request',
    [LatticeResponseCode.unsupportedVersion]: 'Unsupported Version',
    [LatticeResponseCode.deviceBusy]: 'Device Busy',
    [LatticeResponseCode.userTimeout]: 'Timeout waiting for user',
    [LatticeResponseCode.userDeclined]: 'Request declined by user',
    [LatticeResponseCode.pairFailed]: 'Pairing failed',
    [LatticeResponseCode.pairDisabled]: 'Pairing is currently disabled',
    [LatticeResponseCode.permissionDisabled]: 'Automated signing is currently disabled',
    [LatticeResponseCode.internalError]: 'Device Error',
    [LatticeResponseCode.gceTimeout]: 'Device Timeout',
    [LatticeResponseCode.wrongWallet]: 'Active wallet does not match request',
    [LatticeResponseCode.deviceLocked]: 'Device Locked',
    [LatticeResponseCode.disabled]: 'Feature Disabled',
    [LatticeResponseCode.already]: 'Record already exists on device',
    [LatticeResponseCode.invalidEphemId]: 'Request failed - needs resync',
  }

  return messages[code] || 'Unknown error'
}

/**
 * Validates request type
 *
 * Checks if the provided number is a valid Lattice request type.
 *
 * @param type - Request type number to validate
 * @returns True if request type is valid
 */
export function isValidRequestType(type: number): boolean {
  return Object.values(LatticeSecureEncryptedRequestType).includes(type)
}

/**
 * Gets request type name
 *
 * Converts request type enum value to human-readable string.
 *
 * @param type - The request type enum value
 * @returns Human-readable request type name
 */
export function getRequestTypeName(type: LatticeSecureEncryptedRequestType): string {
  const names = {
    [LatticeSecureEncryptedRequestType.finalizePairing]: 'finalizePairing',
    [LatticeSecureEncryptedRequestType.getAddresses]: 'getAddresses',
    [LatticeSecureEncryptedRequestType.sign]: 'sign',
    [LatticeSecureEncryptedRequestType.getWallets]: 'getWallets',
    [LatticeSecureEncryptedRequestType.getKvRecords]: 'getKvRecords',
    [LatticeSecureEncryptedRequestType.addKvRecords]: 'addKvRecords',
    [LatticeSecureEncryptedRequestType.removeKvRecords]: 'removeKvRecords',
    [LatticeSecureEncryptedRequestType.fetchEncryptedData]: 'fetchEncryptedData',
    [LatticeSecureEncryptedRequestType.test]: 'test',
  }

  return names[type] || 'unknown'
}

/**
 * Simulates delay for realistic device behavior
 *
 * Adds random delay to simulate real hardware response times.
 *
 * @param baseMs - Base delay in milliseconds
 * @param variationMs - Random variation range in milliseconds
 * @returns Promise that resolves after the delay
 */
export async function simulateDelay(
  baseMs: number = 500,
  variationMs: number = 200,
): Promise<void> {
  const delay = baseMs + Math.random() * variationMs
  await new Promise(resolve => setTimeout(resolve, delay))
}

/**
 * Checks if a firmware version supports a feature
 *
 * Compares firmware version against minimum required version for a feature.
 *
 * @param firmwareVersion - Current firmware version buffer
 * @param featureVersion - Minimum required version [major, minor, patch]
 * @returns True if firmware supports the feature
 */
export function supportsFeature(
  firmwareVersion: Buffer,
  featureVersion: [number, number, number],
): boolean {
  if (firmwareVersion.length < 3) return false

  const [fwMajor, fwMinor, fwPatch] = [firmwareVersion[2], firmwareVersion[1], firmwareVersion[0]]

  const [reqMajor, reqMinor, reqPatch] = featureVersion

  if (fwMajor > reqMajor) return true
  if (fwMajor < reqMajor) return false

  if (fwMinor > reqMinor) return true
  if (fwMinor < reqMinor) return false

  return fwPatch >= reqPatch
}

/**
 * Generates mock addresses for a given derivation path
 *
 * Creates cryptocurrency addresses using HD wallet derivation.
 * Supports Ethereum, Bitcoin, and Solana address generation.
 *
 * @param startPath - Starting derivation path
 * @param count - Number of addresses to generate
 * @param coinType - Cryptocurrency type ('ETH', 'BTC', 'SOL')
 * @param seed - Optional seed for deterministic generation
 * @returns Array of address information objects
 */
export function generateMockAddresses(
  startPath: WalletPath,
  count: number,
  coinType: WalletCoinType = 'ETH',
  seed?: Buffer,
): AddressInfo[] {
  const addresses: AddressInfo[] = []
  const masterSeed = seed || generateSeedFromMnemonic(SIMULATOR_CONSTANTS.DEFAULT_MNEMONIC)

  // Derive master key and chain code
  let currentKey = masterSeed.slice(0, 32)
  let currentChainCode = masterSeed.slice(32)

  // Derive to the start path
  for (const segment of startPath.slice(0, -1)) {
    const derived = deriveChild(currentKey, currentChainCode, segment)
    currentKey = Buffer.from(derived.key)
    currentChainCode = Buffer.from(derived.chainCode)
  }

  // Generate addresses
  const baseIndex = startPath[startPath.length - 1]
  for (let i = 0; i < count; i++) {
    const index = baseIndex + i
    const derived = deriveChild(currentKey, currentChainCode, index)
    const publicKey = Buffer.concat([Buffer.from([0x04]), derived.key]) // Uncompressed pubkey

    let address: string
    switch (coinType) {
      case 'ETH':
        address = generateEthereumAddress(publicKey)
        break
      case 'BTC':
        address = generateBitcoinAddress(publicKey, 'segwit')
        break
      case 'SOL':
        address = generateSolanaAddress(publicKey)
        break
      default:
        throw new Error(`Unsupported coin type: ${coinType}`)
    }

    const fullPath = [...startPath.slice(0, -1), index]

    addresses.push({
      address,
      publicKey,
      path: fullPath,
      index,
    })
  }

  return addresses
}

/**
 * Detects coin type from derivation path
 *
 * Analyzes the coin type field in a derivation path to determine
 * the target cryptocurrency.
 *
 * @param path - HD wallet derivation path
 * @returns Detected coin type or 'UNKNOWN'
 */
export function detectCoinTypeFromPath(path: WalletPath): WalletCoinType | 'UNKNOWN' {
  if (path.length < 2) return 'UNKNOWN'

  const coinType = path[1]

  // Check against known coin types (hardened values)
  if (coinType === 0x80000000 + 60) return 'ETH' // ETH
  if (coinType === 0x80000000 + 0) return 'BTC' // BTC
  if (coinType === 0x80000000 + 501) return 'SOL' // SOL

  return 'UNKNOWN'
}

/**
 * Gets standard derivation path for a coin type
 *
 * Returns the standard BIP-44 derivation path for the specified
 * cryptocurrency type.
 *
 * @param coinType - Target cryptocurrency type
 * @param account - Account index (default: 0)
 * @returns Standard derivation path array
 * @throws {Error} When coin type is unsupported
 */
export function getStandardPath(coinType: WalletCoinType, account: number = 0): WalletPath {
  switch (coinType) {
    case 'ETH':
      return [...DERIVATION_PATHS.ETH_DEFAULT.slice(0, -2), account, 0]
    case 'BTC':
      return [...DERIVATION_PATHS.BTC_SEGWIT.slice(0, -2), account, 0]
    case 'SOL':
      return [...DERIVATION_PATHS.SOLANA.slice(0, -1), account]
    default:
      throw new Error(`Unsupported coin type: ${coinType}`)
  }
}

/**
 * Validate derivation path
 */
export function validateDerivationPath(path: WalletPath): boolean {
  if (!Array.isArray(path) || path.length < 3 || path.length > 6) {
    return false
  }

  return path.every(segment => Number.isInteger(segment) && segment >= 0 && segment <= 0xffffffff)
}

/**
 * Format firmware version for display
 */
export function formatFirmwareVersion(version: Buffer): string {
  if (version.length < 3) return 'Unknown'

  return `${version[2]}.${version[1]}.${version[0]}`
}

/**
 * Create a mock transaction hash
 */
export function createMockTransactionHash(): string {
  return '0x' + randomBytes(32).toString('hex')
}

/**
 * Validate Ethereum transaction data
 */
export function validateEthereumTransaction(data: any): boolean {
  const required = ['to', 'value', 'data', 'gasLimit', 'gasPrice']
  return required.every(field => field in data)
}

/**
 * Format bytes for display
 */
export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'

  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))

  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i]
}
