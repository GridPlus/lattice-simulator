/**
 * Zustand store for HD wallet management
 * Manages wallet accounts and active wallet selection per coin type
 */

import { create } from 'zustand'
import { subscribeWithSelector, persist } from 'zustand/middleware'
import { immer } from 'zustand/middleware/immer'
import type {
  WalletAccount,
  WalletCollection,
  ActiveWallets,
  WalletCoinType,
  WalletAccountType,
  EthereumWalletAccount,
  BitcoinWalletAccount,
  SolanaWalletAccount
} from '../types/wallet'
// Dynamic imports to avoid SSR issues with crypto libraries
let walletServices: any = null

async function getWalletServices() {
  if (walletServices) {
    return walletServices
  }

  try {
    const [ethereumWallet, bitcoinWallet, solanaWallet] = await Promise.all([
      import('../services/ethereumWallet'),
      import('../services/bitcoinWallet'), 
      import('../services/solanaWallet')
    ])

    walletServices = {
      createMultipleEthereumAccounts: ethereumWallet.createMultipleEthereumAccounts,
      createEthereumAccount: ethereumWallet.createEthereumAccount,
      createMultipleBitcoinAccounts: bitcoinWallet.createMultipleBitcoinAccounts,
      createBitcoinAccount: bitcoinWallet.createBitcoinAccount,
      createMultipleSolanaAccounts: solanaWallet.createMultipleSolanaAccounts,
      createSolanaAccount: solanaWallet.createSolanaAccount,
    }

    return walletServices
  } catch (error) {
    console.error('Failed to load wallet services:', error)
    throw error
  }
}

/**
 * Initial empty wallet collection
 */
const INITIAL_WALLET_COLLECTION: WalletCollection = {
  ETH: {
    external: [],
    internal: []
  },
  BTC: {
    external: [],
    internal: []
  },
  SOL: {
    external: [],
    internal: []
  }
}

/**
 * Initial empty active wallets
 */
const INITIAL_ACTIVE_WALLETS: ActiveWallets = {
  ETH: undefined,
  BTC: undefined,
  SOL: undefined
}

/**
 * Wallet store state interface
 */
interface WalletState {
  /** All wallet accounts organized by coin type and account type */
  wallets: WalletCollection
  
  /** Currently active wallet for each coin type */
  activeWallets: ActiveWallets
  
  /** Whether wallets have been initialized from mnemonic */
  isInitialized: boolean
  
  /** Loading state for wallet operations */
  isLoading: boolean
  
  /** Error message from wallet operations */
  error: string | null
}

/**
 * Wallet store actions interface
 */
interface WalletActions {
  // Initialization
  /** Initialize wallets from mnemonic with default accounts */
  initializeWallets: () => Promise<void>
  
  /** Clear all wallet data */
  clearWallets: () => void
  
  // Account Management
  /** Create new accounts for a specific coin type */
  createAccounts: (coinType: WalletCoinType, type: WalletAccountType, count?: number) => Promise<void>
  
  /** Get all accounts for a specific coin type */
  getAccountsByCoin: (coinType: WalletCoinType) => WalletAccount[]
  
  /** Get accounts by type (external/internal) */
  getAccountsByType: (type: WalletAccountType) => WalletAccount[]
  
  /** Find account by ID */
  getAccountById: (id: string) => WalletAccount | undefined
  
  // Active Wallet Management
  /** Set active wallet for a coin type */
  setActiveWallet: (coinType: WalletCoinType, account: WalletAccount) => void
  
  /** Get active wallet for a coin type */
  getActiveWallet: (coinType: WalletCoinType) => WalletAccount | undefined
  
  // Error Management
  /** Set error message */
  setError: (error: string | null) => void
  
  /** Clear error message */
  clearError: () => void
}

/**
 * Combined wallet store interface
 */
interface WalletStore extends WalletState, WalletActions {}

/**
 * Initial state for the wallet store
 */
