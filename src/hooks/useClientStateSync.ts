/**
 * Hook to sync client-side state to server-side simulator
 * 
 * This hook runs on page load and syncs the client's persisted state
 * (from localStorage) to the server-side simulator's in-memory data.
 */

import { useEffect, useRef } from 'react'
import { useDeviceStore } from '@/store/deviceStore'

export function useClientStateSync() {
  const hasSynced = useRef(false)
  const deviceId = useDeviceStore(state => state.deviceInfo.deviceId)

  useEffect(() => {
    // Only sync once per session and only on client side
    if (hasSynced.current || typeof window === 'undefined') {
      return
    }

    const syncClientStateToServer = async () => {
      try {
        console.log('[ClientStateSync] Starting client-to-server state sync...')
        
        // Get current client state from Zustand store
        const clientState = useDeviceStore.getState()
        
        // Check if we have meaningful state to sync
        const hasKvRecords = Object.keys(clientState.kvRecords).length > 0
        const isPaired = clientState.isPaired
        
        if (!hasKvRecords && !isPaired) {
          console.log('[ClientStateSync] No meaningful state to sync, skipping')
          return
        }

        console.log('[ClientStateSync] Syncing state:', {
          deviceId: clientState.deviceInfo.deviceId,
          isPaired,
          kvRecordsCount: Object.keys(clientState.kvRecords).length
        })

        // Prepare state for server (convert Buffer to array for serialization)
        const stateToSync = {
          deviceInfo: {
            ...clientState.deviceInfo,
            firmwareVersion: clientState.deviceInfo.firmwareVersion 
              ? Array.from(clientState.deviceInfo.firmwareVersion) 
              : null
          },
          isConnected: clientState.isConnected,
          isPaired: clientState.isPaired,
          isPairingMode: clientState.isPairingMode,
          pairingCode: clientState.pairingCode,
          pairingStartTime: clientState.pairingStartTime,
          config: clientState.config,
          kvRecords: clientState.kvRecords
        }

        // Send state to server
        const response = await fetch('/api/sync-client-state', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(stateToSync)
        })

        if (response.ok) {
          const result = await response.json()
          console.log('[ClientStateSync] Successfully synced state to server:', result.syncedData)
        } else {
          const error = await response.json()
          console.error('[ClientStateSync] Failed to sync state to server:', error)
        }

      } catch (error) {
        console.error('[ClientStateSync] Error during state sync:', error)
      } finally {
        hasSynced.current = true
      }
    }

    // Small delay to ensure the page is fully loaded
    const timeoutId = setTimeout(syncClientStateToServer, 1000)

    return () => {
      clearTimeout(timeoutId)
    }
  }, [deviceId])

  return {
    hasSynced: hasSynced.current
  }
}
