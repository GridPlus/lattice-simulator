/**
 * Wallet Manager Service for Lattice1 Device Simulator
 * Manages wallet accounts and provides integration with signing service
 */

import { createMultipleBitcoinAccounts } from './bitcoin'
import { setWalletMnemonicOverride, normalizeMnemonic, validateMnemonic } from './config'
import { createMultipleEthereumAccounts } from './ethereum'
import { createMultipleSolanaAccounts } from './solana'
import type { ActiveWallets } from '../types/device'
import type {
  WalletAccount,
  WalletCoinType,
  WalletCollection,
  ActiveWallets as WalletActiveWallets,
} from '../types/wallet'

/**
 * Wallet Manager Service
 *
 * Centralizes wallet account management and provides a unified interface
 * for accessing wallet accounts across different cryptocurrencies.
 */
export class WalletRegistry {
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
      await this.createDefaultAccounts()
      this.initialized = true
      console.log('[WalletRegistry] Initialized wallet manager with default accounts')
    } catch (error) {
      console.error('[WalletRegistry] Failed to initialize:', error)
      throw error
    }
  }

  /**
   * Applies an incoming mnemonic override and rebuilds cached wallet state when it changes
   */
  async applyMnemonicOverride(mnemonic?: string | null): Promise<boolean> {
    const normalized =
      typeof mnemonic === 'string' && mnemonic.trim().length > 0
        ? normalizeMnemonic(mnemonic)
        : null

    if (normalized && !validateMnemonic(normalized)) {
      console.warn('[WalletRegistry] Ignoring invalid mnemonic override received from client')
      return false
    }

    const changed = setWalletMnemonicOverride(normalized)

    if (!changed) {
      return false
    }

    console.log('[WalletRegistry] Applying mnemonic override and reinitializing wallet data')
    this.reset()
    await this.initialize()
    return true
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
      throw new Error('WalletRegistry not initialized')
    }

    try {
      console.log(`[WalletRegistry] Deriving ${count} ${coinType} addresses on-demand`)

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
      console.error(`[WalletRegistry] Failed to derive ${coinType} addresses:`, error)
      throw error
    }
  }

  /**
   * Creates default accounts for testing and simulation
   * @deprecated Use deriveAddressesOnDemand instead
   */
  private async createDefaultAccounts(): Promise<void> {
    // Create Ethereum accounts
    const ethInternalAccounts = await createMultipleEthereumAccounts(0, 'internal', 3, 0)
    const ethExternalAccounts = await createMultipleEthereumAccounts(0, 'external', 3, 0)

    ethInternalAccounts.forEach(account => {
      this.walletAccounts.set(account.id, account)
    })

    ethExternalAccounts.forEach(account => {
      this.walletAccounts.set(account.id, account)
    })

    if (ethExternalAccounts.length > 0) {
      this.activeWallets.ETH = ethExternalAccounts[0]
    } else if (ethInternalAccounts.length > 0) {
      this.activeWallets.ETH = ethInternalAccounts[0]
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

    console.log(`[WalletRegistry] Created ${this.walletAccounts.size} wallet accounts`)
  }

  /**
   * Gets all wallet accounts
   */
  getAllWalletAccounts(): Map<string, WalletAccount> {
    return new Map(this.walletAccounts)
  }

  isInitialized(): boolean {
    return this.initialized
  }

  /**
   * Syncs wallet accounts from client-side to server-side storage
   * @param accounts - Array of wallet accounts from client
   */
  async syncWalletAccounts(accounts: WalletAccount[]): Promise<void> {
    if (!this.initialized) {
      await this.initialize()
    }

    console.log(`[WalletRegistry] Syncing ${accounts.length} wallet accounts from client`)

    for (const account of accounts) {
      const coinType = account.coinType as WalletCoinType
      const existingById = account.id ? this.walletAccounts.get(account.id) : undefined
      const existingByPath =
        !existingById && coinType && account.derivationPath
          ? this.findAccountByPath(account.derivationPath, coinType)
          : undefined
      const existing = existingById || existingByPath || null

      if (!account.privateKey && !existing?.privateKey) {
        console.warn(
          '[WalletRegistry] Skipping sync for account without private key (simulator needs signing access)',
          {
            id: account.id,
            coinType: account.coinType,
            path: account.derivationPath,
          },
        )
        continue
      }

      const merged = {
        ...(existing || {}),
        ...account,
        privateKey: account.privateKey || existing?.privateKey,
        publicKey: account.publicKey || existing?.publicKey,
      } as WalletAccount

      const targetId = existing?.id || account.id
      if (targetId) {
        this.walletAccounts.set(targetId, merged)
      }

      if (account.id && account.id !== targetId) {
        this.walletAccounts.set(account.id, merged)
      }

      if (coinType) {
        const active = this.activeWallets[coinType]
        if (active && active.id === (existing?.id || account.id)) {
          this.activeWallets[coinType] = merged as any
        }
      }
    }

    console.log(`[WalletRegistry] Wallet account store size: ${this.walletAccounts.size}`)
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
    const storedAccount = account.id ? this.walletAccounts.get(account.id) : undefined

    // Clear previous active flags for this coin type
    this.walletAccounts.forEach(existingAccount => {
      if (existingAccount.coinType === coinType) {
        existingAccount.isActive = existingAccount.id === account.id
      }
    })

    if (!storedAccount && account.id) {
      this.walletAccounts.set(account.id, account)
    }

    const resolvedAccount = storedAccount ?? account
    resolvedAccount.isActive = true

    this.activeWallets[coinType] = resolvedAccount as any
    console.log(`[WalletRegistry] Set active ${coinType} wallet:`, resolvedAccount.id)
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
    console.log(`[WalletRegistry] Added wallet account: ${account.id}`)
  }

  /**
   * Removes a wallet account
   */
  removeWalletAccount(accountId: string): boolean {
    const removed = this.walletAccounts.delete(accountId)
    if (removed) {
      console.log(`[WalletRegistry] Removed wallet account: ${accountId}`)
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

    console.log(`[WalletRegistry] Created ${accounts.length} new ${coinType} accounts`)
    return accounts
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
    console.log('[WalletRegistry] Reset all wallet data')
  }
}

/**
 * Global wallet registry instance
 */
export const walletRegistry = new WalletRegistry()
