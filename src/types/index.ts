/**
 * Central exports for all type definitions
 */

export * from './protocol'
export * from './device'
export * from './crypto'

// Re-export commonly used types
export type {
  DeviceState,
  SimulatorConfig,
  DeviceResponse,
  ActiveWallets,
  WalletPath,
  AddressInfo,
  DerivationPath,
} from './device'

export {
  LatticeResponseCode,
  LatticeSecureEncryptedRequestType,
} from './protocol'

export type {
  KeyPair,
} from './protocol'

export type {
  HDNode,
  CoinType,
  Purpose,
  CryptoOperations,
} from './crypto'
