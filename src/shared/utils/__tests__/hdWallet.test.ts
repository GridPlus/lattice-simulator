/**
 * HD Wallet Path Generation Tests
 */

import { generateDerivationPath } from '../hdWallet'

describe('hdWallet', () => {
  describe('generateDerivationPath', () => {
    it('should generate correct BIP44 path for Bitcoin', () => {
      const path = generateDerivationPath('BTC', 0, false, 0, 'segwit')
      // Expected: m/84'/0'/0'/0/0 = [2147483732, 2147483648, 2147483648, 0, 0]
      expect(path).toEqual([2147483732, 2147483648, 2147483648, 0, 0])
    })

    it('should handle already-hardened account indices', () => {
      // Test the fix: when 2147483648 (0x80000000) is passed as accountIndex
      // it should be normalized to logical account 0
      const path = generateDerivationPath('BTC', 2147483648, false, 13, 'segwit')
      // Should be m/84'/0'/0'/0/13 = [2147483732, 2147483648, 2147483648, 0, 13]
      expect(path).toEqual([2147483732, 2147483648, 2147483648, 0, 13])
    })

    it('should handle logical account indices correctly', () => {
      const testCases = [
        { account: 0, expected: [2147483732, 2147483648, 2147483648, 0, 0] },
        { account: 1, expected: [2147483732, 2147483648, 2147483649, 0, 0] },
        { account: 2, expected: [2147483732, 2147483648, 2147483650, 0, 0] },
      ]

      testCases.forEach(({ account, expected }) => {
        const path = generateDerivationPath('BTC', account, false, 0, 'segwit')
        expect(path).toEqual(expected)
      })
    })

    it('should handle hardened + logical account indices correctly', () => {
      const testCases = [
        // Hardened indices should be normalized
        { account: 2147483648, expected: [2147483732, 2147483648, 2147483648, 0, 0] }, // 2^31 + 0 = account 0
        { account: 2147483649, expected: [2147483732, 2147483648, 2147483649, 0, 0] }, // 2^31 + 1 = account 1
        { account: 2147483650, expected: [2147483732, 2147483648, 2147483650, 0, 0] }, // 2^31 + 2 = account 2
      ]

      testCases.forEach(({ account, expected }) => {
        const path = generateDerivationPath('BTC', account, false, 0, 'segwit')
        expect(path).toEqual(expected)
      })
    })

    it('should handle internal vs external change correctly', () => {
      const externalPath = generateDerivationPath('BTC', 0, false, 0, 'segwit')
      const internalPath = generateDerivationPath('BTC', 0, true, 0, 'segwit')

      expect(externalPath).toEqual([2147483732, 2147483648, 2147483648, 0, 0])
      expect(internalPath).toEqual([2147483732, 2147483648, 2147483648, 1, 0])
    })

    it('should throw error for invalid account indices', () => {
      const invalidIndices = [
        -1, // Negative
        4294967296, // Larger than 2^32 (exceeds maximum valid)
        5000000000, // Much larger number
      ]

      invalidIndices.forEach(invalidIndex => {
        expect(() => {
          generateDerivationPath('BTC', invalidIndex, false, 0, 'segwit')
        }).toThrow('Invalid account index')
      })
    })

    it('should handle different address types', () => {
      const legacyPath = generateDerivationPath('BTC', 0, false, 0, 'legacy')
      const segwitPath = generateDerivationPath('BTC', 0, false, 0, 'segwit')
      const wrappedSegwitPath = generateDerivationPath('BTC', 0, false, 0, 'wrappedSegwit')

      // Different purposes: legacy=44', segwit=84', wrappedSegwit=49'
      expect(legacyPath[0]).toBe(2147483692) // 44' = 44 + 2^31
      expect(segwitPath[0]).toBe(2147483732) // 84' = 84 + 2^31
      expect(wrappedSegwitPath[0]).toBe(2147483697) // 49' = 49 + 2^31
    })
  })
})
