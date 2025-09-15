/**
 * Bitcoin Wallet Service Tests
 */

import { describe, it, expect, beforeAll } from 'vitest'
import { createMultipleBitcoinAccounts } from '../bitcoinWallet'

describe('bitcoinWallet', () => {
  beforeAll(async () => {
    // Ensure crypto libraries are initialized
    await new Promise(resolve => setTimeout(resolve, 100))
  })

  describe('createMultipleBitcoinAccounts', () => {
    it('should handle valid account indices', async () => {
      const accounts = await createMultipleBitcoinAccounts(0, 'external', 'segwit', 2, 0)

      expect(accounts).toHaveLength(2)
      expect(accounts[0]).toHaveProperty('address')
      expect(accounts[0]).toHaveProperty('publicKey')
      expect(accounts[0]).toHaveProperty('privateKey')
      expect(accounts[0].derivationPath).toEqual([2147483732, 2147483648, 2147483648, 0, 0]) // m/84'/0'/0'/0/0 for segwit
    })

    it('should handle hardened account indices passed as input', async () => {
      // This test covers the error case: account: 2147483648, type: external, startIndex: 13
      // 2147483648 (2^31) is the hardened bit set, which should be normalized to account 0

      const accounts = await createMultipleBitcoinAccounts(2147483648, 'external', 'segwit', 2, 13)

      expect(accounts).toHaveLength(2)
      // Should normalize 2147483648 to account 0, so path should be [2147483732, 2147483648, 2147483648, 0, 13] and [2147483732, 2147483648, 2147483648, 0, 14]
      expect(accounts[0].derivationPath).toEqual([2147483732, 2147483648, 2147483648, 0, 13])
      expect(accounts[1].derivationPath).toEqual([2147483732, 2147483648, 2147483648, 0, 14])
    })

    it('should throw error for invalid account indices', async () => {
      // Test that account indices outside valid range throw errors
      const invalidIndices = [
        -1, // Negative
        4294967295, // Too large (2^32 - 1)
        4294967296, // Larger than 2^32
      ]

      for (const invalidIndex of invalidIndices) {
        await expect(async () => {
          await createMultipleBitcoinAccounts(invalidIndex, 'external', 'segwit', 1, 0)
        }).rejects.toThrow('Invalid account index')
      }
    })

    it('should handle hardened account indices correctly', async () => {
      // Test that account 0 works (should be hardened as 0x80000000 = 2147483648)
      const accounts = await createMultipleBitcoinAccounts(0, 'external', 'segwit', 1, 0)
      expect(accounts).toHaveLength(1)
      // The path should be [44, 0, 0, 0, 0] in the result,
      // but internally uses hardened derivation
    })

    it('should handle various account indices without overflow', async () => {
      // Test account indices that might cause issues
      const testCases = [
        { account: 0, expected: [2147483732, 2147483648, 2147483648, 0, 0] }, // m/84'/0'/0'/0/0
        { account: 1, expected: [2147483732, 2147483648, 2147483649, 0, 0] }, // m/84'/0'/1'/0/0
        { account: 2, expected: [2147483732, 2147483648, 2147483650, 0, 0] }, // m/84'/0'/2'/0/0
      ]

      for (const { account, expected } of testCases) {
        const accounts = await createMultipleBitcoinAccounts(account, 'external', 'segwit', 1, 0)
        expect(accounts[0].derivationPath).toEqual(expected)
      }
    })

    it('should handle internal vs external change correctly', async () => {
      const externalAccount = await createMultipleBitcoinAccounts(0, 'external', 'segwit', 1, 0)
      const internalAccount = await createMultipleBitcoinAccounts(0, 'internal', 'segwit', 1, 0)

      expect(externalAccount[0].derivationPath).toEqual([2147483732, 2147483648, 2147483648, 0, 0]) // m/84'/0'/0'/0/0
      expect(internalAccount[0].derivationPath).toEqual([2147483732, 2147483648, 2147483648, 1, 0]) // m/84'/0'/0'/1/0
    })
  })
})
