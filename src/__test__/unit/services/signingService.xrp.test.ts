import { createHash } from 'crypto'
import { ec as EC } from 'elliptic'
import { SignatureEngine } from '@/core/signing/SignatureEngine'
import { EXTERNAL, HARDENED_OFFSET, SIGNING_SCHEMA } from '@/shared/constants'
import { deriveHDKey } from '@/shared/utils/hdWallet'
import { getWalletConfig } from '@/shared/walletConfig'
import type { SigningRequest } from '@/core/signing/SignatureEngine'

const sha512half = (payload: Buffer): Buffer =>
  createHash('sha512').update(payload).digest().subarray(0, 32)

describe('SignatureEngine XRP', () => {
  it('signs XRP payloads with SHA512HALF for XRP encoding', async () => {
    const engine = new SignatureEngine()
    const payload = Buffer.from('xrp-signing-test')
    const path = [HARDENED_OFFSET + 44, HARDENED_OFFSET + 144, HARDENED_OFFSET, 0, 0]

    const request: SigningRequest = {
      path,
      data: payload,
      schema: SIGNING_SCHEMA.GENERAL_SIGNING,
      curve: EXTERNAL.SIGNING.CURVES.SECP256K1,
      encoding: EXTERNAL.SIGNING.ENCODINGS.XRP,
      hashType: EXTERNAL.SIGNING.HASHES.SHA512HALF,
    }

    const result = await engine.signData(request, new Map())
    expect(result.format).toBe('der')
    expect(result.signature).toBeInstanceOf(Buffer)

    const config = await getWalletConfig()
    const derived = deriveHDKey(config.seed, path)
    const digest = sha512half(payload)

    const secp = new EC('secp256k1')
    const keyPair = secp.keyFromPrivate(derived.privateKey!)
    const isValid = keyPair.verify(digest, result.signature as Buffer)

    expect(isValid).toBe(true)
  })
})
