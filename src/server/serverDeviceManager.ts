/**
 * SERVER-SIDE ONLY Device Manager for Lattice1 Device Simulator
 *
 * ⚠️  SERVER-SIDE ONLY: This class runs on the Node.js server and should never be imported by client code.
 *
 * Central orchestrator for device instances and user interactions
 */

import { ServerLatticeSimulator } from './serverSimulator'

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
  private simulator: ServerLatticeSimulator

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
      simulatedFirmwareVersion: [0, 15, 0],
      autoApproveRequests: true,
      userApprovalTimeoutMs: 60000,
    }

    this.simulator = new ServerLatticeSimulator({
      deviceId,
      firmwareVersion: defaultConfig.simulatedFirmwareVersion as [number, number, number],
      autoApprove: defaultConfig.autoApproveRequests,
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

    // Restore paired state
    if (clientState.isPaired) {
      this.simulator.setIsPaired(true)
      console.log('[DeviceManager] Restored isPaired to true from client state')
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
  }

  /**
   * Gets the internal simulator instance
   *
   * @returns The LatticeSimulator instance
   */
  getSimulator(): ServerLatticeSimulator {
    return this.simulator
  }
}
