/**
 * Zustand store for HD wallet management
 * Manages wallet accounts and active wallet selection per coin type
 */

import { create } from 'zustand'
import { subscribeWithSelector, persist } from 'zustand/middleware'
import { immer } from 'zustand/middleware/immer'
import { SIMULATOR_CONSTANTS } from '@/shared/constants'
import { defaultSafeCardName, generateSafeCardUid } from '@/shared/utils/safecard'
import {
  deriveSeedFromMnemonic,
  getWalletConfig,
  setWalletMnemonicOverride,
  normalizeMnemonic,
  validateMnemonic,
} from '@/shared/walletConfig'
import { useDeviceStore } from './clientDeviceStore'
import { sendSetActiveSafeCardCommand, sendSetActiveWalletCommand } from '../websocket/commands'
import type {
  WalletAccount,
  WalletCollection,
  ActiveWallets,
  WalletCoinType,
  WalletAccountType,
  SafeCard,
} from '@/shared/types/wallet'
// Dynamic imports to avoid SSR issues with crypto libraries
let walletServices: any = null

export async function getWalletServices() {
  if (walletServices) {
    return walletServices
  }

  try {
    const [ethereumWallet, bitcoinWallet, solanaWallet, cosmosWallet] = await Promise.all([
      import('@/shared/wallets/ethereum'),
      import('@/shared/wallets/bitcoin'),
      import('@/shared/wallets/solana'),
      import('@/shared/wallets/cosmos'),
    ])

    walletServices = {
      createMultipleEthereumAccounts: ethereumWallet.createMultipleEthereumAccounts,
      createEthereumAccount: ethereumWallet.createEthereumAccount,
      createMultipleBitcoinAccounts: bitcoinWallet.createMultipleBitcoinAccounts,
      createBitcoinAccount: bitcoinWallet.createBitcoinAccount,
      createMultipleSolanaAccounts: solanaWallet.createMultipleSolanaAccounts,
      createSolanaAccount: solanaWallet.createSolanaAccount,
      createMultipleCosmosAccounts: cosmosWallet.createMultipleCosmosAccounts,
      createCosmosAccount: cosmosWallet.createCosmosAccount,
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
    internal: [],
  },
  BTC: {
    external: [],
    internal: [],
  },
  SOL: {
    external: [],
    internal: [],
  },
  COSMOS: {
    external: [],
    internal: [],
  },
}

/**
 * Initial empty active wallets
 */
const INITIAL_ACTIVE_WALLETS: ActiveWallets = {
  ETH: undefined,
  BTC: undefined,
  SOL: undefined,
  COSMOS: undefined,
}

const INITIAL_SAFE_CARDS: SafeCard[] = []
const INITIAL_WALLETS_BY_SAFECARD: Record<number, WalletCollection> = {}
const INITIAL_ACTIVE_WALLETS_BY_SAFECARD: Record<number, ActiveWallets> = {}

/**
 * Wallet store state interface
 */
interface WalletState {
  /** All wallet accounts organized by coin type and account type */
  wallets: WalletCollection

  /** Currently active wallet for each coin type */
  activeWallets: ActiveWallets

  /** All SafeCards configured in the simulator */
  safeCards: SafeCard[]

  /** Currently active SafeCard ID */
  activeSafeCardId: number | null

  /** Wallet collections per SafeCard */
  walletsBySafeCard: Record<number, WalletCollection>

  /** Active wallets per SafeCard */
  activeWalletsBySafeCard: Record<number, ActiveWallets>

  /** Whether wallets have been initialized from mnemonic */
  isInitialized: boolean

  /** Loading state for wallet operations */
  isLoading: boolean

  /** Error message from wallet operations */
  error: string | null

  /** Active mnemonic used for wallet derivation */
  activeMnemonic: string | null

  /** Whether the wallet setup success prompt has been dismissed */
  hasDismissedSetupPrompt: boolean
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

  /** Persist a mnemonic override for deriving wallets */
  setActiveMnemonic: (mnemonic: string) => void

  /** Add a new SafeCard with its own mnemonic */
  addSafeCard: (params: { mnemonic: string; name?: string }) => Promise<void>

  /** Set the active SafeCard */
  setActiveSafeCard: (safeCardId: number) => void

  /** Get the active SafeCard */
  getActiveSafeCard: () => SafeCard | undefined

  // Account Management
  /** Create new accounts for a specific coin type */
  createAccounts: (
    coinType: WalletCoinType,
    type: WalletAccountType,
    count?: number,
  ) => Promise<void>

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

  /** Mark the wallet setup prompt as dismissed */
  dismissSetupPrompt: () => void

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
  safeCards: INITIAL_SAFE_CARDS,
  activeSafeCardId: null,
  walletsBySafeCard: INITIAL_WALLETS_BY_SAFECARD,
  activeWalletsBySafeCard: INITIAL_ACTIVE_WALLETS_BY_SAFECARD,
  isInitialized: false,
  isLoading: false,
  error: null,
  activeMnemonic: null,
  hasDismissedSetupPrompt: false,
}

const ensureWalletCollection = (wallets?: WalletCollection): WalletCollection => {
  const safeWallets = wallets ?? ({} as WalletCollection)
  return {
    ETH: { ...INITIAL_WALLET_COLLECTION.ETH, ...(safeWallets.ETH || {}) },
    BTC: { ...INITIAL_WALLET_COLLECTION.BTC, ...(safeWallets.BTC || {}) },
    SOL: { ...INITIAL_WALLET_COLLECTION.SOL, ...(safeWallets.SOL || {}) },
    COSMOS: { ...INITIAL_WALLET_COLLECTION.COSMOS, ...(safeWallets.COSMOS || {}) },
  }
}

const ensureActiveWallets = (activeWallets?: ActiveWallets): ActiveWallets => {
  return {
    ...INITIAL_ACTIVE_WALLETS,
    ...(activeWallets || {}),
  }
}

const resolveSafeCardWallets = (
  walletsBySafeCard: Record<number, WalletCollection> | undefined,
  safeCardId?: number | null,
): WalletCollection => {
  if (!safeCardId || !walletsBySafeCard || !walletsBySafeCard[safeCardId]) {
    return INITIAL_WALLET_COLLECTION
  }
  return ensureWalletCollection(walletsBySafeCard[safeCardId])
}

const resolveSafeCardActiveWallets = (
  activeWalletsBySafeCard: Record<number, ActiveWallets> | undefined,
  safeCardId?: number | null,
): ActiveWallets => {
  if (!safeCardId || !activeWalletsBySafeCard || !activeWalletsBySafeCard[safeCardId]) {
    return INITIAL_ACTIVE_WALLETS
  }
  return ensureActiveWallets(activeWalletsBySafeCard[safeCardId])
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
          set(state => {
            state.isLoading = true
            state.error = null
          })

          try {
            console.log('[WalletStore] Initializing wallets from mnemonic...')

            const defaultMnemonic = normalizeMnemonic(SIMULATOR_CONSTANTS.DEFAULT_MNEMONIC)

            // Determine which mnemonic to use and ensure the override is applied before derivation
            let mnemonic = get().activeMnemonic?.trim()
            if (!mnemonic) {
              const config = await getWalletConfig()
              mnemonic = config.mnemonic
              set(state => {
                state.activeMnemonic = mnemonic || null
              })
            }

            if (!mnemonic) {
              throw new Error('Mnemonic not available for wallet initialization')
            }

            const normalizedMnemonic = normalizeMnemonic(mnemonic)

            if (!validateMnemonic(normalizedMnemonic)) {
              throw new Error('Invalid mnemonic provided for wallet initialization')
            }

            const seed = await deriveSeedFromMnemonic(normalizedMnemonic)

            set(state => {
              state.activeMnemonic = normalizedMnemonic
            })

            setWalletMnemonicOverride(normalizedMnemonic)

            // Load wallet services dynamically
            const services = await getWalletServices()

            const safeCardId = 1
            const safeCard: SafeCard = {
              id: safeCardId,
              uid: generateSafeCardUid(safeCardId, 'external'),
              name: defaultSafeCardName(safeCardId),
              mnemonic: normalizedMnemonic,
              mnemonicSource: normalizedMnemonic === defaultMnemonic ? 'default' : 'custom',
              createdAt: Date.now(),
            }

            const idPrefix = `safecard-${safeCardId}`
            const accountOptions = { seed, idPrefix }

            // Create initial external accounts for each coin type (first 5 accounts)
            const [ethAccounts, btcAccounts, solAccounts, cosmosAccounts] = await Promise.all([
              services.createMultipleEthereumAccounts(0, 'external', 5, 0, accountOptions),
              services.createMultipleBitcoinAccounts(
                0,
                'external',
                'segwit',
                5,
                0,
                'mainnet',
                accountOptions,
              ),
              services.createMultipleSolanaAccounts(0, 'external', 5, 0, accountOptions),
              services.createMultipleCosmosAccounts(0, 'external', 5, 0, accountOptions),
            ])

            // Create initial internal accounts for each coin type (first 2 accounts)
            const [
              ethInternalAccounts,
              btcInternalAccounts,
              solInternalAccounts,
              cosmosInternalAccounts,
            ] = await Promise.all([
              services.createMultipleEthereumAccounts(0, 'internal', 2, 0, accountOptions),
              services.createMultipleBitcoinAccounts(
                0,
                'internal',
                'segwit',
                2,
                0,
                'mainnet',
                accountOptions,
              ),
              services.createMultipleSolanaAccounts(0, 'internal', 2, 0, accountOptions),
              services.createMultipleCosmosAccounts(0, 'internal', 2, 0, accountOptions),
            ])

            set(state => {
              // Seed SafeCard state
              state.safeCards = [safeCard]
              state.activeSafeCardId = safeCardId

              state.walletsBySafeCard = {
                [safeCardId]: {
                  ETH: { external: ethAccounts, internal: ethInternalAccounts },
                  BTC: { external: btcAccounts, internal: btcInternalAccounts },
                  SOL: { external: solAccounts, internal: solInternalAccounts },
                  COSMOS: { external: cosmosAccounts, internal: cosmosInternalAccounts },
                },
              }

              // Set first external account as active for each coin
              const activeWallets: ActiveWallets = {
                ETH: ethAccounts[0],
                BTC: btcAccounts[0],
                SOL: solAccounts[0],
                COSMOS: cosmosAccounts[0],
              }

              if (ethAccounts.length > 0) {
                ethAccounts[0].isActive = true
              }
              if (btcAccounts.length > 0) {
                btcAccounts[0].isActive = true
              }
              if (solAccounts.length > 0) {
                solAccounts[0].isActive = true
              }
              if (cosmosAccounts.length > 0) {
                cosmosAccounts[0].isActive = true
              }

              state.activeWalletsBySafeCard = {
                [safeCardId]: activeWallets,
              }

              // Set active SafeCard view
              state.wallets = state.walletsBySafeCard[safeCardId]
              state.activeWallets = activeWallets

              state.isInitialized = true
              state.isLoading = false
            })

            console.log('[WalletStore] Wallets initialized successfully')
            console.log(
              `- ETH: ${ethAccounts.length + ethInternalAccounts.length} accounts (${ethAccounts.length} external, ${ethInternalAccounts.length} internal)`,
            )
            console.log(
              `- BTC: ${btcAccounts.length + btcInternalAccounts.length} accounts (${btcAccounts.length} external, ${btcInternalAccounts.length} internal)`,
            )
            console.log(
              `- SOL: ${solAccounts.length + solInternalAccounts.length} accounts (${solAccounts.length} external, ${solInternalAccounts.length} internal)`,
            )
            console.log(
              `- COSMOS: ${cosmosAccounts.length + cosmosInternalAccounts.length} accounts (${cosmosAccounts.length} external, ${cosmosInternalAccounts.length} internal)`,
            )
          } catch (error) {
            console.error('[WalletStore] Failed to initialize wallets:', error)
            set(state => {
              state.isLoading = false
              state.error = error instanceof Error ? error.message : 'Failed to initialize wallets'
            })
          }
        },

        clearWallets: () => {
          set(state => {
            state.wallets = INITIAL_WALLET_COLLECTION
            state.activeWallets = INITIAL_ACTIVE_WALLETS
            state.safeCards = INITIAL_SAFE_CARDS
            state.activeSafeCardId = null
            state.walletsBySafeCard = INITIAL_WALLETS_BY_SAFECARD
            state.activeWalletsBySafeCard = INITIAL_ACTIVE_WALLETS_BY_SAFECARD
            state.isInitialized = false
            state.error = null
            state.activeMnemonic = null
            state.hasDismissedSetupPrompt = false
          })
          setWalletMnemonicOverride(null)
          console.log('[WalletStore] Wallets cleared')
        },

        setActiveMnemonic: (mnemonic: string) => {
          const sanitized = mnemonic.trim()
          const normalized = sanitized.length > 0 ? normalizeMnemonic(sanitized) : null

          if (sanitized.length > 0 && normalized && !validateMnemonic(normalized)) {
            console.warn('[WalletStore] Ignoring invalid mnemonic set attempt')
            return
          }

          set(state => {
            state.activeMnemonic = normalized
          })
          setWalletMnemonicOverride(normalized)
        },

        addSafeCard: async ({ mnemonic, name }) => {
          set(state => {
            state.isLoading = true
            state.error = null
          })

          try {
            const normalizedMnemonic = normalizeMnemonic(mnemonic)
            if (!validateMnemonic(normalizedMnemonic)) {
              throw new Error('Invalid mnemonic provided for SafeCard')
            }

            const seed = await deriveSeedFromMnemonic(normalizedMnemonic)
            const safeCards = get().safeCards
            const nextId =
              safeCards.length > 0 ? Math.max(...safeCards.map(card => card.id)) + 1 : 1
            const defaultName = defaultSafeCardName(nextId)
            const resolvedName = name && name.trim().length > 0 ? name.trim() : defaultName

            const safeCard: SafeCard = {
              id: nextId,
              uid: generateSafeCardUid(nextId, 'external'),
              name: resolvedName,
              mnemonic: normalizedMnemonic,
              mnemonicSource:
                normalizedMnemonic === normalizeMnemonic(SIMULATOR_CONSTANTS.DEFAULT_MNEMONIC)
                  ? 'default'
                  : 'custom',
              createdAt: Date.now(),
            }

            const idPrefix = `safecard-${safeCard.id}`
            const accountOptions = { seed, idPrefix }

            const services = await getWalletServices()
            const [ethAccounts, btcAccounts, solAccounts, cosmosAccounts] = await Promise.all([
              services.createMultipleEthereumAccounts(0, 'external', 5, 0, accountOptions),
              services.createMultipleBitcoinAccounts(
                0,
                'external',
                'segwit',
                5,
                0,
                'mainnet',
                accountOptions,
              ),
              services.createMultipleSolanaAccounts(0, 'external', 5, 0, accountOptions),
              services.createMultipleCosmosAccounts(0, 'external', 5, 0, accountOptions),
            ])

            const [
              ethInternalAccounts,
              btcInternalAccounts,
              solInternalAccounts,
              cosmosInternalAccounts,
            ] = await Promise.all([
              services.createMultipleEthereumAccounts(0, 'internal', 2, 0, accountOptions),
              services.createMultipleBitcoinAccounts(
                0,
                'internal',
                'segwit',
                2,
                0,
                'mainnet',
                accountOptions,
              ),
              services.createMultipleSolanaAccounts(0, 'internal', 2, 0, accountOptions),
              services.createMultipleCosmosAccounts(0, 'internal', 2, 0, accountOptions),
            ])

            set(state => {
              state.safeCards.push(safeCard)
              state.activeSafeCardId = safeCard.id

              state.walletsBySafeCard[safeCard.id] = {
                ETH: { external: ethAccounts, internal: ethInternalAccounts },
                BTC: { external: btcAccounts, internal: btcInternalAccounts },
                SOL: { external: solAccounts, internal: solInternalAccounts },
                COSMOS: { external: cosmosAccounts, internal: cosmosInternalAccounts },
              }

              if (ethAccounts.length > 0) {
                ethAccounts[0].isActive = true
              }
              if (btcAccounts.length > 0) {
                btcAccounts[0].isActive = true
              }
              if (solAccounts.length > 0) {
                solAccounts[0].isActive = true
              }
              if (cosmosAccounts.length > 0) {
                cosmosAccounts[0].isActive = true
              }

              state.activeWalletsBySafeCard[safeCard.id] = {
                ETH: ethAccounts[0],
                BTC: btcAccounts[0],
                SOL: solAccounts[0],
                COSMOS: cosmosAccounts[0],
              }

              state.wallets = state.walletsBySafeCard[safeCard.id]
              state.activeWallets = state.activeWalletsBySafeCard[safeCard.id]
              state.activeMnemonic = safeCard.mnemonic
              state.isInitialized = true
              state.isLoading = false
            })

            setWalletMnemonicOverride(normalizedMnemonic)

            const deviceState = useDeviceStore.getState()
            const deviceId = deviceState.deviceInfo?.deviceId

            if (deviceState.isConnected && deviceId) {
              sendSetActiveSafeCardCommand(deviceId, {
                safeCardId: safeCard.id,
                uid: safeCard.uid,
                name: safeCard.name,
                mnemonic: safeCard.mnemonic,
              })
            }

            console.log('[WalletStore] Added SafeCard', safeCard)
          } catch (error) {
            console.error('[WalletStore] Failed to add SafeCard:', error)
            set(state => {
              state.isLoading = false
              state.error = error instanceof Error ? error.message : 'Failed to add SafeCard'
            })
          }
        },

        setActiveSafeCard: (safeCardId: number) => {
          const safeCard = get().safeCards.find(card => card.id === safeCardId)
          if (!safeCard) {
            console.warn('[WalletStore] SafeCard not found:', safeCardId)
            return
          }

          set(state => {
            state.activeSafeCardId = safeCardId
            state.wallets = resolveSafeCardWallets(state.walletsBySafeCard, safeCardId)
            state.activeWallets = resolveSafeCardActiveWallets(
              state.activeWalletsBySafeCard,
              safeCardId,
            )
            state.activeMnemonic = safeCard.mnemonic
          })

          setWalletMnemonicOverride(safeCard.mnemonic)

          const deviceState = useDeviceStore.getState()
          const deviceId = deviceState.deviceInfo?.deviceId

          if (deviceState.isConnected && deviceId) {
            sendSetActiveSafeCardCommand(deviceId, {
              safeCardId: safeCard.id,
              uid: safeCard.uid,
              name: safeCard.name,
              mnemonic: safeCard.mnemonic,
            })

            const activeWallets = get().activeWalletsBySafeCard[safeCardId]
            if (activeWallets) {
              ;(['ETH', 'BTC', 'SOL', 'COSMOS'] as WalletCoinType[]).forEach(coinType => {
                const account = activeWallets[coinType]
                if (account?.id) {
                  sendSetActiveWalletCommand(deviceId, coinType, account.id)
                }
              })
            }
          }
        },

        getActiveSafeCard: () => {
          const { safeCards, activeSafeCardId } = get()
          return safeCards.find(card => card.id === activeSafeCardId)
        },

        // Account Management
        createAccounts: async (coinType: WalletCoinType, type: WalletAccountType, count = 1) => {
          set(state => {
            state.isLoading = true
            state.error = null
          })

          try {
            const { activeSafeCardId, safeCards, walletsBySafeCard } = get()
            const safeCard = safeCards.find(card => card.id === activeSafeCardId)

            if (!safeCard || !activeSafeCardId) {
              throw new Error('Active SafeCard not available')
            }

            const safeCardWallets = walletsBySafeCard[activeSafeCardId] ?? ensureWalletCollection()
            const currentAccounts = safeCardWallets[coinType][type]
            const nextAccountIndex = currentAccounts.length
            const seed = await deriveSeedFromMnemonic(safeCard.mnemonic)
            const idPrefix = `safecard-${safeCard.id}`
            const accountOptions = { seed, idPrefix }

            // Load wallet services dynamically
            const services = await getWalletServices()

            let newAccounts: WalletAccount[]

            switch (coinType) {
              case 'ETH':
                newAccounts = await services.createMultipleEthereumAccounts(
                  0,
                  type,
                  count,
                  nextAccountIndex,
                  accountOptions,
                )
                break
              case 'BTC':
                newAccounts = await services.createMultipleBitcoinAccounts(
                  0,
                  type,
                  'segwit',
                  count,
                  nextAccountIndex,
                  'mainnet',
                  accountOptions,
                )
                break
              case 'SOL':
                newAccounts = await services.createMultipleSolanaAccounts(
                  0,
                  type,
                  count,
                  nextAccountIndex,
                  accountOptions,
                )
                break
              case 'COSMOS':
                newAccounts = await services.createMultipleCosmosAccounts(
                  0,
                  type,
                  count,
                  nextAccountIndex,
                  accountOptions,
                )
                break
              default:
                throw new Error(`Unsupported coin type: ${coinType}`)
            }

            set(state => {
              if (!state.walletsBySafeCard[activeSafeCardId]) {
                state.walletsBySafeCard[activeSafeCardId] = ensureWalletCollection()
              }

              state.walletsBySafeCard[activeSafeCardId][coinType][type].push(
                ...(newAccounts as any),
              )

              if (state.activeSafeCardId === activeSafeCardId) {
                state.wallets = state.walletsBySafeCard[activeSafeCardId]
              }

              state.isLoading = false
            })

            console.log(`[WalletStore] Created ${count} new ${type} ${coinType} accounts`)
          } catch (error) {
            console.error(`[WalletStore] Failed to create ${coinType} accounts:`, error)
            set(state => {
              state.isLoading = false
              state.error =
                error instanceof Error ? error.message : `Failed to create ${coinType} accounts`
            })
          }
        },

        getAccountsByCoin: (coinType: WalletCoinType) => {
          const state = get()
          return [...state.wallets[coinType].external, ...state.wallets[coinType].internal]
        },

        getAccountsByType: (type: WalletAccountType) => {
          const state = get()
          return [
            ...state.wallets.ETH[type],
            ...state.wallets.BTC[type],
            ...state.wallets.SOL[type],
            ...state.wallets.COSMOS[type],
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
            ...state.wallets.SOL.internal,
            ...state.wallets.COSMOS.external,
            ...state.wallets.COSMOS.internal,
          ]
          return allAccounts.find(account => account.id === id)
        },

        // Active Wallet Management
        setActiveWallet: (coinType: WalletCoinType, account: WalletAccount) => {
          set(state => {
            const safeCardId = state.activeSafeCardId
            if (!safeCardId || !state.walletsBySafeCard[safeCardId]) {
              return
            }

            const safeCardWallets = state.walletsBySafeCard[safeCardId]
            const safeCardActiveWallets =
              state.activeWalletsBySafeCard[safeCardId] ?? ensureActiveWallets()

            // Clear previous active wallet for this coin type
            const currentActive = safeCardActiveWallets[coinType]
            if (currentActive) {
              const currentAccount = safeCardWallets[coinType][currentActive.type].find(
                a => a.id === currentActive.id,
              )
              if (currentAccount) {
                currentAccount.isActive = false
              }
            }

            // Set new active wallet
            const targetAccount = safeCardWallets[coinType][account.type].find(
              a => a.id === account.id,
            )
            if (targetAccount) {
              targetAccount.isActive = true
              safeCardActiveWallets[coinType] = targetAccount as any
              state.activeWalletsBySafeCard[safeCardId] = safeCardActiveWallets
              state.activeWallets = safeCardActiveWallets
              state.wallets = safeCardWallets
            }
          })

          console.log(
            `[WalletStore] Set active ${coinType} wallet: ${account.name} (${account.address})`,
          )

          const deviceState = useDeviceStore.getState()
          const deviceId = deviceState.deviceInfo?.deviceId

          if (deviceState.isConnected && deviceId && account.id) {
            sendSetActiveWalletCommand(deviceId, coinType, account.id)
          }
        },

        getActiveWallet: (coinType: WalletCoinType) => {
          return get().activeWallets[coinType]
        },

        dismissSetupPrompt: () => {
          set(state => {
            state.hasDismissedSetupPrompt = true
          })
        },

        // Error Management
        setError: (error: string | null) => {
          set(state => {
            state.error = error
          })
        },

        clearError: () => {
          set(state => {
            state.error = null
          })
        },
      })),
    ),
    {
      name: 'lattice-wallet-store',
      version: 4,
      migrate: (persistedState, version) => {
        if (!persistedState || typeof persistedState !== 'object') {
          return persistedState as WalletState
        }

        const state = persistedState as WalletState

        if (version < 4) {
          const defaultMnemonic = normalizeMnemonic(SIMULATOR_CONSTANTS.DEFAULT_MNEMONIC)
          const normalizedMnemonic = state.activeMnemonic
            ? normalizeMnemonic(state.activeMnemonic)
            : defaultMnemonic
          const safeCardId = 1
          const safeCard: SafeCard = {
            id: safeCardId,
            uid: generateSafeCardUid(safeCardId, 'external'),
            name: defaultSafeCardName(safeCardId),
            mnemonic: normalizedMnemonic,
            mnemonicSource: normalizedMnemonic === defaultMnemonic ? 'default' : 'custom',
            createdAt: Date.now(),
          }

          const migratedWallets = ensureWalletCollection(state.wallets)
          const migratedActiveWallets = ensureActiveWallets(state.activeWallets)

          return {
            ...state,
            safeCards: [safeCard],
            activeSafeCardId: safeCardId,
            walletsBySafeCard: {
              [safeCardId]: migratedWallets,
            },
            activeWalletsBySafeCard: {
              [safeCardId]: migratedActiveWallets,
            },
            wallets: migratedWallets,
            activeWallets: migratedActiveWallets,
            activeMnemonic: normalizedMnemonic,
          }
        }

        return {
          ...state,
          wallets: ensureWalletCollection(state.wallets),
          activeWallets: ensureActiveWallets(state.activeWallets),
        }
      },
      // Only persist essential data, not loading states or errors
      partialize: state => ({
        wallets: state.wallets,
        activeWallets: state.activeWallets,
        safeCards: state.safeCards,
        activeSafeCardId: state.activeSafeCardId,
        walletsBySafeCard: state.walletsBySafeCard,
        activeWalletsBySafeCard: state.activeWalletsBySafeCard,
        isInitialized: state.isInitialized,
        activeMnemonic: state.activeMnemonic,
        hasDismissedSetupPrompt: state.hasDismissedSetupPrompt,
      }),
      onRehydrateStorage: () => state => {
        if (!state) {
          return
        }

        const activeSafeCardId = state.activeSafeCardId ?? state.safeCards?.[0]?.id
        const activeSafeCard = state.safeCards?.find(card => card.id === activeSafeCardId)

        if (!state.activeSafeCardId && activeSafeCardId) {
          state.activeSafeCardId = activeSafeCardId
        }

        state.wallets = resolveSafeCardWallets(state.walletsBySafeCard, activeSafeCardId)
        state.activeWallets = resolveSafeCardActiveWallets(
          state.activeWalletsBySafeCard,
          activeSafeCardId,
        )

        const mnemonic = activeSafeCard?.mnemonic?.trim() || state.activeMnemonic?.trim()
        state.activeMnemonic = mnemonic || null
        setWalletMnemonicOverride(mnemonic && mnemonic.length > 0 ? mnemonic : null)

        if (state && typeof state.hasDismissedSetupPrompt === 'undefined') {
          state.hasDismissedSetupPrompt = !!state.isInitialized
        }
      },
    },
  ),
)

/**
 * Hook to get wallet statistics
 */
export const useWalletStats = () => {
  return useWalletStore(state => {
    const ethCount = state.wallets.ETH.external.length + state.wallets.ETH.internal.length
    const btcCount = state.wallets.BTC.external.length + state.wallets.BTC.internal.length
    const solCount = state.wallets.SOL.external.length + state.wallets.SOL.internal.length
    const cosmosCount =
      (state.wallets.COSMOS?.external.length || 0) + (state.wallets.COSMOS?.internal.length || 0)

    return {
      totalAccounts: ethCount + btcCount + solCount + cosmosCount,
      accountsByType: {
        ETH: ethCount,
        BTC: btcCount,
        SOL: solCount,
        COSMOS: cosmosCount,
      },
      activeWallets: state.activeWallets,
      isInitialized: state.isInitialized,
    }
  })
}
