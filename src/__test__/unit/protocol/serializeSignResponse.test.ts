import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ProtocolHandler } from '@/server/serverProtocolHandler'
import { SignRequestSchema } from '@/server/signRequestParsers'
import type { ServerLatticeSimulator } from '@/server/serverSimulator'

describe('ProtocolHandler - serializeSignResponse Format Validation', () => {
  let protocolHandler: ProtocolHandler
  let mockSimulator: any

  beforeEach(() => {
    mockSimulator = {
      getDeviceId: vi.fn().mockReturnValue('test-device'),
      getSharedSecret: vi.fn(),
      updateEphemeralKeyPair: vi.fn(),
    } as unknown as ServerLatticeSimulator

    protocolHandler = new ProtocolHandler(mockSimulator)
  })

  describe('Bitcoin (BTC) Signature Response Format', () => {
    it('should serialize Bitcoin signatures in correct SDK format', () => {
      // Test data matching real SignResponse structure for Bitcoin
      const btcSignatureData = {
        signature: Buffer.from(
          '304402201234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef02201234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
          'hex',
        ),
        recovery: 0,
        metadata: {
          publicKey: '02c6047f9441ed7d6d3045406e95c07cd85c778e4b8cef3ca7abac09b95c709ee5',
        },
      }

      // Access the private method via type assertion for testing
      // Mock Bitcoin transaction request (schema 0)
      const mockBitcoinRequest = { schema: 0 }
      const result = (protocolHandler as any).serializeSignResponse(
        btcSignatureData,
        mockBitcoinRequest,
      )

      expect(Buffer.isBuffer(result)).toBe(true)

      // Verify SDK expected format:
      // [changeRecipient PKH (20)] + [signatures (760)] + [pubkeys (n * 33)]
      // For single signature: 20 + 760 + 1 * 33 = 813 bytes
      const expectedSize = 20 + 760 + 1 * 33
      expect(result.length).toBe(expectedSize)

      // Verify structure offsets
      let offset = 0

      // Change recipient PKH (20 bytes) - should be zeros (placeholder)
      const pkhSection = result.slice(offset, offset + 20)
      expect(pkhSection.every((byte: number) => byte === 0)).toBe(true) // Placeholder implementation
      offset += 20

      // Signatures section (760 bytes = 74 * ~10 max signatures)
      const sigsSection = result.slice(offset, offset + 760)
      expect(sigsSection.length).toBe(760)

      // First signature should start with 0x30 (DER format)
      expect(sigsSection[0]).toBe(0x30)

      // Public key at SDK expected position: pubStart = 0 * 33 + 760 = 760
      const pubkeyOffset = 0 * 33 + 760 // = 760
      const pubkey = result.slice(pubkeyOffset, pubkeyOffset + 33)
      expect(pubkey).toEqual(Buffer.from(btcSignatureData.metadata.publicKey, 'hex'))
    })

    it('should handle invalid Bitcoin signatures gracefully', () => {
      const invalidBtcData = {
        signature: Buffer.from('1234567890abcdef', 'hex'), // Invalid signature (doesn't start with 0x30)
        recovery: 0,
        metadata: {
          publicKey: '02c6047f9441ed7d6d3045406e95c07cd85c778e4b8cef3ca7abac09b95c709ee5',
        },
      }

      const mockBitcoinRequest = { schema: 0 }
      const result = (protocolHandler as any).serializeSignResponse(
        invalidBtcData,
        mockBitcoinRequest,
      )

      // Should still create properly sized response
      const expectedSize = 20 + 760 + 1 * 33
      expect(result.length).toBe(expectedSize)

      // Invalid signature should be zeroed out
      const sigsSection = result.slice(20, 20 + 760)
      const firstSigSection = sigsSection.slice(0, 74)
      expect(firstSigSection.every((byte: number) => byte === 0)).toBe(true)
    })
  })

  describe('Ethereum (ETH) Signature Response Format', () => {
    it('should serialize Ethereum signatures in correct SDK format', () => {
      const ethSignatureData = {
        signature: Buffer.from(
          '304402201234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef0220fedcba0987654321fedcba0987654321fedcba0987654321fedcba0987654321',
          'hex',
        ),
        recovery: 27,
        metadata: {
          signer: '742d35cc6af4c8e2e51b7f4c7e8b1c9f2a6e8d3b',
        },
      }

      const mockEthereumRequest = { schema: 1 }
      const result = (protocolHandler as any).serializeSignResponse(
        ethSignatureData,
        mockEthereumRequest,
      )

      expect(Buffer.isBuffer(result)).toBe(true)

      // Verify SDK expected format: [DER signature (74)] + [signer address (20)]
      expect(result.length).toBe(94) // 74 + 20

      // Verify DER signature structure
      const derSignature = result.slice(0, 74)
      expect(derSignature[0]).toBe(0x30) // DER SEQUENCE tag

      // Verify signer address
      const signerAddress = result.slice(74, 94)
      expect(signerAddress).toEqual(Buffer.from(ethSignatureData.metadata.signer, 'hex'))
    })

    it('should create valid DER encoding for Ethereum signatures', () => {
      const ethData = {
        signature: Buffer.from(
          '304402201234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef0220fedcba0987654321fedcba0987654321fedcba0987654321fedcba0987654321',
          'hex',
        ),
        recovery: 27,
        metadata: {
          signer: '742d35cc6af4c8e2e51b7f4c7e8b1c9f2a6e8d3b',
        },
      }

      const mockEthereumRequest = { schema: 1 }
      const result = (protocolHandler as any).serializeSignResponse(ethData, mockEthereumRequest)
      const derSignature = result.slice(0, 74)

      // Verify DER structure: 0x30 [total-length] 0x02 [r-length] [r] 0x02 [s-length] [s]
      expect(derSignature[0]).toBe(0x30) // SEQUENCE tag

      const totalLength = derSignature[1]
      expect(totalLength).toBeGreaterThan(0)
      expect(totalLength).toBeLessThan(74)

      // Verify R component
      expect(derSignature[2]).toBe(0x02) // INTEGER tag for R
      const rLength = derSignature[3]
      expect(rLength).toBeGreaterThanOrEqual(32)
      expect(rLength).toBeLessThanOrEqual(33)

      // Verify S component starts after R
      const sOffset = 4 + rLength
      expect(derSignature[sOffset]).toBe(0x02) // INTEGER tag for S
      const sLength = derSignature[sOffset + 1]
      expect(sLength).toBeGreaterThanOrEqual(32)
      expect(sLength).toBeLessThanOrEqual(33)
    })
  })

  describe('Basic Signature Response Format', () => {
    it('should return raw signature buffer for basic signatures', () => {
      const basicSignatureData = {
        signature: Buffer.from('304402201234567890abcdef02201234567890abcdef', 'hex'),
      }

      const result = (protocolHandler as any).serializeSignResponse(basicSignatureData)

      expect(result).toEqual(basicSignatureData.signature)
    })
  })

  describe('Fallback Behavior', () => {
    it('should return empty buffer for unknown signature formats', () => {
      const unknownData = {
        unknown: 'format',
      }

      const result = (protocolHandler as any).serializeSignResponse(unknownData)

      expect(Buffer.isBuffer(result)).toBe(true)
      expect(result.length).toBe(0)
    })

    it('should handle missing signature data gracefully', () => {
      const emptyData = {}

      const result = (protocolHandler as any).serializeSignResponse(emptyData)

      expect(Buffer.isBuffer(result)).toBe(true)
      expect(result.length).toBe(0)
    })

    it('should serialize nextCode acknowledgements as 8-byte buffers', () => {
      const nextCode = Buffer.from('0102030405060708', 'hex')

      const result = (protocolHandler as any).serializeSignResponse({ nextCode })

      expect(Buffer.isBuffer(result)).toBe(true)
      expect(result.length).toBe(8)
      expect(result.equals(nextCode)).toBe(true)
    })
  })

  describe('DER Encoding Validation', () => {
    it('should create valid DER signature from r,s components', () => {
      const r = '1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef'
      const s = 'fedcba0987654321fedcba0987654321fedcba0987654321fedcba0987654321'

      // Test the createDERSignature method directly
      const derSig = (protocolHandler as any).createDERSignature(r, s)

      expect(Buffer.isBuffer(derSig)).toBe(true)

      // Verify DER structure
      expect(derSig[0]).toBe(0x30) // SEQUENCE tag
      const totalLength = derSig[1]
      expect(totalLength).toBe(derSig.length - 2) // Total length excluding tag and length byte

      // Verify R component
      expect(derSig[2]).toBe(0x02) // INTEGER tag
      const rLength = derSig[3]
      expect(rLength).toBeGreaterThanOrEqual(32)
      expect(rLength).toBeLessThanOrEqual(33)

      const rBytes = derSig.slice(4, 4 + rLength)
      expect(rBytes.slice(-32)).toEqual(Buffer.from(r.slice(-64), 'hex'))

      // Verify S component
      const sOffset = 4 + rLength
      expect(derSig[sOffset]).toBe(0x02) // INTEGER tag
      const sLength = derSig[sOffset + 1]
      expect(sLength).toBeGreaterThanOrEqual(32)
      expect(sLength).toBeLessThanOrEqual(33)

      const sBytes = derSig.slice(sOffset + 2, sOffset + 2 + sLength)
      expect(sBytes.slice(-32)).toEqual(Buffer.from(s.slice(-64), 'hex'))
    })
  })

  describe('Generic Signing Signature Normalization', () => {
    const pubkeyHex = '04' + '11'.repeat(32) + '22'.repeat(32) // Simple uncompressed pubkey placeholder

    const buildGenericRequest = (overrides: any = {}) => ({
      schema: SignRequestSchema.GENERIC,
      omitPubkey: false,
      ...overrides,
    })

    it('should convert 64-byte raw signature into DER encoding', () => {
      const rawSignature = Buffer.concat([Buffer.alloc(32, 0x01), Buffer.alloc(32, 0x02)])

      const result = (protocolHandler as any).serializeSignResponse(
        {
          signature: rawSignature,
          metadata: { publicKey: pubkeyHex },
        },
        buildGenericRequest(),
      )

      const pubkeySection = result.slice(0, 65)
      expect(pubkeySection[0]).toBe(0x04)
      const derSection = result.slice(65)
      expect(derSection[0]).toBe(0x30)
    })

    it('should strip recovery byte from 65-byte RSV signatures', () => {
      const rawSignature = Buffer.concat([
        Buffer.alloc(32, 0x03),
        Buffer.alloc(32, 0x04),
        Buffer.from([0x01]),
      ])

      const result = (protocolHandler as any).serializeSignResponse(
        {
          signature: rawSignature,
          metadata: { publicKey: pubkeyHex },
        },
        buildGenericRequest(),
      )

      const derSection = result.slice(65)
      expect(derSection[0]).toBe(0x30)
    })

    it('should handle hex string signatures', () => {
      const r = 'aa'.repeat(32)
      const s = 'bb'.repeat(32)
      const hexSignature = `0x${r}${s}`

      const result = (protocolHandler as any).serializeSignResponse(
        {
          signature: hexSignature,
          metadata: { publicKey: pubkeyHex },
        },
        buildGenericRequest(),
      )

      const derSection = result.slice(65)
      expect(derSection[0]).toBe(0x30)
    })
  })

  describe('SDK Compatibility Tests', () => {
    it('should match exact format expected by SDK decodeSignResponse for Bitcoin', () => {
      // This test ensures our format exactly matches what the SDK's decodeSignResponse expects
      const btcData = {
        signature: Buffer.from(
          '304402201111111111111111111111111111111111111111111111111111111111111111022022222222222222222222222222222222222222222222222222222222222222',
          'hex',
        ),
        recovery: 0,
        metadata: {
          publicKey: '033333333333333333333333333333333333333333333333333333333333333333',
        },
      }

      const mockBitcoinRequest = { schema: 0 }
      const result = (protocolHandler as any).serializeSignResponse(btcData, mockBitcoinRequest)

      // Verify the exact layout SDK expects
      expect(result.length).toBe(20 + 760 + 33) // PKH + sigs + one pubkey

      // PKH section (should be zeros as placeholder)
      const pkh = result.slice(0, 20)
      expect(pkh.every((byte: number) => byte === 0)).toBe(true)

      // Signature section
      const sigSection = result.slice(20, 780)
      expect(sigSection[0]).toBe(0x30) // First sig starts with DER tag

      // Pubkey section at SDK expected position: pubStart = 0 * 33 + 760 = 760
      const pubkeySection = result.slice(760, 793) // First pubkey: 33 bytes at position 760
      expect(pubkeySection).toEqual(Buffer.from(btcData.metadata.publicKey, 'hex'))
    })

    it('should match exact format expected by SDK decodeSignResponse for Ethereum', () => {
      const ethData = {
        signature: Buffer.from(
          '30440220555555555555555555555555555555555555555555555555555555555555555502206666666666666666666666666666666666666666666666666666666666666666',
          'hex',
        ),
        recovery: 27,
        metadata: {
          signer: '7777777777777777777777777777777777777777',
        },
      }

      const mockEthereumRequest = { schema: 1 }
      const result = (protocolHandler as any).serializeSignResponse(ethData, mockEthereumRequest)

      // Verify exact layout: 74 bytes DER + 20 bytes signer
      expect(result.length).toBe(94)

      // DER signature validation
      const derSig = result.slice(0, 74)
      expect(derSig[0]).toBe(0x30) // SEQUENCE tag

      // Signer address validation
      const signer = result.slice(74)
      expect(signer).toEqual(Buffer.from(ethData.metadata.signer, 'hex'))
    })
  })
})
