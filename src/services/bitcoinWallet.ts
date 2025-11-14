/**
 * Bitcoin Wallet Service for Lattice1 Device Simulator
 * Implements Bitcoin wallet functionality using bitcoinjs-lib
 */

import * as bitcoin from 'bitcoinjs-lib'
import ECPair, { type ECPairInterface } from 'ecpair'
import { ec as EC } from 'elliptic'
import * as tinySecp from 'tiny-secp256k1'
import { resolveTinySecp } from '../shared/utils/ecc'
import { deriveMultipleKeys, getDerivationInfo } from '../shared/utils/hdWallet'
import type {
  BitcoinWalletAccount,
  CreateAccountParams,
  WalletDerivationResult,
  WalletAccountType,
} from '../shared/types/wallet'
import type { HDKey } from '@scure/bip32'

// Lazy initialization to avoid SSR issues
let isInitialized = false
let ECPairFactory: ReturnType<typeof ECPair>
const ecc = resolveTinySecp(tinySecp)
const secp256k1 = new EC('secp256k1')
const BITCOIN_MESSAGE_PREFIX = 'Bitcoin Signed Message:\n'

function initializeBitcoinLibs() {
  if (isInitialized) {
    return
  }

  try {
    // Initialize bitcoinjs-lib with secp256k1 implementation
    bitcoin.initEccLib(ecc as any)

    // Initialize ECPair factory with secp256k1
    ECPairFactory = ECPair(ecc as any)

    isInitialized = true
  } catch (error) {
    console.error('Failed to initialize Bitcoin crypto libraries:', error)
  }
}

/**
 * Bitcoin networks supported by the wallet
 */
export const BITCOIN_NETWORKS = {
  mainnet: bitcoin.networks.bitcoin,
  testnet: bitcoin.networks.testnet,
} as const

/**
 * Creates a Bitcoin wallet account from HD key
 *
 * @param hdKey - HD key derived from mnemonic
 * @param accountIndex - Account index
 * @param type - Account type (external/internal)
 * @param addressType - Bitcoin address type (legacy, segwit, wrapped-segwit)
 * @param name - Optional account name
 * @param network - Bitcoin network (mainnet/testnet)
 * @returns BitcoinWalletAccount
 */
export function createBitcoinAccountFromHDKey(
  hdKey: HDKey,
  accountIndex: number,
  type: WalletAccountType,
  addressIndex: number = 0,
  addressType: 'legacy' | 'segwit' | 'wrapped-segwit' = 'segwit',
  name?: string,
  network: keyof typeof BITCOIN_NETWORKS = 'mainnet',
): BitcoinWalletAccount {
  initializeBitcoinLibs()

  if (!hdKey.privateKey || !hdKey.publicKey) {
    throw new Error('HD key must have both private and public keys to create Bitcoin account')
  }

  const btcNetwork = BITCOIN_NETWORKS[network]

  // Get derivation info with the correct address index
  const hdWalletAddressType = addressType === 'wrapped-segwit' ? 'wrappedSegwit' : addressType
  const derivationInfo = getDerivationInfo(
    'BTC',
    accountIndex,
    type === 'internal',
    addressIndex,
    hdWalletAddressType as any,
  )

  // Create key pair from HD key
  const keyPair = ECPairFactory.fromPrivateKey(Buffer.from(hdKey.privateKey), {
    network: btcNetwork,
  })

  // Generate address based on type
  let payment: bitcoin.Payment

  switch (addressType) {
    case 'legacy':
      // P2PKH (Pay-to-PubkeyHash) - addresses start with '1'
      payment = bitcoin.payments.p2pkh({
        pubkey: Buffer.from(keyPair.publicKey!),
        network: btcNetwork,
      })
      break

    case 'segwit':
      // P2WPKH (Pay-to-Witness-PubkeyHash) - native segwit, addresses start with 'bc1'
      payment = bitcoin.payments.p2wpkh({
        pubkey: Buffer.from(keyPair.publicKey!),
        network: btcNetwork,
      })
      break

    case 'wrapped-segwit':
      // P2SH-P2WPKH (Pay-to-Script-Hash wrapping P2WPKH) - addresses start with '3'
      const p2wpkh = bitcoin.payments.p2wpkh({
        pubkey: Buffer.from(keyPair.publicKey!),
        network: btcNetwork,
      })
      payment = bitcoin.payments.p2sh({ redeem: p2wpkh, network: btcNetwork })
      break

    default:
      throw new Error(`Unsupported Bitcoin address type: ${addressType}`)
  }

  if (!payment.address) {
    throw new Error(`Failed to generate ${addressType} Bitcoin address`)
  }

  const address = payment.address

  // Create wallet account
  const account: BitcoinWalletAccount = {
    id: `btc-${type}-${accountIndex}`,
    accountIndex,
    derivationPath: derivationInfo.derivationPath,
    derivationPathString: derivationInfo.derivationPathString,
    type,
    coinType: 'BTC',
    isActive: false,
    name: name || `Bitcoin ${addressType} Account ${accountIndex}`,
    createdAt: Date.now(),
    address,
    publicKey: hdKey.publicKey ? Buffer.from(hdKey.publicKey).toString('hex') : '',
    privateKey: type === 'internal' ? keyPair.toWIF() : undefined, // Only store for internal accounts
    addressType,
  }

  return account
}

