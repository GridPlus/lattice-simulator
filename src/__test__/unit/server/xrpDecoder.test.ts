import { describe, expect, it } from 'vitest'
import { decodeXrpSignPayload } from '../../../server/utils/xrpDecoder'

const XRP_PAYMENT_SIGN_PREIMAGE_HEX =
  '53545800120000228000000024000000016140000000000003e868400000000000000a7321ed5f5ac8b98974a3ca843326d9b88cebd0560177b973ee0b149f782cfaa06dc66a81145b812c9d57731e27a2da8b1830195f88ef32a3b68314b5f762798a53d543a014caf8b297cff8f2f937e8'

const XRP_OFFER_CREATE_IOU_XRP_PREIMAGE_HEX =
  '535458001200072280010000240000000964d4838d7ea4c680000000000000000000000000005553440000000000b5f762798a53d543a014caf8b297cff8f2f937e8654000000002faf08068400000000000000c7321ed5f5ac8b98974a3ca843326d9b88cebd0560177b973ee0b149f782cfaa06dc66a81145b812c9d57731e27a2da8b1830195f88ef32a3b6'

describe('decodeXrpSignPayload', () => {
  it('decodes payment metadata from STX-prefixed payloads', () => {
    const payload = Buffer.from(XRP_PAYMENT_SIGN_PREIMAGE_HEX, 'hex')
    const decoded = decodeXrpSignPayload(payload)

    expect(decoded).not.toBeNull()
    expect(decoded?.transactionType).toBe('Payment')
    expect(decoded?.account?.startsWith('r')).toBe(true)
    expect(decoded?.destination?.startsWith('r')).toBe(true)
    expect(decoded?.amount).toBe('0.001')
    expect(decoded?.details).toContain('[Amount] 0.001 XRP (1000 drops)')
    expect(decoded?.details).toContain('[Fee] 0.00001 XRP (10 drops)')
  })

  it('decodes IOU amounts for offer-create payloads', () => {
    const payload = Buffer.from(XRP_OFFER_CREATE_IOU_XRP_PREIMAGE_HEX, 'hex')
    const decoded = decodeXrpSignPayload(payload)

    expect(decoded).not.toBeNull()
    expect(decoded?.transactionType).toBe('OfferCreate')
    expect(decoded?.details).toContain('[TakerPays]')
    expect(decoded?.details).toContain('USD')
    expect(decoded?.details).toContain('issuer r')
    expect(decoded?.details).toContain('[TakerGets]')
  })

  it('returns null for empty payloads', () => {
    expect(decodeXrpSignPayload(Buffer.alloc(0))).toBeNull()
  })
})
