'use client'

/**
 * Pending Requests Page
 *
 * Displays all pending signing requests awaiting user approval.
 * Users can view request details and approve/reject transactions.
 */

import { Clock, AlertCircle, CheckCircle, XCircle, Eye } from 'lucide-react'
import React, { useState } from 'react'
import { MainLayout } from '@/client/components/layout'
import { useDeviceStore } from '@/client/store/clientDeviceStore'
import type { SigningRequest } from '@/shared/types/device'

export default function PendingRequestsPage() {
  const pendingRequests = useDeviceStore((state: any) => state.getPendingSigningRequests?.() || [])
  const approveSigningRequest = useDeviceStore((state: any) => state.approveSigningRequest)
  const rejectSigningRequest = useDeviceStore((state: any) => state.rejectSigningRequest)

  const [selectedRequest, setSelectedRequest] = useState<SigningRequest | null>(null)
  const [isModalOpen, setIsModalOpen] = useState(false)

  const formatTimeAgo = (timestamp: number) => {
    const now = Date.now()
    const diff = now - timestamp
    const minutes = Math.floor(diff / 60000)
    const hours = Math.floor(diff / 3600000)

    if (minutes < 1) return 'Just now'
    if (minutes < 60) return `${minutes}m ago`
    if (hours < 24) return `${hours}h ago`
    return new Date(timestamp).toLocaleDateString()
  }

  const getTimeoutProgress = (request: SigningRequest) => {
    const elapsed = Date.now() - request.timestamp
    const progress = (elapsed / request.timeoutMs) * 100
    return Math.min(progress, 100)
  }

  const getCoinTypeColor = (coinType: string) => {
    switch (coinType) {
      case 'ETH':
        return 'bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-400'
      case 'BTC':
        return 'bg-orange-100 text-orange-800 dark:bg-orange-900/20 dark:text-orange-400'
      case 'SOL':
        return 'bg-purple-100 text-purple-800 dark:bg-purple-900/20 dark:text-purple-400'
      default:
        return 'bg-gray-100 text-gray-800 dark:bg-gray-900/20 dark:text-gray-400'
    }
  }

  const handleApprove = (requestId: string) => {
    console.log(`Approving request: ${requestId}`)
    approveSigningRequest(requestId)
  }

  const handleReject = (requestId: string) => {
    rejectSigningRequest(requestId, 'User rejected transaction')
  }

  const openRequestDetails = (request: SigningRequest) => {
    setSelectedRequest(request)
    setIsModalOpen(true)
  }

  return (
    <MainLayout>
      <div>
        <div className="mb-6">
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100 flex items-center">
            <Clock className="mr-3 h-6 w-6" />
            Pending Requests
          </h1>
          <p className="text-gray-600 dark:text-gray-400 mt-1">
            Review and approve signing requests from connected applications
          </p>
        </div>

        {/* Stats Bar */}
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4 mb-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <div className="flex items-center">
                <AlertCircle className="h-5 w-5 text-yellow-500 mr-2" />
                <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                  {pendingRequests.length} Pending
                </span>
              </div>
            </div>
            <div className="text-xs text-gray-500 dark:text-gray-400">Auto-refresh enabled</div>
          </div>
        </div>

        {/* Request List */}
        {pendingRequests.length === 0 ? (
          <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-8 text-center">
            <Clock className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-2">
              No Pending Requests
            </h3>
            <p className="text-gray-600 dark:text-gray-400">
              When applications send signing requests, they will appear here for your approval.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {pendingRequests.map((request: SigningRequest) => {
              const timeoutProgress = getTimeoutProgress(request)
              const isNearTimeout = timeoutProgress > 80

              return (
                <div
                  key={request.id}
                  className={`bg-white dark:bg-gray-800 rounded-lg border-2 transition-all ${
                    isNearTimeout
                      ? 'border-red-200 dark:border-red-800'
                      : 'border-gray-200 dark:border-gray-700'
                  }`}
                >
                  <div className="p-6">
                    {/* Header */}
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center space-x-3">
                        <span
                          className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getCoinTypeColor(request.data.coinType)}`}
                        >
                          {request.data.coinType}
                        </span>
                        <span className="text-sm text-gray-500 dark:text-gray-400">
                          {request.data.transactionType === 'transaction'
                            ? 'Transaction'
                            : 'Message'}{' '}
                          Signing
                        </span>
                      </div>
                      <div className="text-sm text-gray-500 dark:text-gray-400">
                        {formatTimeAgo(request.timestamp)}
                      </div>
                    </div>

                    {/* Details */}
                    <div className="mb-4">
                      <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-2">
                        {request.metadata?.description || 'Signing Request'}
                      </h3>

                      {request.metadata && (
                        <div className="grid grid-cols-2 gap-4 text-sm">
                          {request.metadata.from && (
                            <div>
                              <span className="text-gray-500 dark:text-gray-400">From:</span>
                              <div className="font-mono text-xs bg-gray-100 dark:bg-gray-700 rounded px-2 py-1 mt-1">
                                {request.metadata.from}
                              </div>
                            </div>
                          )}
                          {request.metadata.to && (
                            <div>
                              <span className="text-gray-500 dark:text-gray-400">To:</span>
                              <div className="font-mono text-xs bg-gray-100 dark:bg-gray-700 rounded px-2 py-1 mt-1">
                                {request.metadata.to}
                              </div>
                            </div>
                          )}
                          {request.metadata.value && (
                            <div>
                              <span className="text-gray-500 dark:text-gray-400">Value:</span>
                              <div className="font-medium mt-1">
                                {request.metadata.value}{' '}
                                {request.metadata.tokenSymbol || request.data.coinType}
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Timeout Progress */}
                    <div className="mb-4">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm text-gray-500 dark:text-gray-400">
                          Request timeout
                        </span>
                        <span
                          className={`text-sm font-medium ${isNearTimeout ? 'text-red-600' : 'text-gray-600'}`}
                        >
                          {Math.round(timeoutProgress)}%
                        </span>
                      </div>
                      <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                        <div
                          className={`h-2 rounded-full transition-all ${
                            isNearTimeout ? 'bg-red-500' : 'bg-blue-500'
                          }`}
                          style={{ width: `${timeoutProgress}%` }}
                        />
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center justify-between">
                      <button
                        onClick={() => openRequestDetails(request)}
                        className="inline-flex items-center px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm font-medium text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors"
                      >
                        <Eye className="h-4 w-4 mr-2" />
                        View Details
                      </button>

                      <div className="flex space-x-3">
                        <button
                          onClick={() => handleReject(request.id)}
                          className="inline-flex items-center px-4 py-2 border border-red-300 rounded-md text-sm font-medium text-red-700 bg-red-50 hover:bg-red-100 dark:bg-red-900/20 dark:text-red-400 dark:border-red-800 dark:hover:bg-red-900/30 transition-colors"
                        >
                          <XCircle className="h-4 w-4 mr-2" />
                          Reject
                        </button>
                        <button
                          onClick={() => handleApprove(request.id)}
                          className="inline-flex items-center px-4 py-2 border border-green-300 rounded-md text-sm font-medium text-green-700 bg-green-50 hover:bg-green-100 dark:bg-green-900/20 dark:text-green-400 dark:border-green-800 dark:hover:bg-green-900/30 transition-colors"
                        >
                          <CheckCircle className="h-4 w-4 mr-2" />
                          Approve
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* Simple Modal for Request Details (will be enhanced in next step) */}
        {isModalOpen && selectedRequest && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
            <div className="bg-white dark:bg-gray-800 rounded-lg max-w-2xl w-full max-h-[80vh] overflow-y-auto">
              <div className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
                    Request Details
                  </h2>
                  <button
                    onClick={() => setIsModalOpen(false)}
                    className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                  >
                    <XCircle className="h-6 w-6" />
                  </button>
                </div>

                <div className="space-y-4">
                  <div>
                    <label className="text-sm font-medium text-gray-500 dark:text-gray-400">
                      Request ID
                    </label>
                    <div className="font-mono text-xs bg-gray-100 dark:bg-gray-700 rounded px-3 py-2 mt-1">
                      {selectedRequest.id}
                    </div>
                  </div>

                  <div>
                    <label className="text-sm font-medium text-gray-500 dark:text-gray-400">
                      Description
                    </label>
                    <div className="mt-1">{selectedRequest.metadata?.description}</div>
                  </div>

                  <div>
                    <label className="text-sm font-medium text-gray-500 dark:text-gray-400">
                      Raw Data
                    </label>
                    <div className="font-mono text-xs bg-gray-100 dark:bg-gray-700 rounded px-3 py-2 mt-1 max-h-32 overflow-y-auto break-all">
                      {(() => {
                        // Handle different data formats
                        if (Buffer.isBuffer(selectedRequest.data.data)) {
                          return selectedRequest.data.data.toString('hex')
                        } else if (
                          selectedRequest.data.data &&
                          typeof selectedRequest.data.data === 'object' &&
                          (selectedRequest.data.data as any).type === 'Buffer'
                        ) {
                          // Handle serialized Buffer format from JSON
                          return Buffer.from((selectedRequest.data.data as any).data).toString(
                            'hex',
                          )
                        } else if (Array.isArray(selectedRequest.data.data)) {
                          // Handle array format
                          return Buffer.from(selectedRequest.data.data).toString('hex')
                        } else {
                          // Fallback: try to convert to Buffer
                          return Buffer.from(selectedRequest.data.data).toString('hex')
                        }
                      })()}
                    </div>
                  </div>
                </div>

                <div className="flex justify-end space-x-3 mt-6">
                  <button
                    onClick={() => {
                      handleReject(selectedRequest.id)
                      setIsModalOpen(false)
                    }}
                    className="px-4 py-2 text-red-700 bg-red-50 border border-red-300 rounded-md hover:bg-red-100 dark:bg-red-900/20 dark:text-red-400 dark:border-red-800"
                  >
                    Reject
                  </button>
                  <button
                    onClick={() => {
                      handleApprove(selectedRequest.id)
                      setIsModalOpen(false)
                    }}
                    className="px-4 py-2 text-green-700 bg-green-50 border border-green-300 rounded-md hover:bg-green-100 dark:bg-green-900/20 dark:text-green-400 dark:border-green-800"
                  >
                    Approve
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </MainLayout>
  )
}
