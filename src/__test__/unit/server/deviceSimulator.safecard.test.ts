import { afterEach, describe, expect, it } from 'vitest'
import { DeviceSimulator } from '../../../server/deviceSimulator'
import { SIMULATOR_CONSTANTS } from '../../../core/protocol/constants'
import {
  getWalletConfig,
  normalizeMnemonic,
  setWalletMnemonicOverride,
  setWalletSeedOverride,
} from '../../../core/walletConfig'
import { generateSafeCardUid } from '../../../core/utils/safecard'

describe('DeviceSimulator SafeCard activation', () => {
  afterEach(() => {
    setWalletSeedOverride(null)
    setWalletMnemonicOverride(null)
  })

  it('updates active wallets and wallet config when activating a SafeCard', async () => {
    const simulator = new DeviceSimulator({ autoApprove: true })
    const mnemonic = normalizeMnemonic(SIMULATOR_CONSTANTS.DEFAULT_MNEMONIC)
    const externalUid = generateSafeCardUid(2, 'external')

    simulator.setActiveSafeCard({
      id: 2,
      uid: externalUid,
      name: 'SafeCard #2',
      mnemonic,
    })

    const wallets = simulator.getActiveWallets()

    expect(wallets.external.uid).toBe(externalUid)
    expect(wallets.internal.uid).toBe(generateSafeCardUid(2, 'internal'))
    expect(wallets.external.name).toBe('SafeCard #2')
    expect(wallets.internal.name).toBe('SafeCard #2 (Internal)')

    const config = await getWalletConfig()
    expect(config.mnemonic).toBe(mnemonic)
  })
})
