/**
 * CLIENT-SIDE ONLY Zustand store for transaction history management
 *
 * ⚠️  IMPORTANT: This store is CLIENT-SIDE ONLY and cannot be imported or used by server-side code.
 * Manages completed transactions (approved/rejected signing requests) for the UI.
 */

import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { TransactionRecord, SigningRequest } from '@/shared/types/device'

/**
 * Transaction history store state
 */
interface TransactionHistoryState {
  /** Array of completed transactions */
  transactions: TransactionRecord[]
  /** Current filter settings */
  filters: {
    coinType?: 'ETH' | 'BTC' | 'SOL' | 'COSMOS' | 'ALL'
    status?: 'approved' | 'rejected' | 'ALL'
    type?: 'transaction' | 'message' | 'ALL'
    dateRange?: {
      from?: number
      to?: number
    }
  }
  /** Pagination settings */
  pagination: {
    page: number
    pageSize: number
    total: number
  }
  /** Whether the store has been rehydrated from persistence */
  _hasHydrated: boolean
}

/**
 * Transaction history store actions
 */
interface TransactionHistoryActions {
  /** Add a new transaction record */
  addTransaction: (transaction: TransactionRecord) => void

  /** Remove a transaction by ID */
  removeTransaction: (id: string) => void

  /** Clear all transactions */
  clearTransactions: () => void

  /** Get filtered and paginated transactions */
  getFilteredTransactions: () => TransactionRecord[]

  /** Update filter settings */
  setFilters: (filters: Partial<TransactionHistoryState['filters']>) => void

  /** Reset filters to default */
  resetFilters: () => void

  /** Update pagination settings */
  setPagination: (pagination: Partial<TransactionHistoryState['pagination']>) => void

  /** Get transaction by ID */
  getTransaction: (id: string) => TransactionRecord | undefined

  /** Get transactions by coin type */
  getTransactionsByCoin: (coinType: 'ETH' | 'BTC' | 'SOL' | 'COSMOS') => TransactionRecord[]

  /** Get recent transactions (last N) */
  getRecentTransactions: (count: number) => TransactionRecord[]

  /** Get transaction statistics */
  getStats: () => {
    total: number
    approved: number
    rejected: number
    byCoin: Record<'ETH' | 'BTC' | 'SOL' | 'COSMOS', number>
    byType: Record<'transaction' | 'message', number>
  }

  /** Create transaction from approved signing request */
  createApprovedTransaction: (
    request: SigningRequest,
    signature: Buffer,
    recovery?: number,
    metadata?: Partial<TransactionRecord['metadata']>,
  ) => TransactionRecord

  /** Create transaction from rejected signing request */
  createRejectedTransaction: (
    request: SigningRequest,
    metadata?: Partial<TransactionRecord['metadata']>,
  ) => TransactionRecord

  /** Set hydration status */
  setHasHydrated: (hasHydrated: boolean) => void

  /** Reset the entire transaction store to its initial state */
  resetStore: () => void
}

type TransactionStore = TransactionHistoryState & TransactionHistoryActions

const DEFAULT_FILTERS: TransactionHistoryState['filters'] = {
  coinType: 'ALL',
  status: 'ALL',
  type: 'ALL',
  dateRange: undefined,
}

const DEFAULT_PAGINATION: TransactionHistoryState['pagination'] = {
  page: 1,
  pageSize: 20,
  total: 0,
}

const INITIAL_STATE: TransactionHistoryState = {
  transactions: [],
  filters: DEFAULT_FILTERS,
  pagination: DEFAULT_PAGINATION,
  _hasHydrated: false,
}

/**
 * Generate unique transaction ID
 */
