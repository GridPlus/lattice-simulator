import { describe, expect, it } from 'vitest'
import { defaultSafeCardName, generateSafeCardUid } from '../../../core/utils/safecard'

describe('SafeCard utils', () => {
  it('generates deterministic UIDs for external and internal wallets', () => {
    const external = generateSafeCardUid(1, 'external')
    const internal = generateSafeCardUid(1, 'internal')

    expect(external).toHaveLength(64)
    expect(internal).toHaveLength(64)
    expect(external).not.toEqual(internal)
    expect(external.startsWith('aa00000001')).toBe(true)
    expect(internal.startsWith('bb00000001')).toBe(true)
  })

  it('formats default SafeCard names with the id', () => {
    expect(defaultSafeCardName(3)).toBe('SafeCard #3')
  })
})
