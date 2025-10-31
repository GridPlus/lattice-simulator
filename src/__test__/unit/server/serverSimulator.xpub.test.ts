import { describe, expect, it } from 'vitest'
import { ServerLatticeSimulator } from '../../../server/serverSimulator'
import { HARDENED_OFFSET } from '../../../shared/constants'

const simulator = new ServerLatticeSimulator({ autoApprove: true })

async function deriveExtendedKey(path: number[]): Promise<string> {
  const response = await (simulator as any).deriveXpubs(path, 1)
  expect(response.addresses).toHaveLength(1)
  return response.addresses[0]
}

describe('ServerLatticeSimulator Bitcoin extended keys', () => {
  it('derives an xpub for BIP44 legacy path', async () => {
    const legacyPath = [HARDENED_OFFSET + 44, HARDENED_OFFSET, HARDENED_OFFSET]
    const key = await deriveExtendedKey(legacyPath)
    expect(key.startsWith('xpub')).toBe(true)
    expect(key.length).toBeGreaterThan(100)
  })

  it('derives a ypub for BIP49 wrapped segwit path', async () => {
    const wrappedSegwitPath = [HARDENED_OFFSET + 49, HARDENED_OFFSET, HARDENED_OFFSET]
    const key = await deriveExtendedKey(wrappedSegwitPath)
    expect(key.startsWith('ypub')).toBe(true)
    expect(key.length).toBeGreaterThan(100)
  })

  it('derives a zpub for BIP84 native segwit path', async () => {
    const nativeSegwitPath = [HARDENED_OFFSET + 84, HARDENED_OFFSET, HARDENED_OFFSET]
    const key = await deriveExtendedKey(nativeSegwitPath)
    expect(key.startsWith('zpub')).toBe(true)
    expect(key.length).toBeGreaterThan(100)
  })

  it('derives a upub for testnet BIP49 path', async () => {
    const testnetWrappedPath = [HARDENED_OFFSET + 49, HARDENED_OFFSET + 1, HARDENED_OFFSET]
    const key = await deriveExtendedKey(testnetWrappedPath)
    expect(key.startsWith('upub')).toBe(true)
    expect(key.length).toBeGreaterThan(100)
  })

  it('derives a vpub for testnet BIP84 path', async () => {
    const testnetNativePath = [HARDENED_OFFSET + 84, HARDENED_OFFSET + 1, HARDENED_OFFSET]
    const key = await deriveExtendedKey(testnetNativePath)
    expect(key.startsWith('vpub')).toBe(true)
    expect(key.length).toBeGreaterThan(100)
  })
})
