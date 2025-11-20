/**
 * Ethereum Wallet Service for Lattice1 Device Simulator
 * Implements Ethereum wallet functionality using viem library
 */

import { toHex, type Hash, type Hex } from 'viem'
import { privateKeyToAccount, type PrivateKeyAccount } from 'viem/accounts'
import { deriveMultipleKeys, getDerivationInfo } from '../utils/hdWallet'
import type {
  EthereumWalletAccount,
  CreateAccountParams,
  WalletDerivationResult,
  WalletAccountType,
} from '../types/wallet'
import type { HDKey } from '@scure/bip32'

/**
 * Creates an Ethereum wallet account from HD key
 *
 * @param hdKey - HD key derived from mnemonic
 * @param accountIndex - Account index
 * @param type - Account type (external/internal)
 * @param name - Optional account name
 * @returns EthereumWalletAccount
 */
export function createEthereumAccountFromHDKey(
  hdKey: HDKey,
  accountIndex: number,
  type: WalletAccountType,
  addressIndex: number = 0,
  name?: string,
): EthereumWalletAccount {
  if (!hdKey.privateKey) {
    throw new Error('HD key must have private key to create Ethereum account')
  }

  // Get derivation info with the correct address index
  const derivationInfo = getDerivationInfo('ETH', accountIndex, type === 'internal', addressIndex)

  // Create viem account from private key
  const privateKeyHex = toHex(hdKey.privateKey)
  const viemAccount = privateKeyToAccount(privateKeyHex as Hex)

  // Create wallet account
  const account: EthereumWalletAccount = {
    id: `eth-${type}-${accountIndex}`,
    accountIndex,
    derivationPath: derivationInfo.derivationPath,
    derivationPathString: derivationInfo.derivationPathString,
    type,
    coinType: 'ETH',
    isActive: false,
    name: name || `Ethereum Account ${accountIndex}`,
    createdAt: Date.now(),
    address: viemAccount.address,
    publicKey: hdKey.publicKey ? toHex(hdKey.publicKey) : '',
    privateKey: privateKeyHex,
  }

  return account
}

/**
 * Creates multiple Ethereum accounts from mnemonic
 *
 * @param accountIndex - Starting account index
 * @param type - Account type (external/internal)
 * @param count - Number of accounts to create
 * @param startIndex - Starting address index within account
 * @returns Promise<EthereumWalletAccount[]>
 */
export async function createMultipleEthereumAccounts(
  accountIndex: number = 0,
  type: WalletAccountType = 'external',
  count: number = 1,
  startIndex: number = 0,
): Promise<EthereumWalletAccount[]> {
  // Derive multiple HD keys
  const hdKeys = await deriveMultipleKeys(
    'ETH',
    accountIndex,
    type === 'internal',
    count,
    startIndex,
  )

  // Create accounts from HD keys
  const accounts: EthereumWalletAccount[] = []

  for (let i = 0; i < hdKeys.length; i++) {
    const hdKey = hdKeys[i]
    const addressIndex = startIndex + i
    const account = createEthereumAccountFromHDKey(
      hdKey,
      accountIndex,
      type,
      addressIndex,
      `Ethereum ${type === 'internal' ? 'Internal' : 'External'} Account ${addressIndex}`,
    )

    // Update the account ID to include address index
    account.id = `eth-${type}-${accountIndex}-${addressIndex}`

    accounts.push(account)
  }

  return accounts
}

/**
 * Creates a single Ethereum account
 *
 * @param params - Account creation parameters
 * @returns Promise<WalletDerivationResult>
 */
export async function createEthereumAccount(
  params: CreateAccountParams,
): Promise<WalletDerivationResult> {
  try {
    if (params.coinType !== 'ETH') {
      throw new Error('Invalid coin type for Ethereum account creation')
    }

    const accounts = await createMultipleEthereumAccounts(params.accountIndex, params.type, 1, 0)

    if (accounts.length === 0) {
      throw new Error('Failed to create Ethereum account')
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
      account: {} as EthereumWalletAccount,
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error creating Ethereum account',
    }
  }
}

/**
 * Gets viem account instance for signing transactions
 *
 * @param ethereumAccount - Ethereum wallet account
 * @returns PrivateKeyAccount for use with viem
 */
export function getViemAccount(ethereumAccount: EthereumWalletAccount): PrivateKeyAccount | null {
  if (!ethereumAccount.privateKey) {
    console.warn('Cannot create viem account: private key not available (external account)')
    return null
  }

  try {
    return privateKeyToAccount(ethereumAccount.privateKey as Hex)
  } catch (error) {
    console.error('Error creating viem account:', error)
    return null
  }
}

/**
 * Signs a message with an Ethereum account
 *
 * @param ethereumAccount - Ethereum wallet account
 * @param message - Message to sign (string or bytes)
 * @returns Promise<Hash> - Signature hash
 */
export async function signMessage(
  ethereumAccount: EthereumWalletAccount,
  message: string | Uint8Array,
): Promise<Hash | null> {
  const viemAccount = getViemAccount(ethereumAccount)

  if (!viemAccount) {
    throw new Error('Cannot sign: account does not have private key access')
  }

  try {
    const signature = await viemAccount.signMessage({
      message: typeof message === 'string' ? message : { raw: toHex(message) },
    })
    return signature
  } catch (error) {
    console.error('Error signing message:', error)
    return null
  }
}

/**
 * Signs typed data (EIP-712) with an Ethereum account
 *
 * @param ethereumAccount - Ethereum wallet account
 * @param domain - EIP-712 domain
 * @param types - EIP-712 types
 * @param primaryType - Primary type name
 * @param message - Message data
 * @returns Promise<Hash> - Signature hash
 */
export async function signTypedData(
  ethereumAccount: EthereumWalletAccount,
  domain: any,
  types: Record<string, any>,
  primaryType: string,
  message: Record<string, any>,
): Promise<Hash | null> {
  const viemAccount = getViemAccount(ethereumAccount)

  if (!viemAccount) {
    throw new Error('Cannot sign: account does not have private key access')
  }

  try {
    const signature = await viemAccount.signTypedData({
      domain,
      types,
      primaryType,
      message,
    })
    return signature
  } catch (error) {
    console.error('Error signing typed data:', error)
    return null
  }
}

/**
 * Validates an Ethereum address
 *
 * @param address - Address to validate
 * @returns boolean - True if valid Ethereum address
 */
export function isValidEthereumAddress(address: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(address)
}

/**
 * Gets account info for debugging
 *
 * @param account - Ethereum wallet account
 * @returns Account debugging information
 */
export function getEthereumAccountInfo(account: EthereumWalletAccount) {
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
 * Converts Ethereum account to display format
 *
 * @param account - Ethereum wallet account
 * @returns Display-friendly account object
 */
export function formatEthereumAccountForDisplay(account: EthereumWalletAccount) {
  return {
    id: account.id,
    name: account.name,
    address: account.address,
    type: account.type,
    accountIndex: account.accountIndex,
    path: account.derivationPathString,
    isActive: account.isActive,
    balance: '0 ETH', // Would be fetched from blockchain in real implementation
  }
}
