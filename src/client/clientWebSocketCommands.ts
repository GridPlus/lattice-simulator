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
        data
      }
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
export function sendResetDeviceCommand(deviceId: string, resetType: 'connection' | 'full' = 'full') {
  sendDeviceCommand(deviceId, 'reset_device', { resetType })
}

/**
 * Sends a configuration update command to server
 */
export function sendUpdateConfigCommand(deviceId: string, config: any) {
  sendDeviceCommand(deviceId, 'update_config', { config })
}