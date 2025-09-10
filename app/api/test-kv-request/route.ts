import { NextResponse } from 'next/server'
import { requestKvRecords } from '@/server/serverRequestManager'
import type { NextRequest } from 'next/server'

/**
 * Test endpoint to trigger a KV records request
 * This helps test the server-client communication flow
 */
export async function POST(request: NextRequest) {
  try {
    const { deviceId, type = 0, n = 5, start = 0 } = await request.json()

    if (!deviceId) {
      return NextResponse.json({ error: 'deviceId is required' }, { status: 400 })
    }

    console.log(`[Test] Triggering KV records request for device: ${deviceId}`)

    try {
      const result = await requestKvRecords(deviceId, { type, n, start })

      console.log('[Test] KV records request completed:', result)

      return NextResponse.json({
        success: true,
        data: result,
        message: 'KV records request completed successfully',
      })
    } catch (error) {
      console.error('[Test] KV records request failed:', error)

      return NextResponse.json(
        {
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
          message: 'KV records request failed',
        },
        { status: 500 },
      )
    }
  } catch (error) {
    console.error('[Test] Error processing test request:', error)

    return NextResponse.json({ error: 'Failed to process test request' }, { status: 500 })
  }
}
