/**
 * Device-level types for Lattice1 Device Simulator
 */

import type { LatticeResponseCode } from './protocol'
import type { BitcoinScriptTypeName, ParsedBitcoinSignPayload } from '../bitcoin'

export type WalletPath = number[]

export interface Wallet {
  uid: string // Hex string representation
  external: boolean
  name: string // Direct string instead of Buffer
  capabilities: number
}

export interface ActiveWallets {
  internal: Wallet
  external: Wallet
}

export interface DeviceInfo {
  deviceId: string
  name: string
  firmwareVersion: Buffer // Buffer for consistency with other parts of the codebase
  isLocked: boolean
  pairingTimeoutMs?: number
}

export interface PendingRequest {
  id: string
  type: string
  data: any
  timestamp: number
  timeoutMs: number
}

/**
 * Enhanced signing request for user approval flow
 */
export interface SigningRequest extends PendingRequest {
  type: 'SIGN'
  data: {
    /** HD derivation path for the signing key */
    path: number[]
    /** Data to sign (transaction or message) */
    data: Buffer
    /** Signature curve */
    curve?: number
    /** Signature encoding format */
    encoding?: number
    /** Hash type for signing */
    hashType?: number
    /** Schema type (transaction vs message) */
    schema?: number
    /** Cryptocurrency type */
    coinType: 'ETH' | 'BTC' | 'SOL'
    /** Type of data being signed */
    transactionType: 'transaction' | 'message'
    /** Parsed Bitcoin transaction data */
    bitcoin?: ParsedBitcoinSignPayload
  }
  /** Additional transaction metadata for display */
  metadata?: {
    /** From address */
    from?: string
    /** To address */
    to?: string
    /** Transaction value */
    value?: string
    /** Gas limit (ETH) */
    gasLimit?: string
    /** Gas price (ETH) */
    gasPrice?: string
    /** Token symbol */
    tokenSymbol?: string
    /** Contract address for token transfers */
    contractAddress?: string
    /** Human-readable description */
    description?: string
  }
}

/**
 * Other request types for future extensibility
 */
export interface AddressRequest extends PendingRequest {
  type: 'GET_ADDRESSES'
  data: {
    startPath: number[]
    count: number
    flag?: number
  }
}

export interface KvRequest extends PendingRequest {
  type: 'ADD_KV_RECORDS' | 'REMOVE_KV_RECORDS' | 'GET_KV_RECORDS'
  data: any
}

/**
 * Union type for all possible request types
 */
export type AnyPendingRequest = SigningRequest | AddressRequest | KvRequest | PendingRequest

/**
 * Transaction record for completed signing operations
 */
export interface TransactionRecord {
  /** Unique transaction ID */
  id: string
  /** Timestamp when transaction was completed */
  timestamp: number
  /** Cryptocurrency type */
  coinType: 'ETH' | 'BTC' | 'SOL'
  /** Type of transaction */
  type: 'transaction' | 'message'
  /** Final status */
  status: 'approved' | 'rejected'
  /** Resulting signature (if approved) */
  signature?: Buffer
  /** Recovery ID for ECDSA signatures */
  recovery?: number
  /** Original signing request */
  originalRequest: SigningRequest
  /** Processed metadata */
  metadata: {
    /** From address */
    from?: string
    /** To address */
    to?: string
    /** Transaction value */
    value?: string
    /** Transaction hash (if available) */
    hash?: string
    /** Token symbol */
    tokenSymbol?: string
    /** Gas used (ETH) */
    gasUsed?: string
    /** Transaction fee */
    fee?: string
    /** Human-readable description */
    description?: string
    /** Block number (if confirmed) */
    blockNumber?: number
  }
}

export interface DeviceState {
  // Connection & Pairing
  isConnected: boolean
  isPaired: boolean
  ephemeralPub?: Buffer
  sharedSecret?: Buffer

  // Device Info
  deviceInfo: DeviceInfo
  activeWallets: ActiveWallets

  // State Management
  isLocked: boolean
  isBusy: boolean
  isPairingMode: boolean
  pairingCode?: string
  pairingTimeoutMs: number
  pairingStartTime?: number
  pairingTimeoutId?: NodeJS.Timeout // Store timeout ID to clear it later

  // Pending Requests
  pendingRequests: PendingRequest[]
  currentRequest?: PendingRequest

  // User Interaction
  userApprovalRequired: boolean
  userApprovalTimeoutMs: number

  // Storage
  kvRecords: Record<string, string>

  // Configuration
  config: SimulatorConfig
}

export interface SimulatorConfig {
  // Behavior Configuration
  autoApproveRequests: boolean
  simulateUserDelay: boolean
  userDelayMs: number
  enableTimeouts: boolean

  // Feature Flags
  supportedCurves: string[]
  supportedEncodings: string[]
  maxAddressesPerRequest: number

  // Firmware Version Simulation
  simulatedFirmwareVersion: [number, number, number] // [major, minor, patch]
}

export interface DeviceResponse<T = any> {
  success: boolean
  code: LatticeResponseCode
  data?: T
  error?: string
}

// Request/Response Types
export interface ConnectRequest {
  deviceId: string
  publicKey: Buffer
}

export interface ConnectResponse {
  isPaired: boolean
  firmwareVersion: Buffer
  ephemeralPub: Buffer
  activeWallets?: ActiveWallets
  encryptedWalletData?: Buffer
}

export interface PairRequest {
  appName: string
  derSignature?: Buffer // DER-encoded signature for finalizePairing validation
}

export interface GetAddressesRequest {
  startPath: WalletPath
  n: number
  flag?: number
}

export interface GetAddressesResponse {
  addresses: string[]
  publicKeys?: Buffer[]
  chainCode?: Buffer
}

export interface SignRequest {
  data: Buffer
  path: WalletPath
  schema: number
  curve: number
  encoding: number
  hashType: number
  omitPubkey?: boolean
  hasExtraPayloads?: boolean
  nextCode?: Buffer
  rawPayload?: Buffer
  protocol?: 'signPersonal' | 'eip712'
  messageLength?: number
  displayHex?: boolean
  isPrehashed?: boolean
  messagePrehash?: Buffer
  typedDataPayload?: Buffer
  decoderBytes?: Buffer
  bitcoin?: ParsedBitcoinSignPayload
}

export interface SignResponse {
  signature?: Buffer
  recovery?: number
  metadata?: {
    /** Ethereum address that signed (for ETH) */
    signer?: string
    /** Transaction hash (for transactions) */
    txHash?: string
    /** Public key used for signing */
    publicKey?: string
    publicKeyCompressed?: string
  }
  nextCode?: Buffer
  schema?: number
  omitPubkey?: boolean
  curve?: number
  encoding?: number
  hashType?: number
  path?: WalletPath
  messagePrehash?: Buffer
  bitcoin?: {
    changePubkeyHash?: Buffer
    changeAddressType: BitcoinScriptTypeName
    network: 'mainnet' | 'testnet'
    signatures: Array<{
      inputIndex: number
      signature: Buffer
      publicKey: Buffer
      sighashType: number
      signerPath: WalletPath
    }>
  }
}