const generateTransactionId = (): string => {
  return `tx_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
}

/**
 * Check if running on client side
 */
const isClient = typeof window !== 'undefined'

/**
 * CLIENT-SIDE ONLY Transaction History Store
 *
 * Manages completed signing operations (transactions and messages) with:
 * - Persistent storage across sessions
 * - Filtering and pagination
 * - Statistics and search capabilities
 * - Integration with device store for completed requests
 */
export const useTransactionStore = create<TransactionStore>()(
  persist(
    (set, get) => ({
      ...INITIAL_STATE,

      // Actions
      addTransaction: (transaction: TransactionRecord) => {
        set(state => {
          const newTransactions = [transaction, ...state.transactions]
          return {
            transactions: newTransactions,
            pagination: {
              ...state.pagination,
              total: newTransactions.length,
            },
          }
        })
        console.log(`[TransactionStore] Added transaction: ${transaction.id}`)
      },

      removeTransaction: (id: string) => {
        set(state => {
          const newTransactions = state.transactions.filter(tx => tx.id !== id)
          return {
            transactions: newTransactions,
            pagination: {
              ...state.pagination,
              total: newTransactions.length,
            },
          }
        })
        console.log(`[TransactionStore] Removed transaction: ${id}`)
      },

      clearTransactions: () => {
        set({
          transactions: [],
          pagination: {
            ...DEFAULT_PAGINATION,
            total: 0,
          },
        })
        console.log('[TransactionStore] Cleared all transactions')
      },

      getFilteredTransactions: () => {
        const { transactions, filters, pagination } = get()

        let filtered = transactions

        // Apply filters
        if (filters.coinType && filters.coinType !== 'ALL') {
          filtered = filtered.filter(tx => tx.coinType === filters.coinType)
        }

        if (filters.status && filters.status !== 'ALL') {
          filtered = filtered.filter(tx => tx.status === filters.status)
        }

        if (filters.type && filters.type !== 'ALL') {
          filtered = filtered.filter(tx => tx.type === filters.type)
        }

        if (filters.dateRange?.from) {
          filtered = filtered.filter(tx => tx.timestamp >= filters.dateRange!.from!)
        }

        if (filters.dateRange?.to) {
          filtered = filtered.filter(tx => tx.timestamp <= filters.dateRange!.to!)
        }

        // Sort by timestamp (newest first)
        filtered.sort((a, b) => b.timestamp - a.timestamp)

        // Apply pagination
        const startIndex = (pagination.page - 1) * pagination.pageSize
        const endIndex = startIndex + pagination.pageSize

        return filtered.slice(startIndex, endIndex)
      },

      setFilters: newFilters => {
        set(state => ({
          filters: { ...state.filters, ...newFilters },
          pagination: { ...state.pagination, page: 1 }, // Reset to first page
        }))
      },

      resetFilters: () => {
        set({
          filters: DEFAULT_FILTERS,
          pagination: { ...DEFAULT_PAGINATION, total: get().transactions.length },
        })
      },

      setPagination: newPagination => {
        set(state => ({
          pagination: { ...state.pagination, ...newPagination },
        }))
      },

      getTransaction: (id: string) => {
        return get().transactions.find(tx => tx.id === id)
      },

      getTransactionsByCoin: (coinType: 'ETH' | 'BTC' | 'SOL' | 'COSMOS') => {
        return get().transactions.filter(tx => tx.coinType === coinType)
      },

      getRecentTransactions: (count: number) => {
        return get()
          .transactions.sort((a, b) => b.timestamp - a.timestamp)
          .slice(0, count)
      },

      getStats: () => {
        const transactions = get().transactions

        const stats = {
          total: transactions.length,
          approved: 0,
          rejected: 0,
          byCoin: { ETH: 0, BTC: 0, SOL: 0, COSMOS: 0 } as Record<
            'ETH' | 'BTC' | 'SOL' | 'COSMOS',
            number
          >,
          byType: { transaction: 0, message: 0 } as Record<'transaction' | 'message', number>,
        }

        transactions.forEach(tx => {
          if (tx.status === 'approved') stats.approved++
          if (tx.status === 'rejected') stats.rejected++
          stats.byCoin[tx.coinType]++
          stats.byType[tx.type]++
        })

        return stats
      },

      createApprovedTransaction: (
        request: SigningRequest,
        signature: Buffer,
        recovery?: number,
        metadata?: Partial<TransactionRecord['metadata']>,
      ) => {
        const transaction: TransactionRecord = {
          id: generateTransactionId(),
          timestamp: Date.now(),
          coinType: request.data.coinType,
          type: request.data.transactionType,
          status: 'approved',
          signature,
          recovery,
          originalRequest: request,
          metadata: {
            from: request.metadata?.from,
            to: request.metadata?.to,
            value: request.metadata?.value,
            tokenSymbol: request.metadata?.tokenSymbol,
            description: request.metadata?.description,
            ...metadata,
          },
        }

        get().addTransaction(transaction)
        return transaction
      },

      createRejectedTransaction: (
        request: SigningRequest,
        metadata?: Partial<TransactionRecord['metadata']>,
      ) => {
        const transaction: TransactionRecord = {
          id: generateTransactionId(),
          timestamp: Date.now(),
          coinType: request.data.coinType,
          type: request.data.transactionType,
          status: 'rejected',
          originalRequest: request,
          metadata: {
            from: request.metadata?.from,
            to: request.metadata?.to,
            value: request.metadata?.value,
            tokenSymbol: request.metadata?.tokenSymbol,
            description: request.metadata?.description || 'User rejected transaction',
            ...metadata,
          },
        }

        get().addTransaction(transaction)
        return transaction
      },

      setHasHydrated: (hasHydrated: boolean) => {
        set({ _hasHydrated: hasHydrated })
      },

      resetStore: () => {
        set(state => ({
          ...INITIAL_STATE,
          _hasHydrated: state._hasHydrated,
        }))
        console.log('[TransactionStore] Reset to initial state')
      },
    }),
    {
      name: 'lattice-transaction-history',
      version: 1,
      // Only persist on client side
      storage: isClient
        ? undefined
        : {
            getItem: () => null,
            setItem: () => {},
            removeItem: () => {},
          },
      onRehydrateStorage: () => state => {
        console.log('[TransactionStore] Rehydrating from storage...')
        if (state) {
          state.setHasHydrated(true)
          console.log(`[TransactionStore] Rehydrated ${state.transactions.length} transactions`)
        }
      },
      // Serialize/deserialize Buffer objects properly
      serialize: state => {
        const serialized = JSON.stringify(state, (key, value) => {
          if (value && typeof value === 'object' && value.type === 'Buffer') {
            return { type: 'Buffer', data: value.data }
          }
          return value
        })
        return serialized
      },
      deserialize: str => {
        return JSON.parse(str, (key, value) => {
          if (value && typeof value === 'object' && value.type === 'Buffer') {
            return Buffer.from(value.data)
          }
          return value
        })
      },
    },
  ),
)

// Log store creation only on client side
if (isClient) {
  console.log('[TransactionStore] Client-side transaction store initialized')
} else {
  console.log('[TransactionStore] Server-side: do not create transaction store')
}
