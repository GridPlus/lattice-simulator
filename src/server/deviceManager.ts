/**
 * SERVER-SIDE ONLY Device Manager for Lattice1 Device Simulator
 *
 * ⚠️  SERVER-SIDE ONLY: This class runs on the Node.js server and should never be imported by client code.
 *
 * Central orchestrator for device instances and user interactions
 */

import { DeviceSimulator } from './deviceSimulator'
import { getEnvironmentConfig } from '../core/walletConfig'

const envConfig = getEnvironmentConfig()
const AUTO_APPROVE_DEFAULT = envConfig.autoApprove

// Parse firmware version from env var or use default [0, 18, 0]
const parseFirmwareVersion = (): [number, number, number] => {
  const envVersion = process.env.LATTICE_FIRMWARE_VERSION
  if (envVersion) {
    const parts = envVersion.split('.').map(Number)
    if (parts.length === 3 && parts.every(n => !isNaN(n))) {
      return [parts[0], parts[1], parts[2]]
    }
  }
  return [0, 18, 0]
}

const FIRMWARE_VERSION_DEFAULT = parseFirmwareVersion()

/**
 * Device Manager for Lattice1 Device Simulator
 *
 * Central orchestrator for device instances and user interactions.
 * Provides a high-level API for device operations and coordinates
 * between the simulator, request processor, and state management.
 *
 * @example
 * ```typescript
 * const manager = new DeviceManager('test-device-001');
 *
 * await manager.connect();
 * await manager.pair('secret123');
 *
 * // Use the simulator directly for device operations
 * ```
 */
export class DeviceManager {
  /** The core device simulator instance */
  private simulator: DeviceSimulator

  /**
   * Creates a new DeviceManager instance
   *
   * Initializes the simulator and request processor with configuration
   * from the global store.
   *
   * @param deviceId - Optional device ID (generates random if not provided)
   */
  constructor(deviceId?: string) {
    // Initialize simulator with default config (no client store dependency)
    const defaultConfig = {
      simulatedFirmwareVersion: FIRMWARE_VERSION_DEFAULT,
      autoApproveRequests: AUTO_APPROVE_DEFAULT,
      userApprovalTimeoutMs: 60000,
    }

    // For CI/test environments: if PAIRING_SECRET is set, use it to start already paired
    const expectedPairingCode = process.env.PAIRING_SECRET

    this.simulator = new DeviceSimulator({
      deviceId,
      firmwareVersion: defaultConfig.simulatedFirmwareVersion,
      autoApprove: defaultConfig.autoApproveRequests,
      expectedPairingCode,
    })

    // Note: Server-side state restoration is handled via /api/sync-client-state
    // The client-side localStorage is the source of truth, not the server-side store
    console.log(
      '[DeviceManager] Server-side DeviceManager initialized, waiting for client state sync',
    )
  }

  /**
   * Reset the device to initial state
   */
  reset(): void {
    this.simulator.reset()
  }

  /**
   * Restore simulator state from client state
   *
   * This method is called by the /api/sync-client-state endpoint to restore
   * the server-side simulator state from the client's localStorage (source of truth).
   *
   * @param clientState - State from client's localStorage
   */
  public restoreFromClientState(clientState: any): void {
    console.log('[DeviceManager] Restoring simulator state from client state:', {
      isPaired: clientState.isPaired,
      kvRecordsCount: Object.keys(clientState.kvRecords || {}).length,
    })

    if (clientState.isPaired) {
      console.log(
        '[DeviceManager] Ignoring client isPaired flag; pairing is tracked per client session',
      )
    }

    // Restore device info
    if (clientState.deviceInfo) {
      this.simulator.setDeviceInfo(clientState.deviceInfo)
      console.log('[DeviceManager] Restored device info from client state')
    }

    // Restore active wallets
    if (clientState.activeWallets) {
      this.simulator.setActiveWallets(clientState.activeWallets)
      console.log('[DeviceManager] Restored active wallets from client state')
    }

    // Restore KV records
    if (clientState.kvRecords && Object.keys(clientState.kvRecords).length > 0) {
      this.simulator.setKvRecordsDirectly(clientState.kvRecords)
      console.log(
        '[DeviceManager] Restored KV records from client state:',
        Object.keys(clientState.kvRecords),
      )
    }

    // Restore seed loaded state
    if (clientState.hasLoadedSeed !== undefined) {
      this.simulator.setHasLoadedSeed(clientState.hasLoadedSeed)
      console.log(
        '[DeviceManager] Restored hasLoadedSeed from client state:',
        clientState.hasLoadedSeed,
      )
    }
  }

  /**
   * Gets the internal simulator instance
   *
   * @returns The LatticeSimulator instance
   */
  getSimulator(): DeviceSimulator {
    return this.simulator
  }
}
