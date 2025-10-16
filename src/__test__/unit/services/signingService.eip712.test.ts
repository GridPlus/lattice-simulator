import { describe, expect, it } from 'vitest'
import { SigningService } from '@/services/signingService'

class BigNumberLike {
  private readonly value: bigint

  constructor(value: bigint) {
    this.value = value
  }

  toString(base?: number): string {
    return this.value.toString(base ?? 10)
  }
}

Object.defineProperty(BigNumberLike, 'name', { value: 'BigNumber' })

describe('SigningService EIP-712 hashing', () => {
  const service = new SigningService()

  it('normalizes values that mimic bignumber.js instances', () => {
    const payload = {
      types: {
        EIP712Domain: [],
        Example: [{ name: 'value', type: 'uint256' }],
      },
      primaryType: 'Example',
      domain: {},
      message: {
        value: new BigNumberLike(BigInt('12345678901234567890')),
      },
    }

    const normalized = (
      service as unknown as {
        normalizeEip712Data(data: any): any
      }
    ).normalizeEip712Data(payload)

    expect(normalized.message.value).toBe('12345678901234567890')
  })
})
