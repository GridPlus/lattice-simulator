/**
 * Wallet Manager Service for Lattice1 Device Simulator
 * Manages wallet accounts and provides integration with signing service
 */

import { createMultipleBitcoinAccounts } from './bitcoinWallet'
import { createMultipleEthereumAccounts } from './ethereumWallet'
import { createMultipleSolanaAccounts } from './solanaWallet'
import type { ActiveWallets } from '@/shared/types/device'
import type {
  WalletAccount,
  WalletCoinType,
  WalletCollection,
  ActiveWallets as WalletActiveWallets,
} from '@/shared/types/wallet'

/**
 * Wallet Manager Service
 *
 * Centralizes wallet account management and provides a unified interface
 * for accessing wallet accounts across different cryptocurrencies.
 */
export class WalletManager {
  private walletAccounts: Map<string, WalletAccount> = new Map()
  private activeWallets: WalletActiveWallets = {
    ETH: undefined,
    BTC: undefined,
    SOL: undefined,
  }
  private initialized: boolean = false

  /**
   * Initializes the wallet manager with default accounts
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      return
    }

    try {
      // Initialize crypto libraries but don't create accounts
      // Accounts will be created on-demand when requested by client
      this.initialized = true
      console.log(
        '[WalletManager] Initialized crypto libraries (accounts will be created on-demand)',
      )
    } catch (error) {
      console.error('[WalletManager] Failed to initialize:', error)
      throw error
    }
  }

  /**
   * Derives wallet addresses on-demand for the specified coin type and range
   *
   * @param coinType - The cryptocurrency type ('ETH', 'BTC', 'SOL')
   * @param accountIndex - Account index for derivation
   * @param walletType - 'internal' or 'external'
   * @param addressType - Address type (e.g., 'segwit' for Bitcoin)
   * @param startIndex - Starting address index
   * @param count - Number of addresses to derive
   * @returns Array of wallet account objects
   */
  async deriveAddressesOnDemand(
    coinType: 'ETH' | 'BTC' | 'SOL',
    accountIndex: number = 0,
    walletType: 'internal' | 'external' = 'internal',
    addressType: 'segwit' | 'legacy' | 'wrapped-segwit' = 'segwit',
    startIndex: number = 0,
    count: number = 1,
  ): Promise<Array<{ id: string; address: string; publicKey?: string; coinType: string }>> {
    if (!this.initialized) {
      throw new Error('WalletManager not initialized')
    }

    try {
      console.log(`[WalletManager] Deriving ${count} ${coinType} addresses on-demand`)

      switch (coinType) {
        case 'ETH': {
          const accounts = await createMultipleEthereumAccounts(
            accountIndex,
            walletType,
            count,
            startIndex,
          )
          return accounts.map(account => ({
            id: account.id,
            address: account.address,
            publicKey: account.publicKey,
            coinType: 'ETH',
          }))
        }

        case 'BTC': {
          const accounts = await createMultipleBitcoinAccounts(
            accountIndex,
            walletType,
            addressType,
            count,
            startIndex,
          )
          return accounts.map(account => ({
            id: account.id,
            address: account.address,
            publicKey: account.publicKey,
            coinType: 'BTC',
          }))
        }

        case 'SOL': {
          const accounts = await createMultipleSolanaAccounts(
            accountIndex,
            walletType,
            count,
            startIndex,
          )
          return accounts.map(account => ({
            id: account.id,
            address: account.address,
            publicKey: account.publicKey,
            coinType: 'SOL',
          }))
        }

        default:
          throw new Error(`Unsupported coin type: ${coinType}`)
      }
    } catch (error) {
      console.error(`[WalletManager] Failed to derive ${coinType} addresses:`, error)
      throw error
    }
  }

  /**
   * Creates default accounts for testing and simulation
   * @deprecated Use deriveAddressesOnDemand instead
   */
  private async createDefaultAccounts(): Promise<void> {
    // Create Ethereum accounts
    const ethAccounts = await createMultipleEthereumAccounts(0, 'internal', 3, 0)
    ethAccounts.forEach(account => {
      this.walletAccounts.set(account.id, account)
    })
    if (ethAccounts.length > 0) {
      this.activeWallets.ETH = ethAccounts[0]
    }

    // Create Bitcoin accounts
    const btcAccounts = await createMultipleBitcoinAccounts(0, 'internal', 'segwit', 3, 0)
    btcAccounts.forEach(account => {
      this.walletAccounts.set(account.id, account)
    })
    if (btcAccounts.length > 0) {
      this.activeWallets.BTC = btcAccounts[0]
    }

    // Create Solana accounts
    const solAccounts = await createMultipleSolanaAccounts(0, 'internal', 3, 0)
    solAccounts.forEach(account => {
      this.walletAccounts.set(account.id, account)
    })
    if (solAccounts.length > 0) {
      this.activeWallets.SOL = solAccounts[0]
    }

    console.log(`[WalletManager] Created ${this.walletAccounts.size} wallet accounts`)
  }

  /**
   * Gets all wallet accounts
   */
  getAllWalletAccounts(): Map<string, WalletAccount> {
    return new Map(this.walletAccounts)
  }

  /**
   * Gets wallet accounts by coin type
   */
  getAccountsByCoin(coinType: WalletCoinType): WalletAccount[] {
    const accounts: WalletAccount[] = []
    this.walletAccounts.forEach(account => {
      if (account.coinType === coinType) {
        accounts.push(account)
      }
    })
    return accounts
  }

