import { describe, expect, it } from 'vitest'
import { HARDENED_OFFSET } from '../../../core/constants'
import { DeviceSimulator } from '../../../server/deviceSimulator'

type ManualAddressDeriver = {
  deriveAddressesManually: (
    startPath: number[],
    count: number,
    coinType: 'ETH' | 'BTC' | 'SOL' | 'COSMOS' | 'XRP',
    flag?: number,
    iterIdx?: number,
  ) => Promise<{ addresses: string[]; publicKeys?: Buffer[] }>
}

describe('DeviceSimulator XRP manual address derivation', () => {
  it('returns XRP classic addresses instead of EVM-style hex addresses', async () => {
    const simulator = new DeviceSimulator({ autoApprove: true })
    const derive = simulator as unknown as ManualAddressDeriver
    const path = [HARDENED_OFFSET + 44, HARDENED_OFFSET + 144, HARDENED_OFFSET, 0, 0]

    const response = await derive.deriveAddressesManually(path, 2, 'XRP')

    expect(response.addresses).toHaveLength(2)
    expect(response.addresses[0].startsWith('r')).toBe(true)
    expect(response.addresses[0].startsWith('0x')).toBe(false)
    expect(response.addresses[1].startsWith('r')).toBe(true)
    expect(response.addresses[1].startsWith('0x')).toBe(false)
  })
})
