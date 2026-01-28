/**
 * Unit tests for finalizePairing request parsing and handling
 *
 * Tests the simulator's ability to correctly parse and validate
 * finalizePairing requests from the SDK, using real test data
 * from the SDK's test suite.
 */

import { DeviceSimulator } from '../../../server/deviceSimulator'
import { ProtocolHandler as ServerProtocolHandler } from '../../../server/protocolHandler'
import { LatticeResponseCode } from '../../../core/types'
import { createHash } from 'crypto'
import elliptic from 'elliptic'

// Test data from SDK's test suite
const TEST_DATA = {
  // From SDK's encoders.test.ts
  pairingSecret: 'testPairingSecret',
  appName: 'testAppName',
  privateKey: Buffer.alloc(32, '1'), // 32 bytes of '1'

  // Expected payload structure from SDK's encodePairRequest
  expectedPayloadLength: 99, // 25 bytes (app name) + 74 bytes (DER signature)
  expectedAppNameLength: 25,
  expectedDerSignatureLength: 74,
}

/**
 * Helper function to create a test key pair using the same logic as SDK
 */
function createTestKeyPair(privateKey: Buffer) {
  const ec = new elliptic.ec('p256')
  return ec.keyFromPrivate(privateKey)
}

function getClientPublicKey(): Buffer {
  const clientKeyPair = createTestKeyPair(TEST_DATA.privateKey)
  return Buffer.from(clientKeyPair.getPublic().encode('hex', false), 'hex')
}

/**
 * Helper function to generate app secret using SDK's logic
 */
function generateAppSecret(publicKey: Buffer, appName: Buffer, pairingSecret: Buffer): Buffer {
  const preImage = Buffer.concat([publicKey, appName, pairingSecret])
  return createHash('sha256').update(preImage).digest()
}

/**
 * Helper function to create DER signature using SDK's logic
 */
function createDerSignature(keyPair: any, hash: Buffer): Buffer {
  const sig = keyPair.sign(hash)
  const derSig = sig.toDER()
  // Convert Uint8Array to Buffer and pad to 74 bytes as per SDK's toPaddedDER function
  const derBuffer = Buffer.from(derSig)
  const paddedDer = Buffer.alloc(74)
  derBuffer.copy(paddedDer)
  return paddedDer
}

/**
 * Helper function to create a complete finalizePairing payload using SDK's logic
 */
function createFinalizePairingPayload(
  privateKey: Buffer,
  appName: string,
  pairingSecret: string,
): Buffer {
  const keyPair = createTestKeyPair(privateKey)
  const publicKey = Buffer.from(keyPair.getPublic().encode('hex', false), 'hex')

  // Create app name buffer (25 bytes, null-terminated)
  const nameBuf = Buffer.alloc(25)
  nameBuf.write(appName)

  // Generate hash using SDK's logic
  const hash = generateAppSecret(publicKey, nameBuf, Buffer.from(pairingSecret))

  // Create signature
  const derSig = createDerSignature(keyPair, hash)

  // Combine as per SDK's encodePairRequest
  return Buffer.concat([nameBuf, derSig])
}