/**
 * Creates multiple Bitcoin accounts from mnemonic
 *
 * @param accountIndex - Starting account index
 * @param type - Account type (external/internal)
 * @param addressType - Bitcoin address type
 * @param count - Number of accounts to create
 * @param startIndex - Starting address index within account
 * @param network - Bitcoin network
 * @returns Promise<BitcoinWalletAccount[]>
 */
export async function createMultipleBitcoinAccounts(
  accountIndex: number = 0,
  type: WalletAccountType = 'external',
  addressType: 'legacy' | 'segwit' | 'wrapped-segwit' = 'segwit',
  count: number = 1,
  startIndex: number = 0,
  network: keyof typeof BITCOIN_NETWORKS = 'mainnet',
): Promise<BitcoinWalletAccount[]> {
  // Validate account index - handle hardened indices by normalizing them
  if (accountIndex < 0 || accountIndex >= 4294967295) {
    throw new Error(`Invalid account index: ${accountIndex}. Must be between 0 and 4294967294`)
  }

  // Normalize hardened account indices (remove hardened bit if present)
  // 2147483648 (0x80000000) is the hardened bit, so 2147483648 becomes 0
  const normalizedAccountIndex =
    accountIndex >= 2147483648 ? accountIndex - 2147483648 : accountIndex

  // Derive multiple HD keys - convert addressType to match hdWallet expected format
  const hdWalletAddressType = addressType === 'wrapped-segwit' ? 'wrappedSegwit' : addressType
  const hdKeys = await deriveMultipleKeys(
    'BTC',
    normalizedAccountIndex,
    type === 'internal',
    count,
    startIndex,
    hdWalletAddressType as any,
  )

  // Create accounts from HD keys
  const accounts: BitcoinWalletAccount[] = []

  for (let i = 0; i < hdKeys.length; i++) {
    const hdKey = hdKeys[i]
    const addressIndex = startIndex + i
    const account = createBitcoinAccountFromHDKey(
      hdKey,
      normalizedAccountIndex,
      type,
      addressIndex,
      addressType,
      `Bitcoin ${addressType} ${type === 'internal' ? 'Internal' : 'External'} Account ${addressIndex}`,
      network,
    )

    // Update the account ID to include address index
    account.id = `btc-${type}-${normalizedAccountIndex}-${addressIndex}`

    accounts.push(account)
  }

  console.log(
    'createMultipleBitcoinAccounts.createMultipleBitcoinAccounts.accounts:',
    JSON.stringify(accounts),
  )
  return accounts
}

/**
 * Creates a single Bitcoin account
 *
 * @param params - Account creation parameters
 * @param network - Bitcoin network
 * @returns Promise<WalletDerivationResult>
 */
export async function createBitcoinAccount(
  params: CreateAccountParams,
  network: keyof typeof BITCOIN_NETWORKS = 'mainnet',
): Promise<WalletDerivationResult> {
  try {
    if (params.coinType !== 'BTC') {
      throw new Error('Invalid coin type for Bitcoin account creation')
    }

    const addressType = params.addressType || 'segwit'
    const accounts = await createMultipleBitcoinAccounts(
      params.accountIndex,
      params.type,
      addressType,
      1,
      0,
      network,
    )

    if (accounts.length === 0) {
      throw new Error('Failed to create Bitcoin account')
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
      account: {} as BitcoinWalletAccount,
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error creating Bitcoin account',
    }
  }
}

/**
 * Gets bitcoinjs-lib ECPair for signing transactions
 *
 * @param bitcoinAccount - Bitcoin wallet account
 * @param network - Bitcoin network
 * @returns ECPair instance for signing or null if no private key
 */
export function getBitcoinKeyPair(
  bitcoinAccount: BitcoinWalletAccount,
  network: keyof typeof BITCOIN_NETWORKS = 'mainnet',
): ECPairInterface | null {
  initializeBitcoinLibs()

  if (!bitcoinAccount.privateKey) {
    console.warn('Cannot create Bitcoin key pair: private key not available (external account)')
    return null
  }

  try {
    const btcNetwork = BITCOIN_NETWORKS[network]
    return ECPairFactory.fromWIF(bitcoinAccount.privateKey, btcNetwork)
  } catch (error) {
    console.error('Error creating Bitcoin key pair:', error)
    return null
  }
}

/**
 * Signs a Bitcoin message
 *
 * @param bitcoinAccount - Bitcoin wallet account
 * @param message - Message to sign
 * @param network - Bitcoin network
 * @returns Promise<string | null> - Signature string or null if error
 */
