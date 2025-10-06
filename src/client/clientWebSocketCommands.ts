/**
 * CLIENT-SIDE ONLY WebSocket Command Functions
 *
 * ⚠️  CLIENT-SIDE ONLY: These functions send commands from client to server via WebSocket.
 * Server-side code should never import this file.
 *
 * These functions dispatch CustomEvents that useClientWebSocketHandler picks up and
 * forwards to the server as WebSocket messages.
 */

/**
 * Sends a device command to the server via WebSocket
 */
function sendDeviceCommand(deviceId: string, command: string, data: any = {}) {
  if (typeof window === 'undefined') {
    console.warn('[ClientWebSocketCommands] Cannot send command on server-side')
    return
  }

  try {
    const commandEvent = new CustomEvent('lattice-device-command', {
      detail: {
        deviceId,
        command,
        data,
      },
    })
    window.dispatchEvent(commandEvent)
    console.log(`[ClientWebSocketCommands] Sent command: ${command} for device: ${deviceId}`)
  } catch (error) {
    console.error(`[ClientWebSocketCommands] Failed to send command ${command}:`, error)
  }
}

/**
 * Sends a connection state change command to server
 */
export function sendConnectionChangedCommand(deviceId: string, isConnected: boolean) {
  sendDeviceCommand(deviceId, 'connection_changed', { isConnected })
}

/**
 * Sends a pairing state change command to server
 */
export function sendPairingChangedCommand(deviceId: string, isPaired: boolean) {
  sendDeviceCommand(deviceId, 'pairing_changed', { isPaired })
}

/**
 * Sends an enter pairing mode command to server
 */
export function sendEnterPairingModeCommand(deviceId: string) {
  sendDeviceCommand(deviceId, 'enter_pairing_mode', {})
}

/**
 * Sends an exit pairing mode command to server
 */
export function sendExitPairingModeCommand(deviceId: string) {
  sendDeviceCommand(deviceId, 'exit_pairing_mode', {})
}

/**
 * Sends a device lock/unlock command to server
 */
export function sendSetLockedCommand(deviceId: string, isLocked: boolean) {
  sendDeviceCommand(deviceId, 'set_locked', { isLocked })
}

/**
 * Sends a device reset command to server
 */
export function sendResetDeviceCommand(
  deviceId: string,
  resetType: 'connection' | 'full' = 'full',
) {
  sendDeviceCommand(deviceId, 'reset_device', { resetType })
}

/**
 * Sends a configuration update command to server
 */
export function sendUpdateConfigCommand(deviceId: string, config: any) {
  sendDeviceCommand(deviceId, 'update_config', { config })
}

/**
 * Sends a client state sync command to server
 */
export function sendSyncClientStateCommand(deviceId: string, clientState: any) {
  sendDeviceCommand(deviceId, 'sync_client_state', { clientState })
}

/**
 * Requests wallet addresses to be derived on-demand by server
 */
export function sendDeriveAddressesCommand(
  deviceId: string,
  params: {
    coinType: 'ETH' | 'BTC' | 'SOL'
    accountIndex?: number
    walletType?: 'internal' | 'external'
    addressType?: 'segwit' | 'legacy' | 'wrapped-segwit'
    startIndex?: number
    count?: number
  },
) {
  sendDeviceCommand(deviceId, 'derive_addresses', params)
}

/**
 * Sends an approve signing request command to server
 */
export function sendApproveSigningRequestCommand(deviceId: string, requestId: string) {
  sendDeviceCommand(deviceId, 'approve_signing_request', { requestId })
}

/**
 * Sends a reject signing request command to server
 */
export function sendRejectSigningRequestCommand(
  deviceId: string,
  requestId: string,
  reason?: string,
) {
  sendDeviceCommand(deviceId, 'reject_signing_request', { requestId, reason })
}

/**
 * Sends wallet accounts sync command to server
 */
export function sendSyncWalletAccountsCommand(
  deviceId: string,
  walletAccounts: any[],
  mnemonic?: string | null,
) {
  const payload: Record<string, any> = { walletAccounts }
  const sanitizedMnemonic =
    typeof mnemonic === 'string' && mnemonic.trim().length > 0 ? mnemonic.trim() : null

  if (sanitizedMnemonic) {
    payload.mnemonic = sanitizedMnemonic
  }

  sendDeviceCommand(deviceId, 'sync_wallet_accounts', payload)
}