describe('finalizePairing Request Parsing and Handling', () => {
  let simulator: DeviceSimulator
  let protocolHandler: ServerProtocolHandler

  beforeEach(async () => {
    simulator = new DeviceSimulator({
      deviceId: 'test-device-id',
      firmwareVersion: [0, 15, 0],
      autoApprove: false,
      pairingCode: TEST_DATA.pairingSecret,
    })
    protocolHandler = new ServerProtocolHandler(simulator)
    // Reset simulator state completely
    simulator.reset()
    // Set a test pairing code
    ;(simulator as any).pairingCode = TEST_DATA.pairingSecret
    // Set a client public key for testing
    const clientPublicKey = getClientPublicKey()
    await simulator.connect({
      deviceId: 'test-device-id',
      publicKey: clientPublicKey,
    })
    // Set up simulator in pairing mode
    simulator.enterPairingMode()
  })

  describe('parsePairRequest', () => {
    it('should correctly parse a valid finalizePairing payload', () => {
      const payload = createFinalizePairingPayload(
        TEST_DATA.privateKey,
        TEST_DATA.appName,
        TEST_DATA.pairingSecret,
      )

      // Access the private parsePairRequest method for testing
      const parsePairRequest = (protocolHandler as any).parsePairRequest.bind(protocolHandler)
      const result = parsePairRequest(payload)

      expect(result).toBeDefined()
      expect(result.appName).toBe(TEST_DATA.appName)
      expect(result.derSignature).toBeDefined()
      expect(result.derSignature.length).toBe(TEST_DATA.expectedDerSignatureLength)
    })

    it('should handle payload with exact expected length', () => {
      const payload = createFinalizePairingPayload(
        TEST_DATA.privateKey,
        TEST_DATA.appName,
        TEST_DATA.pairingSecret,
      )

      expect(payload.length).toBe(TEST_DATA.expectedPayloadLength)

      const parsePairRequest = (protocolHandler as any).parsePairRequest.bind(protocolHandler)
      const result = parsePairRequest(payload)

      expect(result).toBeDefined()
      expect(result.appName).toBe(TEST_DATA.appName)
    })

    it('should handle app name with null termination', () => {
      const shortAppName = 'test'
      const payload = createFinalizePairingPayload(
        TEST_DATA.privateKey,
        shortAppName,
        TEST_DATA.pairingSecret,
      )

      const parsePairRequest = (protocolHandler as any).parsePairRequest.bind(protocolHandler)
      const result = parsePairRequest(payload)

      expect(result.appName).toBe(shortAppName)
    })

    it('should handle app name with trailing nulls', () => {
      const appNameWithNulls = 'test\0\0\0'
      const payload = createFinalizePairingPayload(
        TEST_DATA.privateKey,
        appNameWithNulls,
        TEST_DATA.pairingSecret,
      )

      const parsePairRequest = (protocolHandler as any).parsePairRequest.bind(protocolHandler)
      const result = parsePairRequest(payload)

      // Should strip trailing nulls
      expect(result.appName).toBe('test')
    })

    it('should throw error for payload that is too short', () => {
      const shortPayload = Buffer.alloc(50) // Less than expected 99 bytes

      const parsePairRequest = (protocolHandler as any).parsePairRequest.bind(protocolHandler)

      expect(() => parsePairRequest(shortPayload)).toThrow('Invalid finalizePairing payload size')
    })

    it('should throw error for payload that is too long', () => {
      const longPayload = Buffer.alloc(150) // More than expected 99 bytes

      const parsePairRequest = (protocolHandler as any).parsePairRequest.bind(protocolHandler)

      expect(() => parsePairRequest(longPayload)).toThrow('Invalid finalizePairing payload size')
    })
  })

  describe('parseDERSignature', () => {
    it('should correctly parse DER signature components', () => {
      const keyPair = createTestKeyPair(TEST_DATA.privateKey)
      const publicKey = Buffer.from(keyPair.getPublic().encode('hex', false), 'hex')
      const nameBuf = Buffer.alloc(25)
      nameBuf.write(TEST_DATA.appName)
      const hash = generateAppSecret(publicKey, nameBuf, Buffer.from(TEST_DATA.pairingSecret))
      const sig = keyPair.sign(hash)
      const derSig = createDerSignature(keyPair, hash)

      const parseDERSignature = (simulator as any).parseDERSignature.bind(simulator)
      const result = parseDERSignature(derSig)

      expect(result).toBeDefined()
      expect(result.r).toBeDefined()
      expect(result.s).toBeDefined()
      expect(result.r.length).toBe(32)
      expect(result.s.length).toBe(32)
    })

    it('should handle DER signature with leading zeros', () => {
      // Create a signature that might have leading zeros
      const keyPair = createTestKeyPair(TEST_DATA.privateKey)
      const publicKey = Buffer.from(keyPair.getPublic().encode('hex', false), 'hex')
      const nameBuf = Buffer.alloc(25)
      nameBuf.write(TEST_DATA.appName)
      const hash = generateAppSecret(publicKey, nameBuf, Buffer.from(TEST_DATA.pairingSecret))
      const sig = keyPair.sign(hash)
      const derSig = createDerSignature(keyPair, hash)

      const parseDERSignature = (simulator as any).parseDERSignature.bind(simulator)
      const result = parseDERSignature(derSig)

      expect(result.r.length).toBe(32)
      expect(result.s.length).toBe(32)
    })

    it('should throw error for invalid DER format', () => {
      const invalidDer = Buffer.alloc(74, 0x00) // All zeros

      const parseDERSignature = (simulator as any).parseDERSignature.bind(simulator)

      expect(() => parseDERSignature(invalidDer)).toThrow('Invalid DER signature format')
    })
  })

  describe('validateSignatureFormat', () => {
    it('should validate correct signature components', () => {
      const keyPair = createTestKeyPair(TEST_DATA.privateKey)
      const publicKey = Buffer.from(keyPair.getPublic().encode('hex', false), 'hex')
      const nameBuf = Buffer.alloc(25)
      nameBuf.write(TEST_DATA.appName)
      const hash = generateAppSecret(publicKey, nameBuf, Buffer.from(TEST_DATA.pairingSecret))
      const sig = keyPair.sign(hash)
      const derSig = createDerSignature(keyPair, hash)

      const parseDERSignature = (simulator as any).parseDERSignature.bind(simulator)
      const { r, s } = parseDERSignature(derSig)

      const validateSignatureFormat = (simulator as any).validateSignatureFormat.bind(simulator)
      const isValid = validateSignatureFormat(r, s)

      expect(isValid).toBe(true)
    })

    it('should reject signature components that are too short', () => {
      const shortR = Buffer.alloc(16, 0x01)
      const shortS = Buffer.alloc(16, 0x02)

      const validateSignatureFormat = (simulator as any).validateSignatureFormat.bind(simulator)
      const isValid = validateSignatureFormat(shortR, shortS)

      expect(isValid).toBe(false)
    })

    it('should reject signature components that are too long', () => {
      const longR = Buffer.alloc(64, 0x01)
      const longS = Buffer.alloc(64, 0x02)

      const validateSignatureFormat = (simulator as any).validateSignatureFormat.bind(simulator)
      const isValid = validateSignatureFormat(longR, longS)

      expect(isValid).toBe(false)
    })

    it('should reject zero signature components', () => {
      const zeroR = Buffer.alloc(32, 0x00)
      const zeroS = Buffer.alloc(32, 0x00)

      const validateSignatureFormat = (simulator as any).validateSignatureFormat.bind(simulator)
      const isValid = validateSignatureFormat(zeroR, zeroS)

      expect(isValid).toBe(false)
    })

    it('should reject signature components equal to curve order', () => {
      const p256Order = Buffer.from(
        'FFFFFFFF00000000FFFFFFFFFFFFFFFFBCE6FAADA7179E84F3B9CAC2FC632551',
        'hex',
      )
      const r = Buffer.from(p256Order)
      const s = Buffer.alloc(32, 0x01)

      const validateSignatureFormat = (simulator as any).validateSignatureFormat.bind(simulator)
      const isValid = validateSignatureFormat(r, s)

      expect(isValid).toBe(false)
    })
  })

  describe('validateSignatureComponents', () => {
    it('should validate signature components within valid range', () => {
      const validR = Buffer.alloc(32, 0x01)
      const validS = Buffer.alloc(32, 0x02)

      const validateSignatureComponents = (simulator as any).validateSignatureComponents.bind(
        simulator,
      )
      const isValid = validateSignatureComponents(validR, validS)

      expect(isValid).toBe(true)
    })

    it('should reject signature components exceeding curve order', () => {
      const p256Order = Buffer.from(
        'FFFFFFFF00000000FFFFFFFFFFFFFFFFBCE6FAADA7179E84F3B9CAC2FC632551',
        'hex',
      )
      const exceedOrder = Buffer.from(
        'FFFFFFFF00000000FFFFFFFFFFFFFFFFBCE6FAADA7179E84F3B9CAC2FC632552',
        'hex',
      ) // +1
      const validS = Buffer.alloc(32, 0x01)

      const validateSignatureComponents = (simulator as any).validateSignatureComponents.bind(
        simulator,
      )
      const isValid = validateSignatureComponents(exceedOrder, validS)

      expect(isValid).toBe(false)
    })

    it('should reject zero signature components', () => {
      const zeroR = Buffer.alloc(32, 0x00)
      const zeroS = Buffer.alloc(32, 0x00)

      const validateSignatureComponents = (simulator as any).validateSignatureComponents.bind(
        simulator,
      )
      const isValid = validateSignatureComponents(zeroR, zeroS)

      expect(isValid).toBe(false)
    })
  })

  describe('pair method integration', () => {
    it('should successfully process a valid finalizePairing request', async () => {
      const payload = createFinalizePairingPayload(
        TEST_DATA.privateKey,
        TEST_DATA.appName,
        TEST_DATA.pairingSecret,
      )

      const request = (protocolHandler as any).parsePairRequest(payload)
      const response = await simulator.pair(request)

      expect(response.success).toBe(true)
      expect(response.code).toBe(LatticeResponseCode.success)
      expect(response.data).toBe(true)
    })

    it('should reject finalizePairing request without DER signature', async () => {
      const request = {
        appName: TEST_DATA.appName,
        pairingSecret: TEST_DATA.pairingSecret,
        publicKey: Buffer.alloc(65),
        // No derSignature field
      }

      const response = await simulator.pair(request)

      expect(response.success).toBe(false)
      expect(response.code).toBe(LatticeResponseCode.pairFailed)
      expect(response.error).toContain('Invalid finalizePairing request')
    })

    it('should reject finalizePairing request when not in pairing mode', async () => {
      // Exit pairing mode
      ;(simulator as any).exitPairingMode()

      const payload = createFinalizePairingPayload(
        TEST_DATA.privateKey,
        TEST_DATA.appName,
        TEST_DATA.pairingSecret,
      )

      const request = (protocolHandler as any).parsePairRequest(payload)
      const response = await simulator.pair(request)

      expect(response.success).toBe(false)
      expect(response.code).toBe(LatticeResponseCode.pairFailed)
      expect(response.error).toContain('Device not in pairing mode')
    })

    it('should reject finalizePairing request when already paired', async () => {
      const payload = createFinalizePairingPayload(
        TEST_DATA.privateKey,
        TEST_DATA.appName,
        TEST_DATA.pairingSecret,
      )

      const request = (protocolHandler as any).parsePairRequest(payload)
      const initialResponse = await simulator.pair(request)
      expect(initialResponse.success).toBe(true)
      const response = await simulator.pair(request)

      expect(response.success).toBe(false)
      expect(response.code).toBe(LatticeResponseCode.already)
    })

    it('should reject finalizePairing request when device is locked', async () => {
      // Lock the device
      ;(simulator as any).isLocked = true

      const payload = createFinalizePairingPayload(
        TEST_DATA.privateKey,
        TEST_DATA.appName,
        TEST_DATA.pairingSecret,
      )

      const request = (protocolHandler as any).parsePairRequest(payload)
      const response = await simulator.pair(request)

      expect(response.success).toBe(false)
      expect(response.code).toBe(LatticeResponseCode.deviceLocked)
    })
  })

  describe('real-world test scenarios', () => {
    it('should handle SDK test case: pairingSecret="testPairingSecret", appName="testAppName"', async () => {
      const payload = createFinalizePairingPayload(
        TEST_DATA.privateKey,
        TEST_DATA.appName,
        TEST_DATA.pairingSecret,
      )

      // Verify payload structure matches SDK expectations
      expect(payload.length).toBe(99)

      // Parse and validate
      const request = (protocolHandler as any).parsePairRequest(payload)
      expect(request.appName).toBe('testAppName')
      expect(request.derSignature.length).toBe(74)

      // Process the request
      const response = await simulator.pair(request)
      expect(response.success).toBe(true)
    })

    // test a case where the pairing secret is not the same as the pairing code
    it('should reject finalizePairing request when pairing secret is not the same as the pairing code', async () => {
      const payload = createFinalizePairingPayload(
        TEST_DATA.privateKey,
        TEST_DATA.appName,
        'wrongPairingSecret',
      )

      const request = (protocolHandler as any).parsePairRequest(payload)
      const response = await simulator.pair(request)

      expect(response.success).toBe(false)
      expect(response.code).toBe(LatticeResponseCode.pairFailed)
      expect(response.error).toContain('Invalid signature')
    })

    it('should handle different app names correctly', async () => {
      const testCases = [
        { appName: 'MyApp', pairingSecret: 'secret123' },
        { appName: 'TestApp', pairingSecret: 'password' },
        { appName: 'LatticeSimulator', pairingSecret: 'simulator' },
      ]

      for (const testCase of testCases) {
        // Reset simulator state for each test case
        simulator.reset()
        ;(simulator as any).pairingCode = testCase.pairingSecret
        await simulator.connect({
          deviceId: 'test-device-id',
          publicKey: getClientPublicKey(),
        })
        simulator.enterPairingMode()

        const payload = createFinalizePairingPayload(
          TEST_DATA.privateKey,
          testCase.appName,
          testCase.pairingSecret,
        )

        const request = (protocolHandler as any).parsePairRequest(payload)
        expect(request.appName).toBe(testCase.appName)

        const response = await simulator.pair(request)
        expect(response.success).toBe(true)
      }
    })

    it('should handle edge case app names', async () => {
      const edgeCases = [
        { appName: '', pairingSecret: 'testPairingSecret' }, // Empty app name
        { appName: 'A'.repeat(25), pairingSecret: 'testPairingSecret' }, // Max length
      ]

      for (const testCase of edgeCases) {
        // Reset simulator state for each test case
        simulator.reset()
        ;(simulator as any).pairingCode = testCase.pairingSecret
        await simulator.connect({
          deviceId: 'test-device-id',
          publicKey: getClientPublicKey(),
        })
        simulator.enterPairingMode()

        const payload = createFinalizePairingPayload(
          TEST_DATA.privateKey,
          testCase.appName,
          testCase.pairingSecret,
        )

        const request = (protocolHandler as any).parsePairRequest(payload)
        const response = await simulator.pair(request)
        expect(response.success).toBe(true)
      }
    })
  })
})
