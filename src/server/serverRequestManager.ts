/**
 * Request Manager for handling pending server-side requests that need client responses
 *
 * This manages the correlation between server protocol requests and client-side events,
 * allowing the server to wait for client data (like KV records) before responding.
 */

import { v4 as uuidv4 } from 'uuid'

export interface PendingRequest {
  requestId: string
  deviceId: string
  type: string
  payload: any
  resolve: (data: any) => void
  reject: (error: Error) => void
  timeout: NodeJS.Timeout
  createdAt: number
}

export interface ClientRequest {
  requestId: string
  type: string
  deviceId: string
  payload: any
}

export interface ClientResponse {
  requestId: string
  type: string
  data?: any
  error?: string
}

class RequestManager {
  private pendingRequests = new Map<string, PendingRequest>()
  private defaultTimeoutMs = 30000 // 30 seconds

  /**
   * Create a new pending request and wait for client response
   */
  async createRequest<T>(
    deviceId: string,
    type: string,
    payload: any,
    timeoutMs: number = this.defaultTimeoutMs,
  ): Promise<T> {
    // Prevent heartbeat types from being used as server requests
    if (type === 'heartbeat' || type === 'heartbeat_response') {
      throw new Error(
        `Invalid request type: ${type}. Heartbeat messages should not use RequestManager.`,
      )
    }

    const requestId = uuidv4()

    return new Promise<T>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(requestId)
        reject(new Error(`Request timeout after ${timeoutMs}ms: ${type}`))
      }, timeoutMs)

      const pendingRequest: PendingRequest = {
        requestId,
        deviceId,
        type,
        payload,
        resolve: (data: T) => {
          clearTimeout(timeout)
          this.pendingRequests.delete(requestId)
          resolve(data)
        },
        reject: (error: Error) => {
          clearTimeout(timeout)
          this.pendingRequests.delete(requestId)
          reject(error)
        },
        timeout,
        createdAt: Date.now(),
      }

      this.pendingRequests.set(requestId, pendingRequest)

      console.log(
        `[RequestManager] Created request: ${requestId} (${type}) for device: ${deviceId}`,
      )

      // Send request that client can receive via WebSocket
      this.notifyNewRequest(pendingRequest)
    })
  }

  /**
   * Handle client response to a pending request
   */
  handleClientResponse(response: ClientResponse): boolean {
    // Validate request ID format (should be UUID)
    if (!response.requestId || typeof response.requestId !== 'string') {
      console.warn('[RequestManager] Invalid requestId:', response.requestId)
      return false
    }

    // Filter out heartbeat types that shouldn't be here
    if (response.type === 'heartbeat' || response.type === 'heartbeat_response') {
      console.warn('[RequestManager] Heartbeat message incorrectly sent to handleClientResponse')
      return false
    }

    const pendingRequest = this.pendingRequests.get(response.requestId)

    if (!pendingRequest) {
      console.warn(`[RequestManager] No pending request found for: ${response.requestId}`)
      return false
    }

    // Additional validation: ensure request types match
    if (pendingRequest.type !== response.type) {
      console.warn(
        `[RequestManager] Request type mismatch. Expected: ${pendingRequest.type}, Got: ${response.type}`,
      )
      return false
    }

    console.log(`[RequestManager] Handling response for: ${response.requestId}`)

    if (response.error) {
      pendingRequest.reject(new Error(response.error))
    } else {
      pendingRequest.resolve(response.data)
    }

    return true
  }

  /**
   * Get all pending requests for a device (for debugging)
   */
  getPendingRequestsForDevice(deviceId: string): PendingRequest[] {
    return Array.from(this.pendingRequests.values()).filter(req => req.deviceId === deviceId)
  }

  /**
   * Get all active request IDs
   */
  getActiveRequestIds(): string[] {
    return Array.from(this.pendingRequests.keys())
  }

  /**
   * Cancel a pending request
   */
  cancelRequest(requestId: string): boolean {
    const pendingRequest = this.pendingRequests.get(requestId)

    if (!pendingRequest) {
      return false
    }

    clearTimeout(pendingRequest.timeout)
    this.pendingRequests.delete(requestId)
    pendingRequest.reject(new Error('Request cancelled'))

    console.log(`[RequestManager] Cancelled request: ${requestId}`)
    return true
  }

  /**
   * Cancel all pending requests for a device
   */
  cancelRequestsForDevice(deviceId: string): number {
    let cancelled = 0

    const entries = Array.from(this.pendingRequests.entries())
    for (const [requestId, request] of entries) {
      if (request.deviceId === deviceId) {
        this.cancelRequest(requestId)
        cancelled++
      }
    }

    console.log(`[RequestManager] Cancelled ${cancelled} requests for device: ${deviceId}`)
    return cancelled
  }

  /**
   * Clean up expired requests (called periodically)
   */
  cleanup(): number {
    let cleaned = 0
    const now = Date.now()
    const maxAge = this.defaultTimeoutMs * 2 // Double timeout as max age

    const entries = Array.from(this.pendingRequests.entries())
    for (const [requestId, request] of entries) {
      if (now - request.createdAt > maxAge) {
        this.cancelRequest(requestId)
        cleaned++
      }
    }

    if (cleaned > 0) {
      console.log(`[RequestManager] Cleaned up ${cleaned} expired requests`)
    }

    return cleaned
  }

  /**
   * Notify about new request - this will be sent via WebSocket
   * to connected clients
   */
  private async notifyNewRequest(request: PendingRequest) {
    try {
      // Import here to avoid circular dependencies
      const { wsManager } = await import('./serverWebSocketManager')

      // Send server request via WebSocket
      wsManager.sendServerRequest(
        request.deviceId,
        request.requestId,
        request.type,
        request.payload,
      )

      console.log(`[RequestManager] Sent server_request via WebSocket for: ${request.requestId}`)
    } catch (error) {
      console.error('[RequestManager] Error notifying about new request:', error)
    }
  }
}

// Create singleton instance
const globalForRequestManager = globalThis as unknown as {
  requestManager: RequestManager | undefined
}

export const requestManager =
  globalForRequestManager.requestManager ??
  (globalForRequestManager.requestManager = new RequestManager())

// Helper functions for common request types
export const requestKvRecords = async (
  deviceId: string,
  params: { type: number; n: number; start: number },
): Promise<{ records: any[]; total: number; fetched: number }> => {
  return requestManager.createRequest(deviceId, 'get_kv_records', params)
}

export const requestAddKvRecords = async (
  deviceId: string,
  records: Record<string, string>,
): Promise<{ success: boolean; error?: string }> => {
  return requestManager.createRequest(deviceId, 'add_kv_records', { records })
}

export const requestRemoveKvRecords = async (
  deviceId: string,
  params: { type: number; ids: number[] },
): Promise<{ success: boolean; error?: string }> => {
  return requestManager.createRequest(deviceId, 'remove_kv_records', params)
}

// Periodic cleanup
setInterval(() => {
  requestManager.cleanup()
}, 60000) // Run cleanup every minute