const INITIAL_WALLET_STATE: WalletState = {
  wallets: INITIAL_WALLET_COLLECTION,
  activeWallets: INITIAL_ACTIVE_WALLETS,
  isInitialized: false,
  isLoading: false,
  error: null
}

/**
 * Zustand wallet store with persistence
 */
export const useWalletStore = create<WalletStore>()(
  persist(
    subscribeWithSelector(
      immer<WalletStore>((set, get) => ({
        ...INITIAL_WALLET_STATE,

        // Initialization
        initializeWallets: async () => {
          set((state) => {
            state.isLoading = true
            state.error = null
          })

          try {
            console.log('[WalletStore] Initializing wallets from mnemonic...')
            
            // Load wallet services dynamically
            const services = await getWalletServices()

            // Create initial external accounts for each coin type (first 5 accounts)
            const [ethAccounts, btcAccounts, solAccounts] = await Promise.all([
              services.createMultipleEthereumAccounts(0, 'external', 5, 0),
              services.createMultipleBitcoinAccounts(0, 'external', 'segwit', 5, 0),
              services.createMultipleSolanaAccounts(0, 'external', 5, 0)
            ])

            // Create initial internal accounts for each coin type (first 2 accounts)
            const [ethInternalAccounts, btcInternalAccounts, solInternalAccounts] = await Promise.all([
              services.createMultipleEthereumAccounts(0, 'internal', 2, 0),
              services.createMultipleBitcoinAccounts(0, 'internal', 'segwit', 2, 0),
              services.createMultipleSolanaAccounts(0, 'internal', 2, 0)
            ])

            set((state) => {
              // Set wallet accounts
              state.wallets.ETH.external = ethAccounts
              state.wallets.ETH.internal = ethInternalAccounts
              state.wallets.BTC.external = btcAccounts
              state.wallets.BTC.internal = btcInternalAccounts
              state.wallets.SOL.external = solAccounts
              state.wallets.SOL.internal = solInternalAccounts

              // Set first external account as active for each coin
              if (ethAccounts.length > 0) {
                ethAccounts[0].isActive = true
                state.activeWallets.ETH = ethAccounts[0]
              }
              if (btcAccounts.length > 0) {
                btcAccounts[0].isActive = true
                state.activeWallets.BTC = btcAccounts[0]
              }
              if (solAccounts.length > 0) {
                solAccounts[0].isActive = true
                state.activeWallets.SOL = solAccounts[0]
              }

              state.isInitialized = true
              state.isLoading = false
            })

            console.log('[WalletStore] Wallets initialized successfully')
            console.log(`- ETH: ${ethAccounts.length + ethInternalAccounts.length} accounts (${ethAccounts.length} external, ${ethInternalAccounts.length} internal)`)
            console.log(`- BTC: ${btcAccounts.length + btcInternalAccounts.length} accounts (${btcAccounts.length} external, ${btcInternalAccounts.length} internal)`)
            console.log(`- SOL: ${solAccounts.length + solInternalAccounts.length} accounts (${solAccounts.length} external, ${solInternalAccounts.length} internal)`)

          } catch (error) {
            console.error('[WalletStore] Failed to initialize wallets:', error)
            set((state) => {
              state.isLoading = false
              state.error = error instanceof Error ? error.message : 'Failed to initialize wallets'
            })
          }
        },

        clearWallets: () => {
          set((state) => {
            state.wallets = INITIAL_WALLET_COLLECTION
            state.activeWallets = INITIAL_ACTIVE_WALLETS
            state.isInitialized = false
            state.error = null
          })
          console.log('[WalletStore] Wallets cleared')
        },

        // Account Management
        createAccounts: async (coinType: WalletCoinType, type: WalletAccountType, count = 1) => {
          set((state) => {
            state.isLoading = true
            state.error = null
          })

          try {
            const currentAccounts = get().wallets[coinType][type]
            const nextAccountIndex = currentAccounts.length
            
            // Load wallet services dynamically
            const services = await getWalletServices()

            let newAccounts: WalletAccount[]

            switch (coinType) {
              case 'ETH':
                newAccounts = await services.createMultipleEthereumAccounts(0, type, count, nextAccountIndex)
                break
              case 'BTC':
                newAccounts = await services.createMultipleBitcoinAccounts(0, type, 'segwit', count, nextAccountIndex)
                break
              case 'SOL':
                newAccounts = await services.createMultipleSolanaAccounts(0, type, count, nextAccountIndex)
                break
              default:
                throw new Error(`Unsupported coin type: ${coinType}`)
            }

            set((state) => {
              state.wallets[coinType][type].push(...(newAccounts as any))
              state.isLoading = false
            })

            console.log(`[WalletStore] Created ${count} new ${type} ${coinType} accounts`)

          } catch (error) {
            console.error(`[WalletStore] Failed to create ${coinType} accounts:`, error)
            set((state) => {
              state.isLoading = false
              state.error = error instanceof Error ? error.message : `Failed to create ${coinType} accounts`
            })
          }
        },

        getAccountsByCoin: (coinType: WalletCoinType) => {
          const state = get()
          return [
            ...state.wallets[coinType].external,
            ...state.wallets[coinType].internal
          ]
        },

        getAccountsByType: (type: WalletAccountType) => {
          const state = get()
          return [
            ...state.wallets.ETH[type],
            ...state.wallets.BTC[type],
            ...state.wallets.SOL[type]
          ]
        },

        getAccountById: (id: string) => {
          const state = get()
          const allAccounts = [
            ...state.wallets.ETH.external,
            ...state.wallets.ETH.internal,
            ...state.wallets.BTC.external,
            ...state.wallets.BTC.internal,
            ...state.wallets.SOL.external,
            ...state.wallets.SOL.internal
          ]
          return allAccounts.find(account => account.id === id)
        },

        // Active Wallet Management
        setActiveWallet: (coinType: WalletCoinType, account: WalletAccount) => {
          set((state) => {
            // Clear previous active wallet for this coin type
            const currentActive = state.activeWallets[coinType]
            if (currentActive) {
              const currentAccount = state.wallets[coinType][currentActive.type].find(a => a.id === currentActive.id)
              if (currentAccount) {
                currentAccount.isActive = false
              }
            }

            // Set new active wallet
            const targetAccount = state.wallets[coinType][account.type].find(a => a.id === account.id)
            if (targetAccount) {
              targetAccount.isActive = true
              state.activeWallets[coinType] = targetAccount as any // Type assertion needed due to union type complexity
            }
          })

          console.log(`[WalletStore] Set active ${coinType} wallet: ${account.name} (${account.address})`)
        },

        getActiveWallet: (coinType: WalletCoinType) => {
          return get().activeWallets[coinType]
        },

        // Error Management
        setError: (error: string | null) => {
          set((state) => {
            state.error = error
          })
        },

        clearError: () => {
          set((state) => {
            state.error = null
          })
        }
      }))
    ),
    {
      name: 'lattice-wallet-store',
      version: 1,
      // Only persist essential data, not loading states or errors
      partialize: (state) => ({
        wallets: state.wallets,
        activeWallets: state.activeWallets,
        isInitialized: state.isInitialized
      })
    }
  )
)

/**
 * Hook to get wallet statistics
 */
export const useWalletStats = () => {
  return useWalletStore((state) => {
    const ethCount = state.wallets.ETH.external.length + state.wallets.ETH.internal.length
    const btcCount = state.wallets.BTC.external.length + state.wallets.BTC.internal.length
    const solCount = state.wallets.SOL.external.length + state.wallets.SOL.internal.length
    
    return {
      totalAccounts: ethCount + btcCount + solCount,
      accountsByType: {
        ETH: ethCount,
        BTC: btcCount,
        SOL: solCount
      },
      activeWallets: state.activeWallets,
      isInitialized: state.isInitialized
    }
  })
}