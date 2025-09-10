/**
 * Request Processing Engine for Lattice1 Device Simulator
 * Manages request queuing, processing, and user interaction
 */

import { ProtocolHandler } from './serverProtocolHandler'
import {
  LatticeSecureEncryptedRequestType,
  LatticeResponseCode,
  type PendingRequest,
  type DeviceResponse,
} from '../shared/types'
import { generateRequestId, getRequestTypeName } from '../shared/utils'
import type { ServerLatticeSimulator } from './serverSimulator'

/**
 * Configuration options for the request processor
 */
export interface RequestProcessorConfig {
  /** Whether to automatically approve all requests without user interaction */
  autoApproveRequests: boolean
  /** Maximum time to wait for user approval in milliseconds */
  userApprovalTimeoutMs: number
  /** Whether user interaction is enabled */
  enableUserInteraction: boolean
}

/**
 * Request Processing Engine for Lattice1 Device Simulator
 *
 * Manages request queuing, processing, and user interaction flows.
 * Coordinates between the protocol handler and user approval systems
 * to simulate realistic device behavior.
 *
 * @example
 * ```typescript
 * const processor = new RequestProcessor(simulator, handler, {
 *   autoApproveRequests: false,
 *   userApprovalTimeoutMs: 300000,
 *   enableUserInteraction: true
 * });
 *
 * const response = await processor.processRequest(
 *   LatticeSecureEncryptedRequestType.sign,
 *   signRequest,
 *   true
 * );
 * ```
 */
export class RequestProcessor {
  /** Reference to the device simulator */
  private simulator: ServerLatticeSimulator

  /** Reference to the protocol handler */
  private handler: ProtocolHandler

  /** Processor configuration */
  private config: RequestProcessorConfig

  /** Map of currently processing requests */
  private processingQueue: Map<string, Promise<any>> = new Map()

  /**
   * Creates a new RequestProcessor instance
   *
   * @param simulator - The device simulator to process requests for
   * @param handler - The protocol handler for request processing
   * @param config - Configuration for request processing behavior
   */
  constructor(
    simulator: ServerLatticeSimulator,
    handler: ProtocolHandler,
    config: RequestProcessorConfig,
  ) {
    this.simulator = simulator
    this.handler = handler
    this.config = config
  }

  /**
   * Processes a new request with user interaction handling
   *
   * Manages the complete request lifecycle including queueing,
   * user approval, and execution. Handles timeouts and errors.
   *
   * @param type - The type of request to process
   * @param data - The request data
   * @param requiresApproval - Whether user approval is required
   * @returns Promise resolving to device response
   * @template T - The expected response data type
   */
  async processRequest<T>(
    type: LatticeSecureEncryptedRequestType,
    data: any,
    requiresApproval: boolean = true,
  ): Promise<DeviceResponse<T>> {
    const requestId = generateRequestId()
    const request: PendingRequest = {
      id: requestId,
      type: getRequestTypeName(type),
      data,
      timestamp: Date.now(),
      timeoutMs: this.config.userApprovalTimeoutMs,
    }

    try {
      // TODO: Emit request event to client for UI visibility
      // Server should not directly modify client state
      if (requiresApproval && this.config.enableUserInteraction) {
        // Will be handled by WebSocket events in future refactor
        console.log('[RequestProcessor] Request requires approval:', request)
      }

      // Check if auto-approval is enabled
      if (this.config.autoApproveRequests || !requiresApproval) {
        return await this.executeRequest(type, data)
      }

      // Wait for user approval
      const approved = await this.waitForUserApproval()

      if (!approved) {
        return {
          success: false,
          code: LatticeResponseCode.userDeclined,
          error: 'User declined the request',
        }
      }

      // Execute the approved request
      return await this.executeRequest(type, data)
    } catch (error) {
      console.error('[RequestProcessor] Error processing request:', error)
      return {
        success: false,
        code: LatticeResponseCode.internalError,
        error: error instanceof Error ? error.message : 'Unknown error',
      }
    } finally {
      // Clean up
      this.processingQueue.delete(requestId)
    }
  }

  /**
   * Executes a request without user interaction
   *
   * Directly processes the request through the protocol handler
   * without any approval flows.
   *
   * @param type - The type of request to execute
   * @param data - The request data
   * @returns Promise resolving to device response
   * @template T - The expected response data type
   * @private
   */
  private async executeRequest<T>(
    type: LatticeSecureEncryptedRequestType,
    data: any,
  ): Promise<DeviceResponse<T>> {
    const secureRequest = {
      type,
      data: Buffer.isBuffer(data) ? data : Buffer.from(JSON.stringify(data)),
    }

    const response = await this.handler.handleSecureRequest(secureRequest)

    return {
      success: response.code === LatticeResponseCode.success,
      code: response.code,
      data: response.data as T,
      error: response.error,
    }
  }

  /**
   * Waits for user approval with timeout
   *
   * Monitors the store for request approval or timeout.
   * Uses Zustand subscription to detect state changes.
   *
   * @param requestId - ID of the request awaiting approval
   * @returns Promise resolving to approval status
   * @private
   */
  private async waitForUserApproval(): Promise<boolean> {
    // TODO: Implement server-side user approval waiting
    // This should listen for WebSocket messages from client, not access client store
    return new Promise(resolve => {
      const timeoutId = setTimeout(() => {
        resolve(false) // Timeout - user didn't respond
      }, this.config.userApprovalTimeoutMs)

      // For now, auto-approve to avoid blocking
      // Real implementation should await WebSocket approval messages
      clearTimeout(timeoutId)
      resolve(true)
    })
  }

