/**
 * Wallet Account Types for Lattice1 Device Simulator
 * Defines interfaces for wallet accounts with external/internal distinction
 */

export type WalletCoinType = 'ETH' | 'BTC' | 'SOL' | 'COSMOS'
export type WalletAccountType = 'external' | 'internal'

/**
 * Base wallet account interface
 */
export interface BaseWalletAccount {
  /** Unique identifier for this account */
  id: string
  /** Account index in HD derivation (0, 1, 2, ...) */
  accountIndex: number
  /** BIP-44 derivation path as array of numbers */
  derivationPath: number[]
  /** BIP-44 derivation path as string (e.g., "m/44'/60'/0'/0/0") */
  derivationPathString: string
  /** Account type: external (SafeCard) or internal (device-only) */
  type: WalletAccountType
  /** Cryptocurrency type */
  coinType: WalletCoinType
  /** Whether this account is currently active for this coin */
  isActive: boolean
  /** Account name/label */
  name: string
  /** Creation timestamp */
  createdAt: number
}

/**
 * Ethereum wallet account
 */
export interface EthereumWalletAccount extends BaseWalletAccount {
  coinType: 'ETH'
  /** Ethereum address (0x...) */
  address: string
  /** Compressed public key (hex string) */
  publicKey: string
  /** Private key (hex string) - only stored for internal accounts */
  privateKey?: string
}

/**
 * Bitcoin wallet account
 */
export interface BitcoinWalletAccount extends BaseWalletAccount {
  coinType: 'BTC'
  /** Bitcoin address */
  address: string
  /** Compressed public key (hex string) */
  publicKey: string
  /** Private key (WIF format) - only stored for internal accounts */
  privateKey?: string
  /** Address type (legacy, segwit, wrapped-segwit) */
  addressType: 'legacy' | 'segwit' | 'wrapped-segwit'
}

/**
 * Solana wallet account
 */
export interface SolanaWalletAccount extends BaseWalletAccount {
  coinType: 'SOL'
  /** Solana public key (base58) */
  address: string
  /** Public key bytes (hex string) */
  publicKey: string
  /** Private key bytes (hex string) - only stored for internal accounts */
  privateKey?: string
}

/**
 * Cosmos wallet account
 */
export interface CosmosWalletAccount extends BaseWalletAccount {
  coinType: 'COSMOS'
  /** Cosmos bech32 address */
  address: string
  /** Compressed public key (hex string) */
  publicKey: string
  /** Private key (hex string) - only stored for internal accounts */
  privateKey?: string
  /** BIP-44 coin type for this Cosmos chain (e.g., 118) */
  bip44CoinType: number
  /** Bech32 prefix used for this account */
  bech32Prefix: string
}

/**
 * Union type for all wallet accounts
 */
export type WalletAccount =
  | EthereumWalletAccount
  | BitcoinWalletAccount
  | SolanaWalletAccount
  | CosmosWalletAccount

/**
 * Active wallets configuration - one per coin type
 */
export interface ActiveWallets {
  ETH?: EthereumWalletAccount
  BTC?: BitcoinWalletAccount
  SOL?: SolanaWalletAccount
  COSMOS?: CosmosWalletAccount
}

/**
 * Wallet collection organized by coin type and account type
 */
export interface WalletCollection {
  ETH: {
    external: EthereumWalletAccount[]
    internal: EthereumWalletAccount[]
  }
  BTC: {
    external: BitcoinWalletAccount[]
    internal: BitcoinWalletAccount[]
  }
  SOL: {
    external: SolanaWalletAccount[]
    internal: SolanaWalletAccount[]
  }
  COSMOS: {
    external: CosmosWalletAccount[]
    internal: CosmosWalletAccount[]
  }
}

/**
 * Wallet generation options
 */
export interface WalletGenerationOptions {
  /** Number of accounts to generate */
  count: number
  /** Starting account index */
  startIndex: number
  /** Account type to generate */
  type: WalletAccountType
  /** Coin type */
  coinType: WalletCoinType
  /** Whether to include private keys (for internal accounts only) */
  includePrivateKeys?: boolean
}

/**
 * Wallet derivation result
 */
export interface WalletDerivationResult {
  /** Generated wallet account */
  account: WalletAccount
  /** HD node used for derivation (for further derivation if needed) */
  hdNode?: any
  /** Success status */
  success: boolean
  /** Error message if derivation failed */
  error?: string
}

/**
 * Account creation parameters
 */
export interface CreateAccountParams {
  coinType: WalletCoinType
  accountIndex: number
  type: WalletAccountType
  name?: string
  addressType?: 'legacy' | 'segwit' | 'wrapped-segwit' // Bitcoin only
  bip44CoinType?: number // Cosmos only
  bech32Prefix?: string // Cosmos only
}

/**
 * Wallet service interface for managing accounts
 */
export interface WalletService {
  /** Generate a new wallet account */
  createAccount(params: CreateAccountParams): Promise<WalletDerivationResult>

  /** Get all accounts for a coin type */
  getAccountsByCoin(coinType: WalletCoinType): WalletAccount[]

  /** Get accounts by type (external/internal) */
  getAccountsByType(type: WalletAccountType): WalletAccount[]

  /** Get active wallet for a coin type */
  getActiveWallet(coinType: WalletCoinType): WalletAccount | undefined

  /** Set active wallet for a coin type */
  setActiveWallet(coinType: WalletCoinType, account: WalletAccount): void

  /** Get all wallets */
  getAllWallets(): WalletCollection

  /** Import accounts from mnemonic */
  importAccountsFromMnemonic(options: WalletGenerationOptions): Promise<WalletAccount[]>
}
