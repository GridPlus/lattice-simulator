import { cleanup } from '@testing-library/react'
import '@testing-library/jest-dom'
import { resolveTinySecp } from '../shared/utils/ecc'

// Initialize Bitcoin crypto libraries for tests running in Node.js environment
beforeAll(async () => {
  // Only initialize Bitcoin libraries if we're in a Node.js environment
  if (typeof window === 'undefined') {
    try {
      const [bitcoin, ECPair, tinySecp] = await Promise.all([
        import('bitcoinjs-lib'),
        import('ecpair'),
        import('tiny-secp256k1'),
      ])

      const ecc = resolveTinySecp(tinySecp as any)

      // Initialize bitcoinjs-lib with secp256k1 implementation
      bitcoin.initEccLib(ecc as any)

      // Initialize ECPair factory
      ECPair.default(ecc as any)
    } catch (error) {
      console.error('Failed to initialize Bitcoin crypto libraries in test setup:', error)
    }
  }
})

// Cleanup after each test case (e.g. clearing jsdom)
afterEach(() => {
  cleanup()
})
