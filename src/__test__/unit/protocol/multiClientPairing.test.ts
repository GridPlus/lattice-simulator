import { createHash } from 'crypto'
import crc32 from 'crc-32'
import elliptic from 'elliptic'
import { aes256_encrypt } from '@/shared/utils/crypto'
import { DeviceSimulator } from '@/server/deviceSimulator'
import { ProtocolHandler } from '@/server/protocolHandler'
import { LatticeResponseCode, LatticeSecureEncryptedRequestType } from '@/shared/types'

const ec = new elliptic.ec('p256')

const pairingSecret = 'PAIRING-SECRET'

function createClientKeyPair(byteValue: number) {
  return ec.keyFromPrivate(Buffer.alloc(32, byteValue))
}

function getClientPublicKey(keyPair: any): Buffer {
  return Buffer.from(keyPair.getPublic().encode('hex', false), 'hex')
}

function createPairRequest(privateKey: Buffer, appName: string, secret: string) {
  const keyPair = ec.keyFromPrivate(privateKey)
  const publicKey = Buffer.from(keyPair.getPublic().encode('hex', false), 'hex')
  const nameBuf = Buffer.alloc(25)
  nameBuf.write(appName)
  const hash = createHash('sha256')
    .update(Buffer.concat([publicKey, nameBuf, Buffer.from(secret)]))
    .digest()
  const sig = keyPair.sign(hash)
  const derSig = Buffer.from(sig.toDER())
  const padded = Buffer.alloc(74)
  derSig.copy(padded)
  return {
    appName,
    derSignature: padded,
  }
}

function computeEphemeralId(sharedSecret: Buffer): number {
  return createHash('sha256').update(sharedSecret).digest().readUInt32BE(0)
}

function buildEncryptedRequest(
  requestType: LatticeSecureEncryptedRequestType,
  requestData: Buffer,
  sharedSecret: Buffer,
): Buffer {
  const payload = Buffer.alloc(1728)
  let offset = 0
  payload.writeUInt8(requestType, offset)
  offset += 1
  requestData.copy(payload, offset)
  offset += requestData.length
  const checksum = crc32.buf(payload.slice(0, offset)) >>> 0
  payload.writeUInt32LE(checksum, offset)
  return aes256_encrypt(payload, sharedSecret)
}

describe('Multi-client pairing support', () => {
  it('allows multiple clients to pair sequentially and re-pair returns already', async () => {
    const simulator = new DeviceSimulator({
      deviceId: 'test-device',
      pairingCode: pairingSecret,
      autoApprove: true,
    })

    const client1 = createClientKeyPair(1)
    const client2 = createClientKeyPair(2)

    const connect1 = await simulator.connect({
      deviceId: 'test-device',
      publicKey: getClientPublicKey(client1),
    })
    expect(connect1.data?.isPaired).toBe(false)
    ;(simulator as any).pairingCode = pairingSecret
    const pairReq1 = createPairRequest(Buffer.alloc(32, 1), 'Client One', pairingSecret)
    const pairResp1 = await simulator.pair(pairReq1)
    expect(pairResp1.code).toBe(LatticeResponseCode.success)

    const pairResp1Again = await simulator.pair(pairReq1)
    expect(pairResp1Again.code).toBe(LatticeResponseCode.already)

    const connect2 = await simulator.connect({
      deviceId: 'test-device',
      publicKey: getClientPublicKey(client2),
    })
    expect(connect2.data?.isPaired).toBe(false)
    ;(simulator as any).pairingCode = pairingSecret
    const pairReq2 = createPairRequest(Buffer.alloc(32, 2), 'Client Two', pairingSecret)
    const pairResp2 = await simulator.pair(pairReq2)
    expect(pairResp2.code).toBe(LatticeResponseCode.success)

    expect(simulator.getPairedClientsCount()).toBe(2)
  })

  it('connect reports pairing status per client and unpairAll resets', async () => {
    const simulator = new DeviceSimulator({
      deviceId: 'test-device',
      pairingCode: pairingSecret,
      autoApprove: true,
    })

    const client1 = createClientKeyPair(3)
    const client2 = createClientKeyPair(4)

    await simulator.connect({
      deviceId: 'test-device',
      publicKey: getClientPublicKey(client1),
    })
    ;(simulator as any).pairingCode = pairingSecret
    const pairReq1 = createPairRequest(Buffer.alloc(32, 3), 'Client One', pairingSecret)
    await simulator.pair(pairReq1)

    const connect1Again = await simulator.connect({
      deviceId: 'test-device',
      publicKey: getClientPublicKey(client1),
    })
    expect(connect1Again.data?.isPaired).toBe(true)

    const connect2 = await simulator.connect({
      deviceId: 'test-device',
      publicKey: getClientPublicKey(client2),
    })
    expect(connect2.data?.isPaired).toBe(false)

    simulator.unpairAll()

    const connectAfterReset = await simulator.connect({
      deviceId: 'test-device',
      publicKey: getClientPublicKey(client1),
    })
    expect(connectAfterReset.data?.isPaired).toBe(false)
    expect(simulator.getPairedClientsCount()).toBe(0)
  })

  it('decrypts secure requests using the correct session secret', async () => {
    const simulator = new DeviceSimulator({
      deviceId: 'test-device',
      pairingCode: pairingSecret,
      autoApprove: true,
    })
    const protocolHandler = new ProtocolHandler(simulator)

    const client1 = createClientKeyPair(5)
    const client2 = createClientKeyPair(6)

    await simulator.connect({
      deviceId: 'test-device',
      publicKey: getClientPublicKey(client1),
    })
    ;(simulator as any).pairingCode = pairingSecret
    const client1Secret = simulator.getSharedSecret()
    if (!client1Secret) throw new Error('Missing shared secret for client1')
    const client1EphemeralId = computeEphemeralId(client1Secret)
    const pairReq1 = createPairRequest(Buffer.alloc(32, 5), 'Client One', pairingSecret)
    await simulator.pair(pairReq1)

    await simulator.connect({
      deviceId: 'test-device',
      publicKey: getClientPublicKey(client2),
    })
    ;(simulator as any).pairingCode = pairingSecret
    const client2Secret = simulator.getSharedSecret()
    if (!client2Secret) throw new Error('Missing shared secret for client2')
    const client2EphemeralId = computeEphemeralId(client2Secret)
    const pairReq2 = createPairRequest(Buffer.alloc(32, 6), 'Client Two', pairingSecret)
    await simulator.pair(pairReq2)

    const encryptedRequest1 = buildEncryptedRequest(
      LatticeSecureEncryptedRequestType.getWallets,
      Buffer.alloc(0),
      client1Secret,
    )
    const encryptedRequest2 = buildEncryptedRequest(
      LatticeSecureEncryptedRequestType.getWallets,
      Buffer.alloc(0),
      client2Secret,
    )

    const response1 = await protocolHandler.handleSecureRequest({
      type: LatticeSecureEncryptedRequestType.getWallets,
      data: encryptedRequest1,
      ephemeralId: client1EphemeralId,
    })
    expect(response1.code).toBe(LatticeResponseCode.success)

    const response2 = await protocolHandler.handleSecureRequest({
      type: LatticeSecureEncryptedRequestType.getWallets,
      data: encryptedRequest2,
      ephemeralId: client2EphemeralId,
    })
    expect(response2.code).toBe(LatticeResponseCode.success)
  })
})
