/**
 * API route for managing multiple devices
 */

import { NextRequest, NextResponse } from 'next/server'

export async function GET() {
  // Return list of active devices (mock data for now)
  const devices = [
    {
      deviceId: 'lattice-simulator-001',
      name: 'Lattice1 Simulator',
      status: 'online',
      isPaired: false,
      isLocked: false,
    },
    {
      deviceId: 'lattice-simulator-002', 
      name: 'Lattice1 Test Device',
      status: 'online',
      isPaired: true,
      isLocked: false,
    },
  ]
  
  return NextResponse.json({ devices })
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { name, autoApprove = false } = body
    
    // Create new device simulator
    const deviceId = `lattice-simulator-${Date.now()}`
    
    const device = {
      deviceId,
      name: name || 'New Lattice Simulator',
      status: 'online',
      isPaired: false,
      isLocked: false,
      autoApprove,
      createdAt: new Date().toISOString(),
    }
    
    return NextResponse.json({ device }, { status: 201 })
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to create device' },
      { status: 500 }
    )
  }
}
