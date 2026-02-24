/**
 * XRP Wallet Service for Lattice1 Device Simulator
 * Implements XRP classic address derivation from secp256k1 keys
 */

import { compressSecp256k1PublicKey, generateXrpAddress } from '../utils/crypto'
import { deriveMultipleKeys, getDerivationInfo } from '../utils/hdWallet'
import type {
  CreateAccountParams,
  WalletAccountType,
  WalletDerivationResult,
  XrpWalletAccount,
} from '../types/wallet'
import type { HDKey } from '@scure/bip32'

interface AccountGenerationOptions {
  seed?: Uint8Array
  idPrefix?: string
}

/**
 * Creates an XRP wallet account from HD key
 */
export function createXrpAccountFromHDKey(
  hdKey: HDKey,
  accountIndex: number,
  type: WalletAccountType,
  addressIndex: number = 0,
  name?: string,
): XrpWalletAccount {
  if (!hdKey.privateKey || !hdKey.publicKey) {
    throw new Error('HD key must have both private and public keys to create XRP account')
  }

  const derivationInfo = getDerivationInfo('XRP', accountIndex, type === 'internal', addressIndex)
  const compressedPubkey = compressSecp256k1PublicKey(Buffer.from(hdKey.publicKey))
  const address = generateXrpAddress(compressedPubkey)

  return {
    id: `xrp-${type}-${accountIndex}`,
    accountIndex,
    derivationPath: derivationInfo.derivationPath,
    derivationPathString: derivationInfo.derivationPathString,
    type,
    coinType: 'XRP',
    isActive: false,
    name: name || `XRP Account ${accountIndex}`,
    createdAt: Date.now(),
    address,
    publicKey: compressedPubkey.toString('hex'),
    privateKey: type === 'internal' ? Buffer.from(hdKey.privateKey).toString('hex') : undefined,
  }
}

/**
 * Creates multiple XRP accounts from mnemonic
 */
export async function createMultipleXrpAccounts(
  accountIndex: number = 0,
  type: WalletAccountType = 'external',
  count: number = 1,
  startIndex: number = 0,
  options?: AccountGenerationOptions,
): Promise<XrpWalletAccount[]> {
  const hdKeys = await deriveMultipleKeys(
    'XRP',
    accountIndex,
    type === 'internal',
    count,
    startIndex,
    'legacy',
    undefined,
    options,
  )

  const accounts: XrpWalletAccount[] = []

  for (let i = 0; i < hdKeys.length; i++) {
    const hdKey = hdKeys[i]
    const addressIndex = startIndex + i
    const account = createXrpAccountFromHDKey(
      hdKey,
      accountIndex,
      type,
      addressIndex,
      `XRP ${type === 'internal' ? 'Internal' : 'External'} Account ${addressIndex}`,
    )

    const idPrefix = options?.idPrefix ? `${options.idPrefix}-` : ''
    account.id = `xrp-${idPrefix}${type}-${addressIndex}`
    accounts.push(account)
  }

  return accounts
}

/**
 * Creates a single XRP account
 */
export async function createXrpAccount(
  params: CreateAccountParams,
  options?: AccountGenerationOptions,
): Promise<WalletDerivationResult> {
  try {
    if (params.coinType !== 'XRP') {
      throw new Error('Invalid coin type for XRP account creation')
    }

    const accounts = await createMultipleXrpAccounts(
      params.accountIndex,
      params.type,
      1,
      0,
      options,
    )

    if (accounts.length === 0) {
      throw new Error('Failed to create XRP account')
    }

    const account = accounts[0]
    if (params.name) {
      account.name = params.name
    }

    return {
      account,
      success: true,
    }
  } catch (error) {
    return {
      account: {} as XrpWalletAccount,
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error creating XRP account',
    }
  }
}