  /**
   * Approves the current pending request
   *
   * Removes the current request from the queue and marks it approved.
   *
   * @returns True if a request was approved, false if none pending
   */
  approveCurrentRequest(): boolean {
    // TODO: Implement server-side request approval
    // Should handle WebSocket approval messages, not access client store
    console.log('[RequestProcessor] Request approved')
    return true
  }

  /**
   * Declines the current pending request
   *
   * Removes the current request from the queue and marks it declined.
   *
   * @returns True if a request was declined, false if none pending
   */
  declineCurrentRequest(): boolean {
    // TODO: Implement server-side request decline
    // Should handle WebSocket decline messages, not access client store
    console.log('[RequestProcessor] Request declined')
    return true
  }

  /**
   * Gets all pending requests
   *
   * @returns Array of requests awaiting user approval
   */
  getPendingRequests(): PendingRequest[] {
    // TODO: Return server-side pending requests
    // Should maintain its own request queue, not access client store
    return []
  }

  /**
   * Gets the current request requiring approval
   *
   * @returns The request currently awaiting approval, or undefined
   */
  getCurrentRequest(): PendingRequest | undefined {
    // TODO: Return server-side current request
    // Should maintain its own current request, not access client store
    return undefined
  }

  /**
   * Updates processor configuration
   *
   * @param config - Partial configuration to merge with existing settings
   */
  updateConfig(config: Partial<RequestProcessorConfig>): void {
    Object.assign(this.config, config)
  }

  /**
   * Clears all pending requests
   *
   * Removes all requests from the approval queue.
   */
  clearPendingRequests(): void {
    // TODO: Clear server-side pending requests
    // Should clear its own request queue, not access client store
    console.log('[RequestProcessor] Pending requests cleared')
  }
}

/**
 * Creates a request processor with default configuration
 *
 * Factory function that creates a RequestProcessor instance with
 * sensible defaults and optional configuration overrides.
 *
 * @param simulator - The device simulator instance
 * @param config - Optional configuration overrides
 * @returns Configured RequestProcessor instance
 */
export function createRequestProcessor(
  simulator: ServerLatticeSimulator,
  config?: Partial<RequestProcessorConfig>,
): RequestProcessor {
  const defaultConfig: RequestProcessorConfig = {
    autoApproveRequests: false,
    userApprovalTimeoutMs: 300000, // 5 minutes
    enableUserInteraction: true,
  }

  const handler = new ProtocolHandler(simulator)
  const finalConfig = { ...defaultConfig, ...config }

  return new RequestProcessor(simulator, handler, finalConfig)
}

/**
 * Determines if a request type requires user approval
 *
 * Classifies request types based on their security implications
 * and whether they should require explicit user consent.
 *
 * @param type - The request type to check
 * @returns True if the request requires user approval
 */
export function requiresUserApproval(type: LatticeSecureEncryptedRequestType): boolean {
  switch (type) {
    case LatticeSecureEncryptedRequestType.finalizePairing:
    case LatticeSecureEncryptedRequestType.sign:
    case LatticeSecureEncryptedRequestType.addKvRecords:
    case LatticeSecureEncryptedRequestType.removeKvRecords:
      return true

    case LatticeSecureEncryptedRequestType.getAddresses:
    case LatticeSecureEncryptedRequestType.getWallets:
    case LatticeSecureEncryptedRequestType.getKvRecords:
    case LatticeSecureEncryptedRequestType.fetchEncryptedData:
    case LatticeSecureEncryptedRequestType.test:
      return false

    default:
      return true // Default to requiring approval for unknown types
  }
}

/**
 * Gets user-friendly description for request types
 *
 * Provides human-readable descriptions of request types for
 * display in user interfaces.
 *
 * @param type - The request type
 * @param data - Optional request data for context
 * @returns Human-readable description of the request
 */
export function getRequestDescription(type: LatticeSecureEncryptedRequestType, data?: any): string {
  switch (type) {
    case LatticeSecureEncryptedRequestType.finalizePairing:
      return 'Pair this application with your Lattice device'

    case LatticeSecureEncryptedRequestType.getAddresses:
      return `Get ${data?.n || 1} address(es) from your wallet`

    case LatticeSecureEncryptedRequestType.sign:
      return 'Sign transaction or message'

    case LatticeSecureEncryptedRequestType.getWallets:
      return 'Get active wallet information'

    case LatticeSecureEncryptedRequestType.getKvRecords:
      return 'Get stored address tags'

    case LatticeSecureEncryptedRequestType.addKvRecords:
      return 'Add new address tags'

    case LatticeSecureEncryptedRequestType.removeKvRecords:
      return 'Remove address tags'

    case LatticeSecureEncryptedRequestType.fetchEncryptedData:
      return 'Fetch encrypted data from device'

    case LatticeSecureEncryptedRequestType.test:
      return 'Test device connection'

    default:
      return 'Unknown request'
  }
}
