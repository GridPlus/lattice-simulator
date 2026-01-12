import { createHash } from 'crypto'
import { ec as EC } from 'elliptic'
import { SignatureEngine } from '@/core/signing/SignatureEngine'
import { EXTERNAL, HARDENED_OFFSET, SIGNING_SCHEMA } from '@/shared/constants'
import { deriveHDKey } from '@/shared/utils/hdWallet'
import { getWalletConfig } from '@/shared/walletConfig'
import type { SigningRequest } from '@/core/signing/SignatureEngine'

describe('SignatureEngine Cosmos', () => {
  it('signs Cosmos payloads with SHA-256 by default', async () => {
    const engine = new SignatureEngine()
    const message = Buffer.from('cosmos-signing-test')
    const path = [HARDENED_OFFSET + 44, HARDENED_OFFSET + 118, HARDENED_OFFSET, 0, 0]

    const request: SigningRequest = {
      path,
      data: message,
      schema: SIGNING_SCHEMA.GENERAL_SIGNING,
      curve: EXTERNAL.SIGNING.CURVES.SECP256K1,
    }

    const result = await engine.signData(request, new Map())
    expect(result.format).toBe('der')
    expect(result.signature).toBeInstanceOf(Buffer)

    const config = await getWalletConfig()
    const derived = deriveHDKey(config.seed, path)
    const digest = createHash('sha256').update(message).digest()

    const secp = new EC('secp256k1')
    const keyPair = secp.keyFromPrivate(derived.privateKey!)
    const isValid = keyPair.verify(digest, result.signature as Buffer)

    expect(isValid).toBe(true)
  })
})
