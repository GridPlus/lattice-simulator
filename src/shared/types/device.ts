/**
 * Device-level types for Lattice1 Device Simulator
 */

import type { LatticeResponseCode } from './protocol'

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

export interface DeviceState {
  // Connection & Pairing
  isConnected: boolean
  isPaired: boolean
  pairingSecret?: string
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
}

export interface PairRequest {
  pairingSecret?: string
  appName: string
  publicKey: Buffer
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
}

export interface SignResponse {
  signature: Buffer
  recovery?: number
}
