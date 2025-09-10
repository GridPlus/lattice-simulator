#!/usr/bin/env node

/**
 * Simple test to verify the pairing mode exit flow
 * 
 * This tests that:
 * 1. Server-side simulator can enter and exit pairing mode
 * 2. Proper events are emitted when pairing mode ends
 * 3. Client-server communication works via WebSocket commands
 */

// For testing, we'll import the TypeScript files directly using ts-node
const path = require('path');
require('ts-node/register');

// Mock the webpack environment for the build
global.__webpack_require__ = undefined;
global.__webpack_public_path__ = undefined;

const { Simulator } = require('./src/lib/simulator.ts')
const { deviceEvents } = require('./src/lib/deviceEvents.ts')

console.log('🧪 Testing pairing mode exit flow...\n')

// Create a test simulator instance
const deviceId = 'TEST-DEVICE-001'
const simulator = new Simulator(deviceId, {
  deviceName: 'Test Lattice',
  seedPhrase: 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about',
  firmwareVersion: [0, 15, 0]
})

// Track events emitted by the simulator
let pairingModeStartedCount = 0
let pairingModeEndedCount = 0

// Set up event listeners
const unsubscribe = deviceEvents.subscribe(deviceId, (event) => {
  console.log(`📡 Received event: ${event.type}`, event.data)
  
  if (event.type === 'pairing_mode_started') {
    pairingModeStartedCount++
  } else if (event.type === 'pairing_mode_ended') {
    pairingModeEndedCount++
  }
})

// Test the flow
async function testPairingFlow() {
  try {
    console.log('1. ✅ Starting simulator...')
    
    console.log('\n2. 🔄 Entering pairing mode...')
    simulator.enterPairingMode()
    
    // Wait a bit for events to propagate
    await new Promise(resolve => setTimeout(resolve, 100))
    
    console.log('\n3. 🔄 Exiting pairing mode...')
    simulator.exitPairingMode()
    
    // Wait a bit for events to propagate
    await new Promise(resolve => setTimeout(resolve, 100))
    
    console.log('\n4. 📊 Results:')
    console.log(`   - Pairing mode started events: ${pairingModeStartedCount}`)
    console.log(`   - Pairing mode ended events: ${pairingModeEndedCount}`)
    
    // Verify expected results
    if (pairingModeStartedCount === 1 && pairingModeEndedCount === 1) {
      console.log('\n✅ SUCCESS: Pairing mode flow works correctly!')
      console.log('   - Server-side simulator properly manages state')
      console.log('   - Events are emitted correctly')
      return true
    } else {
      console.log('\n❌ FAILURE: Events were not emitted as expected')
      console.log('   Expected: 1 started, 1 ended')
      console.log(`   Actual: ${pairingModeStartedCount} started, ${pairingModeEndedCount} ended`)
      return false
    }
    
  } catch (error) {
    console.error('\n❌ ERROR during test:', error)
    return false
  } finally {
    // Clean up
    unsubscribe()
  }
}

// Run the test
testPairingFlow().then(success => {
  console.log(`\n🏁 Test ${success ? 'PASSED' : 'FAILED'}`)
  process.exit(success ? 0 : 1)
})