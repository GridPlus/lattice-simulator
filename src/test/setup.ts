import { cleanup } from '@testing-library/react'
import { afterEach, beforeAll } from 'vitest'
import '@testing-library/jest-dom'

// Initialize Bitcoin crypto libraries for tests running in Node.js environment
beforeAll(async () => {
  // Only initialize Bitcoin libraries if we're in a Node.js environment
  if (typeof window === 'undefined') {
    try {
      const [bitcoin, ECPair, ecc] = await Promise.all([
        import('bitcoinjs-lib'),
        import('ecpair'),
        import('tiny-secp256k1'),
      ])

      // Initialize bitcoinjs-lib with secp256k1 implementation
      bitcoin.initEccLib(ecc)

      // Initialize ECPair factory
      ECPair.default(ecc)
    } catch (error) {
      console.error('Failed to initialize Bitcoin crypto libraries in test setup:', error)
    }
  }
})

// Cleanup after each test case (e.g. clearing jsdom)
afterEach(() => {
  cleanup()
})
