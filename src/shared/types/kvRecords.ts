/**
 * KV Records types and interfaces for Lattice1 Device Simulator
 *
 * KV Records are key-value pairs stored on the device, where:
 * - key: arbitrary string identifier
 * - value: arbitrary string data
 *
 * Address Tags are a specific subtype where:
 * - key: cryptocurrency address
 * - value: human-readable tag/label
 */

export interface KvRecord {
  /** Unique identifier for the record */
  id: number
  /** Record type (0 for address tags, other values for different purposes) */
  type: number
  /** Whether the record is case-sensitive */
  caseSensitive: boolean
  /** The key identifier */
  key: string
  /** The value data */
  val: string
  /** Timestamp when the record was created */
  createdAt?: number
  /** Timestamp when the record was last updated */
  updatedAt?: number
}

/**
 * Address Tag is a specific subtype of KV Record
 * where the key is a cryptocurrency address
 */
export interface AddressTag extends KvRecord {
  /** The cryptocurrency address (key) */
  key: string
  /** The human-readable tag/label (value) */
  val: string
}

/**
 * Generic KV Record data structure
 */
export interface KvRecordData {
  /** The key identifier */
  key: string
  /** The value data */
  value: string
}

export interface KvRecordsState {
  /** Map of key to value */
  records: Record<string, string>
  /** Next available ID for new records */
  nextId: number
  /** Whether records are currently being loaded */
  isLoading: boolean
  /** Last sync timestamp */
  lastSync?: number
}

export interface KvRecordsActions {
  /** Add a new KV record */
  addKvRecord: (key: string, value: string, type?: number) => void
  /** Add multiple KV records */
  addKvRecords: (records: KvRecordData[], type?: number) => void
  /** Remove a KV record by key */
  removeKvRecord: (key: string) => void
  /** Remove multiple KV records by keys */
  removeKvRecords: (keys: string[]) => void
  /** Update an existing KV record */
  updateKvRecord: (key: string, newValue: string) => void
  /** Get value for a specific key */
  getKvRecord: (key: string) => string | undefined
  /** Get all KV records */
  getAllKvRecords: () => Record<string, string>
  /** Reset all KV records */
  resetKvRecords: () => void
  /** Set loading state */
  setLoading: (loading: boolean) => void
  /** Set last sync timestamp */
  setLastSync: (timestamp: number) => void
}

export interface KvRecordsStore extends KvRecordsState, KvRecordsActions {}

/**
 * Constants for KV records
 */
export const KV_RECORDS_CONSTANTS = {
  /** Maximum length for KV record keys */
  MAX_KEY_LENGTH: 64,
  /** Maximum length for KV record values */
  MAX_VALUE_LENGTH: 64,
  /** Default record type for general KV records */
  DEFAULT_RECORD_TYPE: 0,
  /** Record type for address tags */
  ADDRESS_TAGS_RECORD_TYPE: 0,
  /** Maximum number of records that can be fetched per request */
  MAX_RECORDS_PER_REQUEST: 10,
} as const

/**
 * Helper function to validate KV record data
 */
export function validateKvRecord(key: string, value: string): { isValid: boolean; error?: string } {
  if (!key || key.trim().length === 0) {
    return { isValid: false, error: 'Key cannot be empty' }
  }

  if (!value || value.trim().length === 0) {
    return { isValid: false, error: 'Value cannot be empty' }
  }

  if (key.length > KV_RECORDS_CONSTANTS.MAX_KEY_LENGTH) {
    return {
      isValid: false,
      error: `Key too long (max ${KV_RECORDS_CONSTANTS.MAX_KEY_LENGTH} characters)`,
    }
  }

  if (value.length > KV_RECORDS_CONSTANTS.MAX_VALUE_LENGTH) {
    return {
      isValid: false,
      error: `Value too long (max ${KV_RECORDS_CONSTANTS.MAX_VALUE_LENGTH} characters)`,
    }
  }

  return { isValid: true }
}

/**
 * Helper function to convert KV record data to the format expected by the device
 */
export function kvRecordDataToDeviceFormat(
  record: KvRecordData,
  type: number = 0,
): Record<string, string> {
  return {
    [record.key]: record.value,
  }
}

/**
 * Helper function to convert device KV record to our internal format
 */
export function deviceKvRecordToInternal(
  key: string,
  value: string,
  id: number,
  type: number = 0,
): KvRecord {
  return {
    id,
    type,
    caseSensitive: false,
    key,
    val: value,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  }
}

/**
 * Helper function to check if a KV record is an address tag
 */
export function isAddressTag(record: KvRecord): boolean {
  return record.type === KV_RECORDS_CONSTANTS.ADDRESS_TAGS_RECORD_TYPE
}

/**
 * Helper function to convert address tag data to KV record format
 */
export function addressTagToKvRecord(address: string, tag: string): KvRecordData {
  return {
    key: address,
    value: tag,
  }
}
