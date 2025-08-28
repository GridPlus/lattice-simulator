import { NextRequest, NextResponse } from 'next/server'
import { getDeviceManager, resetDeviceManager } from '@/lib/deviceManager'

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

    console.log(`[API] Resetting device state for: ${deviceId}`)

    // Get the device manager and reset its state
    const deviceManager = getDeviceManager(deviceId)
    deviceManager.reset()

    // Clear the device manager instance to force a fresh start
    resetDeviceManager(deviceId)

    console.log(`[API] Device ${deviceId} state reset successfully`)

    return NextResponse.json({
      success: true,
      message: `Device ${deviceId} state reset successfully`
    })

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