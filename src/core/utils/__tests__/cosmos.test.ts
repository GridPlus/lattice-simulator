import { createHash } from 'crypto'
import { bech32 } from 'bech32'
import { HARDENED_OFFSET } from '../../constants'
import { generateCosmosAddress } from '../crypto'
import { detectCoinTypeFromPath } from '../protocol'

describe('cosmos utils', () => {
  it('generates a bech32 address from a compressed public key', () => {
    const pubkey = Buffer.from(Array.from({ length: 33 }, (_, idx) => idx + 1))
    pubkey[0] = 0x02

    const sha256 = createHash('sha256').update(pubkey).digest()
    const ripemd160 = createHash('ripemd160').update(sha256).digest()
    const expected = bech32.encode('cosmos', bech32.toWords(ripemd160))

    expect(generateCosmosAddress(pubkey, 'cosmos')).toBe(expected)
  })

  it('detects Cosmos coin type from a BIP44 path', () => {
    const path = [HARDENED_OFFSET + 44, HARDENED_OFFSET + 118, HARDENED_OFFSET, 0, 0]
    expect(detectCoinTypeFromPath(path)).toBe('COSMOS')
  })
})
