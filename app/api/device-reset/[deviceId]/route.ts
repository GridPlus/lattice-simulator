import { NextRequest, NextResponse } from 'next/server'
import { getDeviceManager, resetDeviceManager } from '@/server/serverDeviceManager'

/**
 * POST handler for resetting device state
 * 
 * Resets the device simulator state on the server side and clears the device manager instance.
 * This ensures that subsequent connections start with a clean state.
 * 
 * @param request - The incoming request
 * @param params - Route parameters containing the deviceId
 * @returns Response indicating success/failure
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { deviceId: string } }
) {
  try {
    const { deviceId } = params
    const body = await request.json().catch(() => ({}))
    const { resetType = 'full' } = body // 'full' or 'connection'

    console.log(`[API] Resetting device state for: ${deviceId}, type: ${resetType}`)

    // Get the device manager
    const deviceManager = getDeviceManager(deviceId)
    const simulator = deviceManager.getSimulator()

    if (resetType === 'connection') {
      // Reset only connection and pairing related state
      console.log(`[API] Resetting connection state only for: ${deviceId}`)
      
      // Reset connection/pairing state in simulator
      simulator.unpair()
      
      // Clear ephemeral keys and connection state
      // Note: We don't reset KV records or other persistent data
      
      console.log(`[API] Connection state reset successfully for: ${deviceId}`)
      
      return NextResponse.json({
        success: true,
        message: `Device ${deviceId} connection state reset successfully`,
        resetType: 'connection'
      })
    } else {
      // Full reset (default behavior)
      console.log(`[API] Performing full device reset for: ${deviceId}`)
      
      // Get the device manager and reset its state
      deviceManager.reset()

      // Clear the device manager instance to force a fresh start
      resetDeviceManager(deviceId)

      console.log(`[API] Full device reset completed for: ${deviceId}`)

      return NextResponse.json({
        success: true,
        message: `Device ${deviceId} state reset successfully`,
        resetType: 'full'
      })
    }

  } catch (error) {
    console.error('Error resetting device state:', error)
    
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to reset device state',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}
