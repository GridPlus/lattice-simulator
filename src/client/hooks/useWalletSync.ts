/**
 * CLIENT-SIDE ONLY Wallet Sync Hook
 *
 * ⚠️ CLIENT-SIDE ONLY: This hook manages syncing wallet accounts to the server.
 * Subscribes to wallet store changes and automatically syncs to server via WebSocket.
 */

import { useEffect } from 'react'
import { useDeviceStore } from '../store/clientDeviceStore'
import { useWalletStore } from '../store/clientWalletStore'
import { sendSetActiveSafeCardCommand, sendSyncWalletAccountsCommand } from '../websocket/commands'

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
      const { walletsBySafeCard, safeCards, activeSafeCardId } = useWalletStore.getState()
      const activeWallets = activeSafeCardId ? walletsBySafeCard?.[activeSafeCardId] : null
      const allAccounts = activeWallets
        ? [
            ...activeWallets.ETH.external,
            ...activeWallets.ETH.internal,
            ...activeWallets.BTC.external,
            ...activeWallets.BTC.internal,
            ...activeWallets.SOL.external,
            ...activeWallets.SOL.internal,
            ...activeWallets.COSMOS.external,
            ...activeWallets.COSMOS.internal,
          ]
        : []

      const activeSafeCard = safeCards.find(card => card.id === activeSafeCardId)

      if (allAccounts.length > 0 && isConnected) {
        console.log(`[useWalletSync] Syncing ${allAccounts.length} wallet accounts to server`)
        sendSyncWalletAccountsCommand(deviceId, allAccounts, activeSafeCard?.mnemonic)
      }

      if (activeSafeCard && isConnected) {
        sendSetActiveSafeCardCommand(deviceId, {
          safeCardId: activeSafeCard.id,
          uid: activeSafeCard.uid,
          name: activeSafeCard.name,
          mnemonic: activeSafeCard.mnemonic,
        })
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
      (state: any) => ({
        walletsBySafeCard: state.walletsBySafeCard,
        activeSafeCardId: state.activeSafeCardId,
      }),
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
    const { walletsBySafeCard, safeCards, activeSafeCardId } = useWalletStore.getState()
    const activeWallets = activeSafeCardId ? walletsBySafeCard?.[activeSafeCardId] : null
    const allAccounts = activeWallets
      ? [
          ...activeWallets.ETH.external,
          ...activeWallets.ETH.internal,
          ...activeWallets.BTC.external,
          ...activeWallets.BTC.internal,
          ...activeWallets.SOL.external,
          ...activeWallets.SOL.internal,
          ...activeWallets.COSMOS.external,
          ...activeWallets.COSMOS.internal,
        ]
      : []

    const activeSafeCard = safeCards.find(card => card.id === activeSafeCardId)

    if (allAccounts.length > 0) {
      console.log(`[useSyncWalletsToServer] Manually syncing ${allAccounts.length} wallet accounts`)
      sendSyncWalletAccountsCommand(deviceId, allAccounts, activeSafeCard?.mnemonic)
    }

    if (activeSafeCard) {
      sendSetActiveSafeCardCommand(deviceId, {
        safeCardId: activeSafeCard.id,
        uid: activeSafeCard.uid,
        name: activeSafeCard.name,
        mnemonic: activeSafeCard.mnemonic,
      })
    }
  }
}
