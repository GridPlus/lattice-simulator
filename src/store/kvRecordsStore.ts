import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { immer } from 'zustand/middleware/immer'
import { KvRecordsStore, KvRecordData, validateKvRecord } from '../types/kvRecords'

/**
 * Initial state for KV records store
 */
const INITIAL_STATE = {
  records: {} as Record<string, string>,
  nextId: 1,
  isLoading: false,
  lastSync: undefined as number | undefined,
}

/**
 * Zustand store for managing KV records
 * 
 * Provides state management for key-value records including CRUD operations,
 * validation, and persistence to localStorage. Address tags are a specific
 * use case of KV records where keys are addresses and values are tags.
 * 
 * @example
 * ```typescript
 * const kvRecordsStore = useKvRecordsStore();
 * kvRecordsStore.addKvRecord('0x123...', 'My Wallet', 0); // Address tag
 * kvRecordsStore.addKvRecord('config:theme', 'dark', 1);  // General config
 * const tag = kvRecordsStore.getKvRecord('0x123...');
 * ```
 */
export const useKvRecordsStore = create<KvRecordsStore>()(
  persist(
    immer((set, get) => ({
      ...INITIAL_STATE,

      addKvRecord: (key: string, value: string, type: number = 0) => {
        const validation = validateKvRecord(key, value)
        if (!validation.isValid) {
          throw new Error(validation.error || 'Invalid KV record data')
        }

        set((draft) => {
          const normalizedKey = key.toLowerCase()
          draft.records[normalizedKey] = value
          draft.nextId += 1
          draft.lastSync = Date.now()
        })
      },

      addKvRecords: (records: KvRecordData[], type: number = 0) => {
        // Validate all records first
        for (const record of records) {
          const validation = validateKvRecord(record.key, record.value)
          if (!validation.isValid) {
            throw new Error(`Invalid record for key ${record.key}: ${validation.error}`)
          }
        }

        set((draft) => {
          for (const record of records) {
            const normalizedKey = record.key.toLowerCase()
            draft.records[normalizedKey] = record.value
            draft.nextId += 1
          }
          draft.lastSync = Date.now()
        })
      },

      removeKvRecord: (key: string) => {
        set((draft) => {
          const normalizedKey = key.toLowerCase()
          delete draft.records[normalizedKey]
          draft.lastSync = Date.now()
        })
      },

      removeKvRecords: (keys: string[]) => {
        set((draft) => {
          for (const key of keys) {
            const normalizedKey = key.toLowerCase()
            delete draft.records[normalizedKey]
          }
          draft.lastSync = Date.now()
        })
      },

      updateKvRecord: (key: string, newValue: string) => {
        const validation = validateKvRecord(key, newValue)
        if (!validation.isValid) {
          throw new Error(validation.error || 'Invalid KV record data')
        }

        set((draft) => {
          const normalizedKey = key.toLowerCase()
          if (draft.records[normalizedKey]) {
            draft.records[normalizedKey] = newValue
            draft.lastSync = Date.now()
          } else {
            throw new Error(`KV record not found for key: ${key}`)
          }
        })
      },

      getKvRecord: (key: string) => {
        const state = get()
        const normalizedKey = key.toLowerCase()
        return state.records[normalizedKey]
      },

      getAllKvRecords: () => {
        const state = get()
        return { ...state.records }
      },

      resetKvRecords: () => {
        set((draft) => {
          draft.records = {}
          draft.nextId = 1
          draft.lastSync = undefined
        })
      },

      setLoading: (loading: boolean) => {
        set((draft) => {
          draft.isLoading = loading
        })
      },

      setLastSync: (timestamp: number) => {
        set((draft) => {
          draft.lastSync = timestamp
        })
      },
    })),
    {
      name: 'lattice-kv-records-store',
      partialize: (state) => ({
        records: state.records,
        nextId: state.nextId,
        lastSync: state.lastSync,
      }),
    }
  )
)

