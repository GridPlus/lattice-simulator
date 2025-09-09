import { NextRequest, NextResponse } from 'next/server'
import { getDeviceManager } from '@/server/serverDeviceManager'

/**
 * API endpoint to sync client-side state to server-side simulator
 * 
 * This endpoint receives the client's persisted state (from localStorage)
 * and updates the server-side simulator's in-memory data structures
 * to match the client state.
 */

interface ClientState {
  deviceInfo: {
    deviceId: string
    name: string
    firmwareVersion: number[] | null
    isLocked: boolean
  }
  isConnected: boolean
  isPaired: boolean
  isPairingMode: boolean
  pairingCode?: string
  pairingStartTime?: number
  config: any
  kvRecords: Record<string, string>
}

export async function POST(request: NextRequest) {
  try {
    console.log('[SyncAPI] ===== CLIENT STATE SYNC REQUEST RECEIVED =====')
    const clientState: ClientState = await request.json()
    
    console.log('[SyncAPI] Received client state:', {
      deviceId: clientState.deviceInfo.deviceId,
      isPaired: clientState.isPaired,
      isConnected: clientState.isConnected,
      kvRecordsCount: Object.keys(clientState.kvRecords).length
    })

    // Get the device manager for this device
    const deviceManager = getDeviceManager(clientState.deviceInfo.deviceId)
    
    // Use the new restoreFromClientState method to properly sync from client (source of truth)
    deviceManager.restoreFromClientState(clientState)
    
    // Also sync configuration separately
    const simulator = deviceManager.getSimulator()
    if (clientState.config) {
      simulator.setAutoApprove(clientState.config.autoApproveRequests || false)
    }

    console.log('[SyncAPI] Client state synced successfully to server')

    return NextResponse.json({ 
      success: true, 
      message: 'Client state synced to server successfully',
      syncedData: {
        deviceId: clientState.deviceInfo.deviceId,
        isPaired: clientState.isPaired,
        kvRecordsCount: Object.keys(clientState.kvRecords).length
      }
    })

  } catch (error) {
    console.error('[SyncAPI] Error syncing client state:', error)
    return NextResponse.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      },
      { status: 500 }
    )
  }
}
