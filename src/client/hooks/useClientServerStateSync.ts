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
  const deviceId = useDeviceStore(state => state.deviceInfo.deviceId)

  useEffect(() => {
    console.log('[ClientStateSync] Hook called, hasSynced:', hasSynced.current, 'window:', typeof window !== 'undefined')
    
    // Only sync once per session and only on client side
    if (hasSynced.current || typeof window === 'undefined') {
      console.log('[ClientStateSync] Skipping sync - already synced or server-side')
      return
    }

    const syncClientStateToServer = async () => {
      try {
        console.log('[ClientStateSync] Starting client-to-server state sync...')
        
        // Get current client state from Zustand store
        const clientState = useDeviceStore.getState()
        console.log(`hereis clientState: ${JSON.stringify(clientState)}`)
        
        // Always sync state to ensure server has correct initial state
        // Even if device is not paired, we need to sync the initial state
        const hasKvRecords = Object.keys(clientState.kvRecords).length > 0
        const isPaired = clientState.isPaired
        
        console.log('[ClientStateSync] Always syncing state to server:', {
          hasKvRecords,
          isPaired,
          reason: 'Ensure server has correct initial state'
        })

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

        // Send state to server via WebSocket command
        sendSyncClientStateCommand(clientState.deviceInfo.deviceId, stateToSync)
        console.log('[ClientStateSync] Sync command sent to server via WebSocket')

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
