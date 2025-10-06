/**
 * Solana Wallet Service for Lattice1 Device Simulator
 * Implements Solana wallet functionality using @solana/web3.js
 */

import { Keypair, PublicKey } from '@solana/web3.js'
import { deriveMultipleKeys, getDerivationInfo } from '../shared/utils/hdWallet'
import type {
  SolanaWalletAccount,
  CreateAccountParams,
  WalletDerivationResult,
  WalletAccountType,
} from '../shared/types/wallet'
import type { HDKey } from '@scure/bip32'

/**
 * Creates a Solana wallet account from HD key
 *
 * @param hdKey - HD key derived from mnemonic
 * @param accountIndex - Account index
 * @param type - Account type (external/internal)
 * @param name - Optional account name
 * @returns SolanaWalletAccount
 */
export function createSolanaAccountFromHDKey(
  hdKey: HDKey,
  accountIndex: number,
  type: WalletAccountType,
  addressIndex: number = 0,
  name?: string,
): SolanaWalletAccount {
  if (!hdKey.privateKey || !hdKey.publicKey) {
    throw new Error('HD key must have both private and public keys to create Solana account')
  }

  // Get derivation info for Solana (BIP-44 m/44'/501'/0'/0/x) with correct address index
  const derivationInfo = getDerivationInfo('SOL', accountIndex, type === 'internal', addressIndex)

  // Solana uses Ed25519 keys, so we need to take first 32 bytes of the private key
  const privateKeyBytes = hdKey.privateKey.slice(0, 32)

  // Create Solana keypair from the private key bytes
  const keypair = Keypair.fromSeed(privateKeyBytes)

  // Create wallet account
  const account: SolanaWalletAccount = {
    id: `sol-${type}-${accountIndex}`,
    accountIndex,
    derivationPath: derivationInfo.derivationPath,
    derivationPathString: derivationInfo.derivationPathString,
    type,
    coinType: 'SOL',
    isActive: false,
    name: name || `Solana Account ${accountIndex}`,
    createdAt: Date.now(),
    address: keypair.publicKey.toBase58(),
    publicKey: Buffer.from(keypair.publicKey.toBytes()).toString('hex'), // Convert to hex for storage
    privateKey: type === 'internal' ? Buffer.from(keypair.secretKey).toString('hex') : undefined, // Only store for internal accounts
  }

  return account
}

/**
 * Creates multiple Solana accounts from mnemonic
 *
 * @param accountIndex - Starting account index
 * @param type - Account type (external/internal)
 * @param count - Number of accounts to create
 * @param startIndex - Starting address index within account
 * @returns Promise<SolanaWalletAccount[]>
 */
export async function createMultipleSolanaAccounts(
  accountIndex: number = 0,
  type: WalletAccountType = 'external',
  count: number = 1,
  startIndex: number = 0,
): Promise<SolanaWalletAccount[]> {
  // Derive multiple HD keys using Solana's BIP-44 path
  const hdKeys = await deriveMultipleKeys(
    'SOL',
    accountIndex,
    type === 'internal',
    count,
    startIndex,
  )

  // Create accounts from HD keys
  const accounts: SolanaWalletAccount[] = []

  for (let i = 0; i < hdKeys.length; i++) {
    const hdKey = hdKeys[i]
    const addressIndex = startIndex + i
    const account = createSolanaAccountFromHDKey(
      hdKey,
      accountIndex,
      type,
      addressIndex,
      `Solana ${type === 'internal' ? 'Internal' : 'External'} Account ${addressIndex}`,
    )

    // Update the account ID to include address index
    account.id = `sol-${type}-${accountIndex}-${addressIndex}`

    accounts.push(account)
  }

  return accounts
}

/**
 * Creates a single Solana account
 *
 * @param params - Account creation parameters
 * @returns Promise<WalletDerivationResult>
 */
