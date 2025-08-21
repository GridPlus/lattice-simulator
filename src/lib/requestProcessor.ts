/**
 * Request Processing Engine for Lattice1 Device Simulator
 * Manages request queuing, processing, and user interaction
 */

import { useDeviceStore } from '../store'
import {
  PendingRequest,
  LatticeSecureEncryptedRequestType,
  LatticeResponseCode,
  DeviceResponse,
} from '../types'
import { generateRequestId, getRequestTypeName, simulateDelay } from '../utils'
import { LatticeSimulator } from './simulator'
import { ProtocolHandler } from './protocolHandler'

export interface RequestProcessorConfig {
  autoApproveRequests: boolean
  userApprovalTimeoutMs: number
  enableUserInteraction: boolean
}

export class RequestProcessor {
  private simulator: LatticeSimulator
  private handler: ProtocolHandler
  private config: RequestProcessorConfig
  private processingQueue: Map<string, Promise<any>> = new Map()

  constructor(
    simulator: LatticeSimulator,
    handler: ProtocolHandler,
    config: RequestProcessorConfig
  ) {
    this.simulator = simulator
    this.handler = handler
    this.config = config
  }

  /**
   * Process a new request with user interaction handling
   */
  async processRequest<T>(
    type: LatticeSecureEncryptedRequestType,
    data: any,
    requiresApproval: boolean = true
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
      // Add to store for UI visibility
      if (requiresApproval && this.config.enableUserInteraction) {
        useDeviceStore.getState().addPendingRequest(request)
      }

      // Check if auto-approval is enabled
      if (this.config.autoApproveRequests || !requiresApproval) {
        return await this.executeRequest(type, data)
      }

      // Wait for user approval
      const approved = await this.waitForUserApproval(requestId)
      
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
      useDeviceStore.getState().removePendingRequest(requestId)
      this.processingQueue.delete(requestId)
    }
  }

  /**
   * Execute a request without user interaction
   */
  private async executeRequest<T>(
    type: LatticeSecureEncryptedRequestType,
    data: any
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
   * Wait for user approval with timeout
   */
  private async waitForUserApproval(requestId: string): Promise<boolean> {
    return new Promise((resolve) => {
      const timeoutId = setTimeout(() => {
        resolve(false) // Timeout - user didn't respond
      }, this.config.userApprovalTimeoutMs)

      // Set up subscription to store changes
      const unsubscribe = useDeviceStore.subscribe(
        (state) => state.pendingRequests,
        (pendingRequests) => {
          const request = pendingRequests.find(req => req.id === requestId)
          if (!request) {
            // Request was removed (approved or declined)
            clearTimeout(timeoutId)
            unsubscribe()
            
            // Check if it was approved by looking at current request
            const currentRequest = useDeviceStore.getState().currentRequest
            const wasApproved = !currentRequest || currentRequest.id !== requestId
            resolve(wasApproved)
          }
        }
      )
    })
  }

  /**
   * Approve the current pending request
   */
  approveCurrentRequest(): boolean {
    const state = useDeviceStore.getState()
    if (state.currentRequest) {
      state.approveCurrentRequest()
      return true
    }
    return false
  }

  /**
   * Decline the current pending request
   */
  declineCurrentRequest(): boolean {
    const state = useDeviceStore.getState()
    if (state.currentRequest) {
      state.declineCurrentRequest()
      return true
    }
    return false
  }

  /**
   * Get pending requests
   */
  getPendingRequests(): PendingRequest[] {
    return useDeviceStore.getState().pendingRequests
  }

  /**
   * Get current request requiring approval
   */
  getCurrentRequest(): PendingRequest | undefined {
    return useDeviceStore.getState().currentRequest
  }

  /**
   * Update processor configuration
   */
  updateConfig(config: Partial<RequestProcessorConfig>): void {
    Object.assign(this.config, config)
  }

  /**
   * Clear all pending requests
   */
  clearPendingRequests(): void {
    const state = useDeviceStore.getState()
    const requests = [...state.pendingRequests]
    
    for (const request of requests) {
      state.removePendingRequest(request.id)
    }
  }
}

/**
 * Factory function to create a request processor
 */
export function createRequestProcessor(
  simulator: LatticeSimulator,
  config?: Partial<RequestProcessorConfig>
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
 * Request type classification for approval requirements
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
 * Get user-friendly description for request types
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
