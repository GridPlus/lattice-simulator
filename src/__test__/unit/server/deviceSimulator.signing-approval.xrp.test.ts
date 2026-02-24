import { createHash } from 'crypto'
import elliptic from 'elliptic'
import { DeviceSimulator } from '../../../server/deviceSimulator'
import { EXTERNAL, HARDENED_OFFSET, SIGNING_SCHEMA } from '../../../core/constants'
import { LatticeResponseCode, type SignRequest, type SigningRequest } from '../../../core/types'

const ec = new elliptic.ec('p256')

const waitForPendingSigningRequest = async (
  simulator: DeviceSimulator,
  timeoutMs: number = 5000,
): Promise<SigningRequest> => {
  const start = Date.now()

  while (Date.now() - start < timeoutMs) {
    const pending = simulator.getPendingSigningRequests()
    if (pending.length > 0) {
      return pending[0]
    }
    await new Promise(resolve => setTimeout(resolve, 25))
  }

  throw new Error('Timed out waiting for a pending signing request')
}

describe('DeviceSimulator manual approval XRP signing', () => {
  it('includes SHA512HALF prehash in manual-approval sign responses', async () => {
    const simulator = new DeviceSimulator({
      deviceId: 'test-device',
      autoApprove: false,
      pairingCode: '12345678',
    })

    const clientKeyPair = ec.keyFromPrivate(Buffer.alloc(32, 9))
    const clientPublicKey = Buffer.from(clientKeyPair.getPublic().encode('hex', false), 'hex')

    const connectResponse = await simulator.connect({
      deviceId: 'test-device',
      publicKey: clientPublicKey,
    })
    expect(connectResponse.code).toBe(LatticeResponseCode.success)
    expect(connectResponse.data?.isPaired).toBe(true)

    const payload = Buffer.from('xrp-manual-approval-signing-test')
    const request: SignRequest = {
      path: [HARDENED_OFFSET + 44, HARDENED_OFFSET + 144, HARDENED_OFFSET, 0, 0],
      data: payload,
      schema: SIGNING_SCHEMA.GENERAL_SIGNING,
      curve: EXTERNAL.SIGNING.CURVES.SECP256K1,
      encoding: EXTERNAL.SIGNING.ENCODINGS.XRP,
      hashType: EXTERNAL.SIGNING.HASHES.SHA512HALF,
    }

    const pendingSignPromise = simulator.sign(request)
    const pendingRequest = await waitForPendingSigningRequest(simulator)

    const approveResponse = await simulator.approveSigningRequest(pendingRequest.id)
    expect(approveResponse.code).toBe(LatticeResponseCode.success)

    const expectedPrehash = createHash('sha512').update(payload).digest().subarray(0, 32)

    const approvePrehash = approveResponse.data?.messagePrehash
    expect(approvePrehash).toBeInstanceOf(Buffer)
    expect(approvePrehash?.length).toBe(32)
    expect(approvePrehash).toEqual(expectedPrehash)

    const signResponse = await pendingSignPromise
    expect(signResponse.code).toBe(LatticeResponseCode.success)

    const signResponsePrehash = signResponse.data?.messagePrehash
    expect(signResponsePrehash).toBeInstanceOf(Buffer)
    expect(signResponsePrehash?.length).toBe(32)
    expect(signResponsePrehash).toEqual(expectedPrehash)
  })
})