  /**
   * Gets a specific wallet account by ID
   */
  getWalletAccount(accountId: string): WalletAccount | undefined {
    return this.walletAccounts.get(accountId)
  }

  /**
   * Finds wallet account by derivation path
   */
  findAccountByPath(path: number[], coinType: WalletCoinType): WalletAccount | undefined {
    let foundAccount: WalletAccount | undefined
    this.walletAccounts.forEach(account => {
      if (account.coinType === coinType && this.pathsMatch(account.derivationPath, path)) {
        foundAccount = account
      }
    })
    return foundAccount
  }

  /**
   * Gets the active wallet for a specific coin type
   */
  getActiveWallet(coinType: WalletCoinType): WalletAccount | undefined {
    return this.activeWallets[coinType]
  }

  /**
   * Sets the active wallet for a specific coin type
   */
  setActiveWallet(coinType: WalletCoinType, account: WalletAccount): void {
    if (account.coinType !== coinType) {
      throw new Error(
        `Account coin type ${account.coinType} does not match requested type ${coinType}`,
      )
    }
    this.activeWallets[coinType] = account as any
    console.log(`[WalletManager] Set active ${coinType} wallet:`, account.id)
  }

  /**
   * Gets active wallets in the format expected by the device simulator
   */
  getActiveWalletsForDevice(): ActiveWallets {
    // Convert to device format (with UIDs)
    const deviceWallets: ActiveWallets = {
      internal: {
        uid: this.generateWalletUID('internal'),
        external: false,
        name: 'Internal Wallet',
        capabilities: 0,
      },
      external: {
        uid: this.generateWalletUID('external'),
        external: true,
        name: 'External Wallet',
        capabilities: 0,
      },
    }

    return deviceWallets
  }

  /**
   * Adds a new wallet account
   */
  addWalletAccount(account: WalletAccount): void {
    this.walletAccounts.set(account.id, account)
    console.log(`[WalletManager] Added wallet account: ${account.id}`)
  }

  /**
   * Removes a wallet account
   */
  removeWalletAccount(accountId: string): boolean {
    const removed = this.walletAccounts.delete(accountId)
    if (removed) {
      console.log(`[WalletManager] Removed wallet account: ${accountId}`)
    }
    return removed
  }

  /**
   * Gets wallet collection organized by coin type and account type
   */
  getWalletCollection(): WalletCollection {
    const collection: WalletCollection = {
      ETH: { external: [], internal: [] },
      BTC: { external: [], internal: [] },
      SOL: { external: [], internal: [] },
    }

    this.walletAccounts.forEach(account => {
      if (account.coinType in collection) {
        ;(collection[account.coinType] as any)[account.type].push(account)
      }
    })

    return collection
  }

  /**
   * Creates additional accounts for a specific coin type
   */
  async createAccountsForCoin(
    coinType: WalletCoinType,
    count: number = 1,
    accountIndex: number = 0,
    type: 'internal' | 'external' = 'internal',
  ): Promise<WalletAccount[]> {
    let accounts: WalletAccount[] = []

    switch (coinType) {
      case 'ETH':
        accounts = await createMultipleEthereumAccounts(accountIndex, type, count, 0)
        break
      case 'BTC':
        accounts = await createMultipleBitcoinAccounts(accountIndex, type, 'segwit', count, 0)
        break
      case 'SOL':
        accounts = await createMultipleSolanaAccounts(accountIndex, type, count, 0)
        break
    }

    // Add to our collection
    accounts.forEach(account => {
      this.walletAccounts.set(account.id, account)
    })

    console.log(`[WalletManager] Created ${accounts.length} new ${coinType} accounts`)
    return accounts
  }

  /**
   * Checks if the wallet manager is initialized
   */
  isInitialized(): boolean {
    return this.initialized
  }

  /**
   * Gets wallet statistics
   */
  getStats(): {
    totalAccounts: number
    accountsByCoin: Record<WalletCoinType, number>
    activeWallets: Record<WalletCoinType, string | undefined>
  } {
    const accountsByCoin: Record<WalletCoinType, number> = {
      ETH: 0,
      BTC: 0,
      SOL: 0,
    }

    this.walletAccounts.forEach(account => {
      if (account.coinType in accountsByCoin) {
        accountsByCoin[account.coinType]++
      }
    })

    return {
      totalAccounts: this.walletAccounts.size,
      accountsByCoin,
      activeWallets: {
        ETH: this.activeWallets.ETH?.id,
        BTC: this.activeWallets.BTC?.id,
        SOL: this.activeWallets.SOL?.id,
      },
    }
  }

  /**
   * Helper method to check if two paths match
   */
  private pathsMatch(path1: number[], path2: number[]): boolean {
    if (path1.length !== path2.length) return false
    return path1.every((segment, index) => segment === path2[index])
  }

  /**
   * Generates a wallet UID for device compatibility
   */
  private generateWalletUID(type: 'internal' | 'external'): string {
    // Generate deterministic UID based on type
    const base = type === 'internal' ? '12345678' : '00000000'
    return (base + '0'.repeat(24)).substring(0, 32)
  }

  /**
   * Resets all wallet data (useful for testing)
   */
  reset(): void {
    this.walletAccounts.clear()
    this.activeWallets = {
      ETH: undefined,
      BTC: undefined,
      SOL: undefined,
    }
    this.initialized = false
    console.log('[WalletManager] Reset all wallet data')
  }
}

/**
 * Global wallet manager instance
 */
export const walletManager = new WalletManager()