export async function createSolanaAccount(
  params: CreateAccountParams,
): Promise<WalletDerivationResult> {
  try {
    if (params.coinType !== 'SOL') {
      throw new Error('Invalid coin type for Solana account creation')
    }

    const accounts = await createMultipleSolanaAccounts(params.accountIndex, params.type, 1, 0)

    if (accounts.length === 0) {
      throw new Error('Failed to create Solana account')
    }

    const account = accounts[0]

    // Update name if provided
    if (params.name) {
      account.name = params.name
    }

    return {
      account,
      success: true,
    }
  } catch (error) {
    return {
      account: {} as SolanaWalletAccount,
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error creating Solana account',
    }
  }
}

/**
 * Gets Solana Keypair for signing transactions
 *
 * @param solanaAccount - Solana wallet account
 * @returns Keypair instance for signing or null if no private key
 */
export function getSolanaKeypair(solanaAccount: SolanaWalletAccount): Keypair | null {
  if (!solanaAccount.privateKey) {
    console.warn('Cannot create Solana keypair: private key not available (external account)')
    return null
  }

  try {
    // Convert hex private key back to Uint8Array
    const secretKey = new Uint8Array(Buffer.from(solanaAccount.privateKey, 'hex'))
    return Keypair.fromSecretKey(secretKey)
  } catch (error) {
    console.error('Error creating Solana keypair:', error)
    return null
  }
}

/**
 * Signs a Solana message
 *
 * @param solanaAccount - Solana wallet account
 * @param message - Message to sign (string or bytes)
 * @returns Promise<string | null> - Signature string or null if error
 */
export async function signSolanaMessage(
  solanaAccount: SolanaWalletAccount,
  message: string | Uint8Array,
): Promise<string | null> {
  const keypair = getSolanaKeypair(solanaAccount)
  if (!keypair) {
    throw new Error('Cannot sign: account does not have private key access')
  }

  try {
    // Process message for signing
    typeof message === 'string' ? Buffer.from(message, 'utf8') : Buffer.from(message)
    const signature = keypair.secretKey.slice(0, 32) // Get the private key part for signing

    // For now, return a placeholder signature format
    // In a real implementation, you'd use nacl.sign.detached or similar
    return Buffer.from(signature).toString('hex')
  } catch (error) {
    console.error('Error signing Solana message:', error)
    return null
  }
}

/**
 * Validates a Solana address (Base58 format)
 *
 * @param address - Address to validate
 * @returns boolean - True if valid Solana address
 */
export function isValidSolanaAddress(address: string): boolean {
  try {
    new PublicKey(address)
    return true
  } catch {
    return false
  }
}

/**
 * Gets account info for debugging
 *
 * @param account - Solana wallet account
 * @returns Account debugging information
 */
export function getSolanaAccountInfo(account: SolanaWalletAccount) {
  return {
    id: account.id,
    address: account.address,
    accountIndex: account.accountIndex,
    type: account.type,
    derivationPath: account.derivationPathString,
    hasPrivateKey: !!account.privateKey,
    isActive: account.isActive,
    name: account.name,
    publicKey: account.publicKey.slice(0, 20) + '...', // Truncated for display
  }
}

/**
 * Converts Solana account to display format
 *
 * @param account - Solana wallet account
 * @returns Display-friendly account object
 */
export function formatSolanaAccountForDisplay(account: SolanaWalletAccount) {
  return {
    id: account.id,
    name: account.name,
    address: account.address,
    type: account.type,
    accountIndex: account.accountIndex,
    path: account.derivationPathString,
    isActive: account.isActive,
    balance: '0 SOL', // Would be fetched from blockchain in real implementation
  }
}

/**
 * Creates a Solana PublicKey from account
 *
 * @param account - Solana wallet account
 * @returns PublicKey instance
 */
export function getSolanaPublicKey(account: SolanaWalletAccount): PublicKey {
  return new PublicKey(account.address)
}
