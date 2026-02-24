import { createHash } from 'crypto'
import { HARDENED_OFFSET } from '../../constants'
import {
  compressSecp256k1PublicKey,
  formatDerivationPath,
  generateXrpAddress,
  parseDerivationPath,
} from '../crypto'
import { detectCoinTypeFromPath, getStandardPath } from '../protocol'

const XRP_BASE58_ALPHABET = 'rpshnaf39wBUDNEGHJKLM4PQRST7VWXYZ2bcdeCg65jkm8oFqi1tuvAxyz'

const decodeXrpBase58 = (value: string): Buffer => {
  let bytes = [0]

  for (const char of value) {
    const index = XRP_BASE58_ALPHABET.indexOf(char)
    if (index < 0) {
      throw new Error(`Invalid XRP base58 character: ${char}`)
    }

    let carry = index
    for (let i = 0; i < bytes.length; i++) {
      const current = bytes[i] * 58 + carry
      bytes[i] = current & 0xff
      carry = current >> 8
    }

    while (carry > 0) {
      bytes.push(carry & 0xff)
      carry >>= 8
    }
  }

  for (let i = 0; i < value.length && value[i] === XRP_BASE58_ALPHABET[0]; i++) {
    bytes.push(0)
  }

  bytes = bytes.reverse()
  return Buffer.from(bytes)
}

describe('xrp utils', () => {
  it('generates a classic XRP address with valid version/checksum/account id', () => {
    const compressedPubkey = Buffer.from(
      '0279be667ef9dcbbac55a06295ce870b07029bfcd' + 'b2dce28d959f2815b16f81798',
      'hex',
    )

    const address = generateXrpAddress(compressedPubkey)
    const decoded = decodeXrpBase58(address)

    expect(address.startsWith('r')).toBe(true)
    expect(decoded).toHaveLength(25)

    const payload = decoded.subarray(0, 21)
    const checksum = decoded.subarray(21)

    expect(payload[0]).toBe(0x00)

    const expectedAccountId = createHash('ripemd160')
      .update(createHash('sha256').update(compressedPubkey).digest())
      .digest()
    expect(Buffer.compare(payload.subarray(1), expectedAccountId)).toBe(0)

    const expectedChecksum = createHash('sha256')
      .update(createHash('sha256').update(payload).digest())
      .digest()
      .subarray(0, 4)
    expect(Buffer.compare(checksum, expectedChecksum)).toBe(0)
  })

  it('produces the same address for compressed and uncompressed secp256k1 public keys', () => {
    const uncompressedPubkey = Buffer.from(
      '0479be667ef9dcbbac55a06295ce870b07029bfcd' +
        'b2dce28d959f2815b16f81798483ada7726a3c4655da4fbfc' +
        '0e1108a8fd17b448a68554199c47d08ffb10d4b8',
      'hex',
    )
    const compressedPubkey = compressSecp256k1PublicKey(uncompressedPubkey)

    expect(compressedPubkey.toString('hex')).toBe(
      '0279be667ef9dcbbac55a06295ce870b07029bfcd' + 'b2dce28d959f2815b16f81798',
    )
    expect(generateXrpAddress(uncompressedPubkey)).toBe(generateXrpAddress(compressedPubkey))
  })

  it('detects XRP from path coin type and returns standard XRP path', () => {
    const standardPath = getStandardPath('XRP', 2)
    expect(standardPath).toEqual([
      HARDENED_OFFSET + 44,
      HARDENED_OFFSET + 144,
      HARDENED_OFFSET + 2,
      0,
      0,
    ])
    expect(detectCoinTypeFromPath(standardPath)).toBe('XRP')
  })

  it('formats and parses XRP standard path consistently', () => {
    const path = [HARDENED_OFFSET + 44, HARDENED_OFFSET + 144, HARDENED_OFFSET, 0, 12]
    const asString = formatDerivationPath(path)

    expect(asString).toBe("m/44'/144'/0'/0/12")
    expect(parseDerivationPath(asString)).toEqual(path)
  })
})