export async function signBitcoinMessage(
  bitcoinAccount: BitcoinWalletAccount,
  message: string | Uint8Array,
  network: keyof typeof BITCOIN_NETWORKS = 'mainnet',
): Promise<string | null> {
  initializeBitcoinLibs()

  const keyPair = getBitcoinKeyPair(bitcoinAccount, network)
  if (!keyPair || !keyPair.privateKey) {
    throw new Error('Cannot sign: account does not have private key access')
  }

  try {
    const messageBuffer =
      typeof message === 'string' ? Buffer.from(message, 'utf8') : Buffer.from(message)
    const prefix = Buffer.from(BITCOIN_MESSAGE_PREFIX, 'utf8')
    const prefixLength = Buffer.alloc(1)
    prefixLength.writeUInt8(prefix.length, 0)
    const serialized = Buffer.concat([
      prefixLength,
      prefix,
      encodeVarInt(messageBuffer.length),
      messageBuffer,
    ])
    const messageHash = bitcoin.crypto.hash256(serialized)

    const ecKey = secp256k1.keyFromPrivate(Buffer.from(keyPair.privateKey))
    const signature = ecKey.sign(messageHash, { canonical: true })
    const recoveryParam = calculateRecoveryParam(messageHash, signature, ecKey)
    const isCompressed = keyPair.compressed !== false
    const header = 27 + recoveryParam + (isCompressed ? 4 : 0)

    const signatureBuffer = Buffer.alloc(65)
    signatureBuffer.writeUInt8(header, 0)
    Buffer.from(signature.r.toArray('be', 32)).copy(signatureBuffer, 1)
    Buffer.from(signature.s.toArray('be', 32)).copy(signatureBuffer, 33)

    return signatureBuffer.toString('base64')
  } catch (error) {
    console.error('Error signing Bitcoin message:', error)
    return null
  }
}

/**
 * Validates a Bitcoin address
 *
 * @param address - Address to validate
 * @param network - Bitcoin network
 * @returns boolean - True if valid Bitcoin address
 */
export function isValidBitcoinAddress(
  address: string,
  network: keyof typeof BITCOIN_NETWORKS = 'mainnet',
): boolean {
  initializeBitcoinLibs()

  try {
    bitcoin.address.toOutputScript(address, BITCOIN_NETWORKS[network])
    return true
  } catch {
    return false
  }
}

/**
 * Gets account info for debugging
 *
 * @param account - Bitcoin wallet account
 * @returns Account debugging information
 */
export function getBitcoinAccountInfo(account: BitcoinWalletAccount) {
  return {
    id: account.id,
    address: account.address,
    accountIndex: account.accountIndex,
    type: account.type,
    addressType: account.addressType,
    derivationPath: account.derivationPathString,
    hasPrivateKey: !!account.privateKey,
    isActive: account.isActive,
    name: account.name,
    publicKey: account.publicKey.slice(0, 20) + '...', // Truncated for display
  }
}

/**
 * Converts Bitcoin account to display format
 *
 * @param account - Bitcoin wallet account
 * @returns Display-friendly account object
 */
export function formatBitcoinAccountForDisplay(account: BitcoinWalletAccount) {
  return {
    id: account.id,
    name: account.name,
    address: account.address,
    type: account.type,
    addressType: account.addressType,
    accountIndex: account.accountIndex,
    path: account.derivationPathString,
    isActive: account.isActive,
    balance: '0 BTC', // Would be fetched from blockchain in real implementation
  }
}

function encodeVarInt(value: number): Buffer {
  if (value < 0xfd) {
    const buf = Buffer.alloc(1)
    buf.writeUInt8(value, 0)
    return buf
  }

  if (value <= 0xffff) {
    const buf = Buffer.alloc(3)
    buf.writeUInt8(0xfd, 0)
    buf.writeUInt16LE(value, 1)
    return buf
  }

  if (value <= 0xffffffff) {
    const buf = Buffer.alloc(5)
    buf.writeUInt8(0xfe, 0)
    buf.writeUInt32LE(value, 1)
    return buf
  }

  const buf = Buffer.alloc(9)
  buf.writeUInt8(0xff, 0)
  buf.writeBigUInt64LE(BigInt(value), 1)
  return buf
}

function calculateRecoveryParam(
  messageHash: Buffer,
  signature: EC.Signature,
  keyPair: EC.KeyPair,
): number {
  if (typeof signature.recoveryParam === 'number') {
    return signature.recoveryParam
  }

  for (let recovery = 0; recovery < 4; recovery++) {
    try {
      const recovered = secp256k1.recoverPubKey(
        messageHash,
        { r: signature.r, s: signature.s },
        recovery,
      )
      if (recovered.encode('hex', false) === keyPair.getPublic().encode('hex', false)) {
        return recovery
      }
    } catch {
      continue
    }
  }

  return 0
}
