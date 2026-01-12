/**
 * CLIENT-SIDE ONLY Wallet Sync Hook
 *
 * ⚠️ CLIENT-SIDE ONLY: This hook manages syncing wallet accounts to the server.
 * Subscribes to wallet store changes and automatically syncs to server via WebSocket.
 */

import { useEffect } from 'react'
import { useDeviceStore } from '../store/clientDeviceStore'
import { useWalletStore } from '../store/clientWalletStore'
import { sendSyncWalletAccountsCommand } from '../websocket/commands'

/**
 * Hook that automatically syncs wallet accounts to server when they change
 */
export function useWalletSync() {
  const deviceId = useDeviceStore((state: any) => state.deviceInfo.deviceId)
  const isConnected = useDeviceStore((state: any) => state.isConnected)

  useEffect(() => {
    if (!isConnected) {
      return
    }

    const syncToServer = () => {
      const { wallets, activeMnemonic } = useWalletStore.getState()
      const cosmosWallets = wallets.COSMOS || { external: [], internal: [] }
      const allAccounts = [
        ...wallets.ETH.external,
        ...wallets.ETH.internal,
        ...wallets.BTC.external,
        ...wallets.BTC.internal,
        ...wallets.SOL.external,
        ...wallets.SOL.internal,
        ...cosmosWallets.external,
        ...cosmosWallets.internal,
      ]

      if (allAccounts.length > 0 && isConnected) {
        console.log(`[useWalletSync] Syncing ${allAccounts.length} wallet accounts to server`)
        sendSyncWalletAccountsCommand(deviceId, allAccounts, activeMnemonic)
      }
    }

    // Ensure server sees persisted accounts after reconnect
    syncToServer()

    // Subscribe to wallet store changes
    const unsubscribe = useWalletStore.subscribe(
      () => {
        syncToServer()
      },
      // Subscribe to wallets changes specifically
      (state: any) => state.wallets,
    )

    return unsubscribe
  }, [deviceId, isConnected])
}

/**
 * Manual sync function for triggering sync on-demand
 */
export function useSyncWalletsToServer() {
  const deviceId = useDeviceStore((state: any) => state.deviceInfo.deviceId)

  return () => {
    const { wallets, activeMnemonic } = useWalletStore.getState()
    const cosmosWallets = wallets.COSMOS || { external: [], internal: [] }
    const allAccounts = [
      ...wallets.ETH.external,
      ...wallets.ETH.internal,
      ...wallets.BTC.external,
      ...wallets.BTC.internal,
      ...wallets.SOL.external,
      ...wallets.SOL.internal,
      ...cosmosWallets.external,
      ...cosmosWallets.internal,
    ]

    if (allAccounts.length > 0) {
      console.log(`[useSyncWalletsToServer] Manually syncing ${allAccounts.length} wallet accounts`)
      sendSyncWalletAccountsCommand(deviceId, allAccounts, activeMnemonic)
    }
  }
}
