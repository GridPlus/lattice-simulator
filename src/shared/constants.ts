/**
 * Constants for Lattice1 Device Simulator
 * Based on GridPlus SDK constants
 */

import {
  LatticeGetAddressesFlag,
  LatticeSignHash,
  LatticeSignCurve,
  LatticeSignEncoding,
  LatticeSignBlsDst,
  LatticeEncDataSchema,
} from '@/shared/types'

export const HARDENED_OFFSET = 0x80000000

// External API constants matching GridPlus SDK
export const EXTERNAL = {
  GET_ADDR_FLAGS: {
    SECP256K1_PUB: LatticeGetAddressesFlag.secp256k1Pubkey,
    ED25519_PUB: LatticeGetAddressesFlag.ed25519Pubkey,
    BLS12_381_G1_PUB: LatticeGetAddressesFlag.bls12_381Pubkey,
    SECP256K1_XPUB: LatticeGetAddressesFlag.secp256k1Xpub,
  },
  SIGNING: {
    HASHES: {
      NONE: LatticeSignHash.none,
      KECCAK256: LatticeSignHash.keccak256,
      SHA256: LatticeSignHash.sha256,
    },
    CURVES: {
      SECP256K1: LatticeSignCurve.secp256k1,
      ED25519: LatticeSignCurve.ed25519,
      BLS12_381_G2: LatticeSignCurve.bls12_381,
    },
    ENCODINGS: {
      NONE: LatticeSignEncoding.none,
      SOLANA: LatticeSignEncoding.solana,
      EVM: LatticeSignEncoding.evm,
      ETH_DEPOSIT: LatticeSignEncoding.eth_deposit,
      EIP7702_AUTH: LatticeSignEncoding.eip7702_auth,
      EIP7702_AUTH_LIST: LatticeSignEncoding.eip7702_auth_list,
    },
    BLS_DST: {
      BLS_DST_NUL: LatticeSignBlsDst.NUL,
      BLS_DST_POP: LatticeSignBlsDst.POP,
    },
  },
  ENC_DATA: {
    SCHEMAS: {
      BLS_KEYSTORE_EIP2335_PBKDF_V4: LatticeEncDataSchema.eip2335,
    },
  },
} as const

// BIP constants
export const BIP_CONSTANTS = {
  PURPOSES: {
    ETH: HARDENED_OFFSET + 44,
    BTC_LEGACY: HARDENED_OFFSET + 44,
    BTC_WRAPPED_SEGWIT: HARDENED_OFFSET + 49,
    BTC_SEGWIT: HARDENED_OFFSET + 84,
  },
  COINS: {
    ETH: HARDENED_OFFSET + 60,
    BTC: HARDENED_OFFSET,
    BTC_TESTNET: HARDENED_OFFSET + 1,
    SOLANA: HARDENED_OFFSET + 501,
  },
} as const

// Standard derivation paths
export const DERIVATION_PATHS = {
  ETH_DEFAULT: [
    HARDENED_OFFSET + 44,
    HARDENED_OFFSET + 60,
    HARDENED_OFFSET,
    0,
    0,
  ],
  BTC_LEGACY: [
    HARDENED_OFFSET + 44,
    HARDENED_OFFSET + 0,
    HARDENED_OFFSET,
    0,
    0,
  ],
  BTC_SEGWIT: [
    HARDENED_OFFSET + 84,
    HARDENED_OFFSET + 0,
    HARDENED_OFFSET,
    0,
    0,
  ],
  BTC_WRAPPED_SEGWIT: [
    HARDENED_OFFSET + 49,
    HARDENED_OFFSET + 0,
    HARDENED_OFFSET,
    0,
    0,
  ],
  SOLANA: [
    HARDENED_OFFSET + 44,
    HARDENED_OFFSET + 501,
    HARDENED_OFFSET,
    HARDENED_OFFSET,
  ],
  LEDGER_LIVE: [
    HARDENED_OFFSET + 44,
    HARDENED_OFFSET + 60,
    HARDENED_OFFSET,
    0,
    0,
  ],
  LEDGER_LEGACY: [
    HARDENED_OFFSET + 44,
    HARDENED_OFFSET + 60,
    HARDENED_OFFSET,
    0,
  ],
} as const

// Address sizes
export const ADDRESS_SIZES = {
  BTC: 20, // 20 byte pubkeyhash
  ETH: 20, // 20 byte address not including 0x prefix
} as const

// Currencies
export const CURRENCIES = {
  ETH: 'ETH',
  BTC: 'BTC',
  ETH_MSG: 'ETH_MSG',
  SOLANA: 'SOL',
} as const

// Signing schemas
export const SIGNING_SCHEMA = {
  BTC_TRANSFER: 0,
  ETH_TRANSFER: 1,
  ERC20_TRANSFER: 2,
  ETH_MSG: 3,
  EXTRA_DATA: 4,
  GENERAL_SIGNING: 5,
} as const

// Protocol constants
export const PROTOCOL_CONSTANTS = {
  REQUEST_TYPE_BYTE: 0x02,
  VERSION_BYTE: 1,
  HANDLE_LARGER_CHAIN_ID: 255,
  MAX_CHAIN_ID_BYTES: 8,
  MAX_ADDR: 10,
} as const

// Simulator-specific constants
export const SIMULATOR_CONSTANTS = {
  DEFAULT_PAIRING_TIMEOUT_MS: 60000, // 60 seconds
  DEFAULT_USER_APPROVAL_TIMEOUT_MS: 300000, // 5 minutes
  DEFAULT_REQUEST_TIMEOUT_MS: 30000, // 30 seconds
  
  // Default seeds for testing (NEVER use in production)
  DEFAULT_MNEMONIC: 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about',
  
  // Supported firmware versions
  FIRMWARE_VERSIONS: {
    V0_15_0: [0, 15, 0],
    V0_16_0: [0, 16, 0],
    V0_17_0: [0, 17, 0],
    V0_18_0: [0, 18, 0],
  },
  
  // Feature support by firmware version
  FEATURES_BY_VERSION: {
    'addr_flags': [0, 10, 0],
    'var_addr_path': [0, 10, 5],
    'eip712': [0, 10, 5],
    'prehash': [0, 10, 8],
    'eth_msg_prehash': [0, 10, 10],
    'new_eth_tx_types': [0, 11, 0],
    'kv_actions': [0, 12, 0],
    'btc_segwit': [0, 13, 0],
    'generic_signing': [0, 14, 0],
    'evm_decoder': [0, 15, 0],
    'bls12_381': [0, 17, 0],
    'eip7702': [0, 18, 0],
  },
} as const

// Network constants for different blockchains
export const NETWORKS = {
  ETHEREUM: {
    MAINNET: { chainId: 1, name: 'Ethereum Mainnet' },
    GOERLI: { chainId: 5, name: 'Goerli Testnet' },
    SEPOLIA: { chainId: 11155111, name: 'Sepolia Testnet' },
  },
  BITCOIN: {
    MAINNET: { network: 'bitcoin', name: 'Bitcoin Mainnet' },
    TESTNET: { network: 'testnet', name: 'Bitcoin Testnet' },
  },
  SOLANA: {
    MAINNET: { cluster: 'mainnet-beta', name: 'Solana Mainnet' },
    DEVNET: { cluster: 'devnet', name: 'Solana Devnet' },
    TESTNET: { cluster: 'testnet', name: 'Solana Testnet' },
  },
} as const
