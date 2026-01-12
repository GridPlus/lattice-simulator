/**
 * Cosmos Wallet Service for Lattice1 Device Simulator
 * Implements Cosmos bech32 address derivation using secp256k1 keys
 */

import {
  getCosmosChainConfigByCoinType,
  getDefaultCosmosChainConfig,
  type CosmosChainConfig,
} from '../utils/cosmosConfig'
import { generateCosmosAddress } from '../utils/crypto'
import { deriveMultipleKeys, getDerivationInfo } from '../utils/hdWallet'
import type {
  CosmosWalletAccount,
  CreateAccountParams,
  WalletAccountType,
  WalletDerivationResult,
} from '../types/wallet'
import type { HDKey } from '@scure/bip32'

interface CosmosAccountOptions {
  bip44CoinType?: number
  bech32Prefix?: string
}

const resolveCosmosConfig = (options?: CosmosAccountOptions): CosmosChainConfig => {
  const base =
    typeof options?.bip44CoinType === 'number'
      ? getCosmosChainConfigByCoinType(options.bip44CoinType)
      : getDefaultCosmosChainConfig()
  return {
    ...base,
    bech32Prefix: options?.bech32Prefix ?? base.bech32Prefix,
  }
}

/**
 * Creates a Cosmos wallet account from HD key
 */
export function createCosmosAccountFromHDKey(
  hdKey: HDKey,
  accountIndex: number,
  type: WalletAccountType,
  addressIndex: number = 0,
  options?: CosmosAccountOptions,
  name?: string,
): CosmosWalletAccount {
  if (!hdKey.privateKey || !hdKey.publicKey) {
    throw new Error('HD key must have both private and public keys to create Cosmos account')
  }

  const config = resolveCosmosConfig(options)
  const derivationInfo = getDerivationInfo(
    'COSMOS',
    accountIndex,
    type === 'internal',
    addressIndex,
    'legacy',
    config.bip44CoinType,
  )

  const publicKey = Buffer.from(hdKey.publicKey)
  const address = generateCosmosAddress(publicKey, config.bech32Prefix)

  const account: CosmosWalletAccount = {
    id: `cosmos-${type}-${accountIndex}`,
    accountIndex,
    derivationPath: derivationInfo.derivationPath,
    derivationPathString: derivationInfo.derivationPathString,
    type,
    coinType: 'COSMOS',
    isActive: false,
    name: name || `Cosmos Account ${accountIndex}`,
    createdAt: Date.now(),
    address,
    publicKey: publicKey.toString('hex'),
    privateKey: type === 'internal' ? Buffer.from(hdKey.privateKey).toString('hex') : undefined,
    bip44CoinType: config.bip44CoinType,
    bech32Prefix: config.bech32Prefix,
  }

  return account
}

/**
 * Creates multiple Cosmos accounts from mnemonic
 */
export async function createMultipleCosmosAccounts(
  accountIndex: number = 0,
  type: WalletAccountType = 'external',
  count: number = 1,
  startIndex: number = 0,
  options?: CosmosAccountOptions,
): Promise<CosmosWalletAccount[]> {
  const config = resolveCosmosConfig(options)
  const hdKeys = await deriveMultipleKeys(
    'COSMOS',
    accountIndex,
    type === 'internal',
    count,
    startIndex,
    'legacy',
    config.bip44CoinType,
  )

  const accounts: CosmosWalletAccount[] = []

  for (let i = 0; i < hdKeys.length; i++) {
    const hdKey = hdKeys[i]
    const addressIndex = startIndex + i
    const account = createCosmosAccountFromHDKey(
      hdKey,
      accountIndex,
      type,
      addressIndex,
      options,
      `Cosmos ${type === 'internal' ? 'Internal' : 'External'} Account ${addressIndex}`,
    )

    account.id = `cosmos-${type}-${accountIndex}-${addressIndex}`
    accounts.push(account)
  }

  return accounts
}

/**
 * Creates a single Cosmos account
 */
export async function createCosmosAccount(
  params: CreateAccountParams,
  options?: CosmosAccountOptions,
): Promise<WalletDerivationResult> {
  try {
    if (params.coinType !== 'COSMOS') {
      throw new Error('Invalid coin type for Cosmos account creation')
    }

    const resolvedOptions: CosmosAccountOptions = {
      ...options,
      bip44CoinType: params.bip44CoinType ?? options?.bip44CoinType,
      bech32Prefix: params.bech32Prefix ?? options?.bech32Prefix,
    }

    const accounts = await createMultipleCosmosAccounts(
      params.accountIndex,
      params.type,
      1,
      0,
      resolvedOptions,
    )
    if (accounts.length === 0) {
      throw new Error('Failed to create Cosmos account')
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
      account: {} as CosmosWalletAccount,
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error creating Cosmos account',
    }
  }
}
