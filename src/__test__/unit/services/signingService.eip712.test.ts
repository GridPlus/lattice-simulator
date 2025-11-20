import { SignatureEngine } from '@/core/signing/SignatureEngine'
import { SIGNING_SCHEMA, EXTERNAL } from '@/shared/constants'
import type { EthereumWalletAccount, WalletAccount } from '@/shared/types/wallet'

const buildWalletAccounts = (): Map<string, WalletAccount> => {
  const derivationPath = [0x8000002c, 0x8000003c, 0x80000000, 0, 0]
  const account: EthereumWalletAccount = {
    id: 'eth-internal-test',
    accountIndex: 0,
    derivationPath,
    derivationPathString: "m/44'/60'/0'/0/0",
    type: 'internal',
    coinType: 'ETH',
    isActive: true,
    name: 'Test ETH Account',
    createdAt: Date.now(),
    address: '0x0000000000000000000000000000000000000000',
    publicKey: '',
    privateKey: undefined,
  }
  return new Map([[account.id, account]])
}

describe('SignatureEngine EIP-712 hashing', () => {
  const service = new SignatureEngine()

  it('signs prehashed EIP-712 digests without attempting CBOR decoding', async () => {
    const digest = Buffer.alloc(32, 0x11)
    const digestWithPadding = Buffer.concat([digest, Buffer.alloc(12, 0x22)])

    const signSpy = vi.spyOn(service as any, 'secp256k1Sign')

    try {
      const walletAccounts = buildWalletAccounts()
      const response = await service.signData(
        {
          path: [0x8000002c, 0x8000003c, 0x80000000, 0, 0],
          data: digestWithPadding,
          curve: EXTERNAL.SIGNING.CURVES.SECP256K1,
          encoding: EXTERNAL.SIGNING.ENCODINGS.EVM,
          hashType: EXTERNAL.SIGNING.HASHES.NONE,
          schema: SIGNING_SCHEMA.ETH_MSG,
          protocol: 'eip712',
          isPrehashed: true,
        },
        walletAccounts,
      )

      expect(response.signature?.length).toBeGreaterThan(0)
      expect(signSpy).toHaveBeenCalled()
      const [hashArg] = signSpy.mock.calls[0]
      expect(Buffer.isBuffer(hashArg)).toBe(true)
      expect((hashArg as Buffer).length).toBe(32)
      expect((hashArg as Buffer).equals(digest)).toBe(true)
    } finally {
      signSpy.mockRestore()
    }
  })
})
