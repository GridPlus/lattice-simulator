/**
 * Hook to sync client-side state to server-side simulator
 *
 * This hook runs on page load and syncs the client's persisted state
 * (from localStorage) to the server-side simulator's in-memory data.
 */

import { useEffect, useRef } from 'react'
import { useDeviceStore } from '@/client/store/clientDeviceStore'
import { sendSyncClientStateCommand } from '../clientWebSocketCommands'

export function useClientStateSync() {
  const hasSynced = useRef(false)
  const deviceId = useDeviceStore((state: any) => state.deviceInfo.deviceId)
  const hasHydrated = useDeviceStore((state: any) => state._hasHydrated)

  useEffect(() => {
    console.log(
      '[ClientStateSync] Hook called, hasSynced:',
      hasSynced.current,
      'hasHydrated:',
      hasHydrated,
      'window:',
      typeof window !== 'undefined',
    )

    // Only sync once per session, only on client side, and after rehydration
    if (hasSynced.current || typeof window === 'undefined' || !hasHydrated) {
      console.log('[ClientStateSync] Skipping sync - already synced, server-side, or not hydrated')
      return
    }

    const syncClientStateToServer = async () => {
      try {
        console.log('[ClientStateSync] Starting client-to-server state sync...')

        // Wait a bit more to ensure Zustand rehydration has completed
        // The rehydration logs show it completes very quickly, but we need to wait for state updates
        await new Promise(resolve => setTimeout(resolve, 100))

        // Get current client state from Zustand store
        const clientState = useDeviceStore.getState()
        console.log(
          `useClientStateSync.syncClientStateToServer.clientState: ${JSON.stringify(clientState)}`,
        )
        console.log('localStorage content:', localStorage.getItem('lattice-device-store'))

        // Always sync state to ensure server has correct initial state
        // Even if device is not paired, we need to sync the initial state
        const hasKvRecords = Object.keys(clientState.kvRecords).length > 0
        const isPaired = clientState.isPaired

        console.log('[ClientStateSync] Always syncing state to server:', {
          hasKvRecords,
          isPaired,
          reason: 'Ensure server has correct initial state',
        })

        console.log('[ClientStateSync] Syncing state:', {
          deviceId: clientState.deviceInfo.deviceId,
          isPaired,
          kvRecordsCount: Object.keys(clientState.kvRecords).length,
        })

        // Prepare state for server (convert Buffer to array for serialization)
        const stateToSync = {
          deviceInfo: {
            ...clientState.deviceInfo,
            firmwareVersion: clientState.deviceInfo.firmwareVersion
              ? Array.from(clientState.deviceInfo.firmwareVersion)
              : null,
          },
          isConnected: clientState.isConnected,
          isPaired: clientState.isPaired,
          isPairingMode: clientState.isPairingMode,
          pairingCode: clientState.pairingCode,
          pairingStartTime: clientState.pairingStartTime,
          config: clientState.config,
          kvRecords: clientState.kvRecords,
        }

        // Send state to server via WebSocket command
        sendSyncClientStateCommand(clientState.deviceInfo.deviceId, stateToSync)
        console.log('[ClientStateSync] Sync command sent to server via WebSocket')
      } catch (error) {
        console.error('[ClientStateSync] Error during state sync:', error)
      } finally {
        hasSynced.current = true
      }
    }

    // Longer delay to ensure Zustand rehydration has completed and state is properly updated
    const timeoutId = setTimeout(syncClientStateToServer, 2000)

    return () => {
      clearTimeout(timeoutId)
    }
  }, [deviceId, hasHydrated])

  return {
    hasSynced: hasSynced.current,
  }
}
