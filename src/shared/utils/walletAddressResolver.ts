/**
 * Wallet Address Resolution Utilities
 * Provides real HD wallet address resolution for protocol handlers
 */

import { useWalletStore } from '@/client/store/clientWalletStore'
import type { WalletPath, AddressInfo } from '../types'
import { detectCoinTypeFromPath } from './protocol'
import { WalletCoinType } from '../types/wallet'

/**
 * Resolves real addresses from the wallet store based on derivation paths
 * 
 * Replaces the mock address generation with real HD wallet addresses
 * from the initialized wallet store. Matches requested derivation paths
 * to stored wallet accounts.
 * 
 * @param startPath - Starting BIP-44 derivation path
 * @param count - Number of addresses to return
 * @returns Array of real address information from wallet store
 */
export function resolveWalletAddresses(
  startPath: WalletPath,
  count: number
): AddressInfo[] {
  console.log('[WalletAddressResolver] Resolving addresses for path:', startPath, 'count:', count)

  // Get wallet store state
  const walletStore = useWalletStore.getState()
  
  if (!walletStore.isInitialized) {
    console.warn('[WalletAddressResolver] Wallet store not initialized, falling back to empty array')
    return []
  }

  // Detect coin type from the derivation path
  const coinType = detectCoinTypeFromPath(startPath)
  if (coinType === 'UNKNOWN') {
    console.warn('[WalletAddressResolver] Unknown coin type for path:', startPath)
    return []
  }
  
  // Get wallet accounts for the coin type
  const coinWallets = walletStore.wallets[coinType]
  if (!coinWallets) {
    console.warn('[WalletAddressResolver] No wallets found for coin type:', coinType)
    return []
  }

  // Parse the path to determine account type and indices
  // BIP-44 path format: m/44'/coin_type'/account'/change/address_index
  const pathAnalysis = analyzeDerivationPath(startPath)
  
  if (!pathAnalysis) {
    console.warn('[WalletAddressResolver] Could not analyze derivation path:', startPath)
    return []
  }

  const { accountType, startAddressIndex } = pathAnalysis
  console.log('[WalletAddressResolver] Path analysis:', { accountType, startAddressIndex })

  // Get the appropriate accounts (external or internal)
  const accounts = coinWallets[accountType] || []
  console.log('[WalletAddressResolver] Found', accounts.length, accountType, 'accounts for', coinType)

  // Extract addresses starting from the requested index
  const addresses: AddressInfo[] = []
  
  for (let i = 0; i < count && (startAddressIndex + i) < accounts.length; i++) {
    const account = accounts[startAddressIndex + i]
    const addressIndex = startAddressIndex + i
    
    // Generate the correct derivation path by incrementing the address index
    const derivationPath = [...startPath.slice(0, 4), addressIndex]
    
    addresses.push({
      path: derivationPath,
      address: account.address,
      publicKey: Buffer.from(account.publicKey, 'hex'),
      index: addressIndex,
    })
    
    console.log(`[WalletAddressResolver] Added address ${i + 1}/${count}:`, {
      path: derivationPath.join('/'),
      address: account.address,
      addressIndex,
    })
  }

  // If we don't have enough addresses, log a warning
  if (addresses.length < count) {
    console.warn(`[WalletAddressResolver] Only found ${addresses.length} addresses, requested ${count}. You may need to create more accounts.`)
  }

  console.log('[WalletAddressResolver] Returning', addresses.length, 'addresses')
  return addresses
}

/**
 * Analyzes a BIP-44 derivation path to extract account type and address index
 * 
 * @param path - BIP-44 derivation path array
 * @returns Path analysis or null if invalid
 */
function analyzeDerivationPath(path: WalletPath): { 
  accountType: 'external' | 'internal'
  startAddressIndex: number 
} | null {
  // BIP-44 path format: m/44'/coin_type'/account'/change/address_index
  // We expect at least 5 elements: [44, coin_type, account, change, address_index]
  if (path.length < 5) {
    return null
  }

  const change = path[3]
  const addressIndex = path[4]

  // BIP-44 standard: change=0 for external addresses, change=1 for internal addresses
  const accountType = change === 0 ? 'external' : 'internal'
  
  return {
    accountType,
    startAddressIndex: addressIndex
  }
}

/**
 * Gets the current active wallet address for a specific coin type
 * 
 * @param coinType - The cryptocurrency type
 * @returns Active wallet address info or null if none set
 */
export function getActiveWalletAddress(coinType: WalletCoinType): AddressInfo | null {
  const walletStore = useWalletStore.getState()
  
  if (!walletStore.isInitialized) {
    return null
  }

  const activeWallet = walletStore.activeWallets[coinType]
  if (!activeWallet) {
    return null
  }

  return {
    path: activeWallet.derivationPath,
    address: activeWallet.address,
    publicKey: Buffer.from(activeWallet.publicKey, 'hex'),
    index: activeWallet.accountIndex,
  }
}

/**
 * Ensures the wallet store is initialized before resolving addresses
 * 
 * @returns Promise that resolves when wallet store is ready
 */
export async function ensureWalletStoreInitialized(): Promise<boolean> {
  const walletStore = useWalletStore.getState()
  
  if (walletStore.isInitialized) {
    return true
  }

  if (walletStore.isLoading) {
    // Wait for initialization to complete
    return new Promise((resolve) => {
      const unsubscribe = useWalletStore.subscribe(
        (state) => state.isInitialized,
        (isInitialized) => {
          if (isInitialized) {
            unsubscribe()
            resolve(true)
          }
        }
      )
      
      // Timeout after 30 seconds
      setTimeout(() => {
        unsubscribe()
        resolve(false)
      }, 30000)
    })
  }

  // Try to initialize
  try {
    await walletStore.initializeWallets()
    return walletStore.isInitialized
  } catch (error) {
    console.error('[WalletAddressResolver] Failed to initialize wallet store:', error)
    return false
  }
}