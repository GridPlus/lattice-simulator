'use client'

/**
 * Transaction Signing Modal Component
 *
 * Modal for displaying transaction/message signing requests to the user.
 * Shows transaction details and allows approve/reject actions.
 */

import {
  PenTool,
  X,
  Check,
  XCircle,
  Loader2,
  Clock,
  Shield,
  AlertTriangle,
  Coins,
  ArrowRight,
  Eye,
  EyeOff,
} from 'lucide-react'
import React, { useState, useEffect, useMemo } from 'react'
import { detectCoinTypeFromPath } from '@/shared/utils/protocol'
import type { SigningRequest } from '@/shared/types/device'

interface TransactionSigningModalProps {
  /** Signing request to display */
  request: SigningRequest | null
  /** Modal visibility */
  visible: boolean
  /** Callback when user approves the request */
  onApprove: (requestId: string) => Promise<void>
  /** Callback when user rejects the request */
  onReject: (requestId: string) => Promise<void>
  /** Callback when modal should close */
  onClose: () => void
}

type OperationStatus = 'idle' | 'approving' | 'rejecting' | 'approved' | 'rejected' | 'error'

export function TransactionSigningModal({
  request,
  visible,
  onApprove,
  onReject,
  onClose,
}: TransactionSigningModalProps) {
  const [operationStatus, setOperationStatus] = useState<OperationStatus>('idle')
  const [statusMessage, setStatusMessage] = useState('')
  const [showRawData, setShowRawData] = useState(false)
  const [timeRemaining, setTimeRemaining] = useState<number | null>(null)

  const handleApprove = async () => {
    if (!request) return

    try {
      setOperationStatus('approving')
      setStatusMessage('Signing transaction...')
      await onApprove(request.id)
      setOperationStatus('approved')
      setStatusMessage('✨ Transaction signed successfully!')
    } catch (error) {
      console.error('Failed to approve signing request:', error)
      setOperationStatus('error')
      setStatusMessage(error instanceof Error ? error.message : 'Failed to sign transaction')
    }
  }

  const handleReject = async () => {
    if (!request) return

    try {
      setOperationStatus('rejecting')
      setStatusMessage('Rejecting transaction...')
      await onReject(request.id)
      setOperationStatus('rejected')
      setStatusMessage('Transaction rejected')
    } catch (error) {
      console.error('Failed to reject signing request:', error)
      setOperationStatus('error')
      setStatusMessage(error instanceof Error ? error.message : 'Failed to reject transaction')
    }
  }

  // Reset state when modal opens/closes
  useEffect(() => {
    if (visible && request) {
      setOperationStatus('idle')
      setStatusMessage('')
      setShowRawData(false)

      // Calculate timeout remaining
      const timeoutMs = request.timeoutMs || 30000 // Default 30s timeout
      const elapsed = Date.now() - request.timestamp
      const remaining = Math.max(0, timeoutMs - elapsed)
      setTimeRemaining(remaining)

      // Update countdown timer
      if (remaining > 0) {
        const interval = setInterval(() => {
          const newElapsed = Date.now() - request.timestamp
          const newRemaining = Math.max(0, timeoutMs - newElapsed)
          setTimeRemaining(newRemaining)

          if (newRemaining <= 0) {
            clearInterval(interval)
            // Auto-reject on timeout
            handleReject()
          }
        }, 1000)

        return () => clearInterval(interval)
      }
    }
  }, [visible, request, handleReject])

  // Auto-reset status after operations
  useEffect(() => {
    if (operationStatus === 'approved' || operationStatus === 'rejected') {
      const timer = setTimeout(() => {
        onClose()
      }, 2000)
      return () => clearTimeout(timer)
    } else if (operationStatus === 'error') {
      const timer = setTimeout(() => {
        setOperationStatus('idle')
        setStatusMessage('')
      }, 4000)
      return () => clearTimeout(timer)
    }
  }, [operationStatus, onClose])

  // Computed values
  const coinType = useMemo(() => {
    if (!request) return 'ETH'
    return request.data.coinType || detectCoinTypeFromPath(request.data.path) || 'ETH'
  }, [request])

  const isTransactionType = request?.data.transactionType === 'transaction'
  const isOperating = operationStatus === 'approving' || operationStatus === 'rejecting'
  const isCompleted = operationStatus === 'approved' || operationStatus === 'rejected'

  // Format timeout
  const formatTime = (ms: number) => {
    const seconds = Math.ceil(ms / 1000)
    return `${seconds}s`
  }

  // Get coin icon color
  const getCoinColor = () => {
    switch (coinType) {
      case 'ETH':
        return 'text-blue-500'
      case 'BTC':
        return 'text-orange-500'
      case 'SOL':
        return 'text-purple-500'
      default:
        return 'text-gray-500'
    }
  }

  if (!visible || !request) return null

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
        {/* Modal Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-full bg-gray-100 dark:bg-gray-700 ${getCoinColor()}`}>
              <PenTool className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                Sign {isTransactionType ? 'Transaction' : 'Message'}
              </h2>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                {coinType} • {request.data.path.join('/')}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {/* Timeout indicator */}
            {timeRemaining !== null && timeRemaining > 0 && (
              <div className="flex items-center gap-2 px-3 py-1 bg-yellow-50 dark:bg-yellow-900/20 text-yellow-800 dark:text-yellow-200 rounded-full text-sm">
                <Clock className="w-4 h-4" />
                <span>{formatTime(timeRemaining)}</span>
              </div>
            )}
            <button
              onClick={onClose}
              disabled={isOperating}
              className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 disabled:opacity-50"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Modal Body */}
        <div className="p-6 space-y-6">
          {/* Transaction Details */}
          {isTransactionType && request.metadata && (
            <div className="bg-gray-50 dark:bg-gray-900/50 rounded-lg p-4 space-y-4">
              <h3 className="font-medium text-gray-900 dark:text-white flex items-center gap-2">
                <Coins className={`w-4 h-4 ${getCoinColor()}`} />
                Transaction Details
              </h3>

              <div className="grid grid-cols-1 gap-4">
                {/* From/To addresses */}
                {(request.metadata.from || request.metadata.to) && (
                  <div className="flex items-center gap-4">
                    {request.metadata.from && (
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                          FROM
                        </p>
                        <p className="text-sm font-mono text-gray-900 dark:text-white truncate">
                          {request.metadata.from}
                        </p>
                      </div>
                    )}
                    {request.metadata.from && request.metadata.to && (
                      <ArrowRight className="w-4 h-4 text-gray-400 flex-shrink-0" />
                    )}
                    {request.metadata.to && (
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                          TO
                        </p>
                        <p className="text-sm font-mono text-gray-900 dark:text-white truncate">
                          {request.metadata.to}
                        </p>
                      </div>
                    )}
                  </div>
                )}

                {/* Value and token */}
                {request.metadata.value && (
                  <div>
                    <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                      VALUE
                    </p>
                    <p className="text-lg font-semibold text-gray-900 dark:text-white">
                      {request.metadata.value} {request.metadata.tokenSymbol || coinType}
                    </p>
                  </div>
                )}

                {/* Gas details for ETH */}
                {coinType === 'ETH' && (request.metadata.gasLimit || request.metadata.gasPrice) && (
                  <div className="grid grid-cols-2 gap-4">
                    {request.metadata.gasLimit && (
                      <div>
                        <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                          GAS LIMIT
                        </p>
                        <p className="text-sm text-gray-900 dark:text-white">
                          {request.metadata.gasLimit}
                        </p>
                      </div>
                    )}
                    {request.metadata.gasPrice && (
                      <div>
                        <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                          GAS PRICE
                        </p>
                        <p className="text-sm text-gray-900 dark:text-white">
                          {request.metadata.gasPrice}
                        </p>
                      </div>
                    )}
                  </div>
                )}

                {/* Contract address for token transfers */}
                {request.metadata.contractAddress && (
                  <div>
                    <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                      CONTRACT
                    </p>
                    <p className="text-sm font-mono text-gray-900 dark:text-white break-all">
                      {request.metadata.contractAddress}
                    </p>
                  </div>
                )}

                {/* Description */}
                {request.metadata.description && (
                  <div>
                    <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                      DESCRIPTION
                    </p>
                    <p className="text-sm text-gray-900 dark:text-white">
                      {request.metadata.description}
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Raw Data Section */}
          <div className="border border-gray-200 dark:border-gray-700 rounded-lg">
            <button
              onClick={() => setShowRawData(!showRawData)}
              className="w-full flex items-center justify-between p-4 hover:bg-gray-50 dark:hover:bg-gray-900/50 transition-colors"
            >
              <div className="flex items-center gap-2">
                <Shield className="w-4 h-4 text-gray-500" />
                <span className="font-medium text-gray-900 dark:text-white">Raw Data</span>
              </div>
              {showRawData ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>

            {showRawData && (
              <div className="border-t border-gray-200 dark:border-gray-700 p-4">
                <div className="space-y-3">
                  <div>
                    <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                      DERIVATION PATH
                    </p>
                    <p className="text-sm font-mono bg-gray-100 dark:bg-gray-800 p-2 rounded">
                      m/{request.data.path.join('/')}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                      DATA TO SIGN
                    </p>
                    <div className="text-xs font-mono bg-gray-100 dark:bg-gray-800 p-2 rounded max-h-32 overflow-y-auto break-all">
                      {(() => {
                        // Handle different data formats
                        if (Buffer.isBuffer(request.data.data)) {
                          return request.data.data.toString('hex')
                        } else if (
                          request.data.data &&
                          typeof request.data.data === 'object' &&
                          (request.data.data as any).type === 'Buffer'
                        ) {
                          // Handle serialized Buffer format from JSON
                          return Buffer.from((request.data.data as any).data).toString('hex')
                        } else if (Array.isArray(request.data.data)) {
                          // Handle array format
                          return Buffer.from(request.data.data).toString('hex')
                        } else {
                          // Fallback: try to convert to Buffer
                          return Buffer.from(request.data.data).toString('hex')
                        }
                      })()}
                    </div>
                  </div>
                  {request.data.curve && (
                    <div>
                      <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                        CURVE
                      </p>
                      <p className="text-sm text-gray-900 dark:text-white">{request.data.curve}</p>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Security Warning */}
          <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-md p-4">
            <div className="flex gap-3">
              <AlertTriangle className="w-5 h-5 text-yellow-600 dark:text-yellow-400 mt-0.5 flex-shrink-0" />
              <div className="text-sm text-yellow-800 dark:text-yellow-200">
                <h4 className="font-medium mb-1">Security Notice</h4>
                <p>
                  Verify all transaction details before signing. Once signed, this transaction
                  cannot be reversed. Only approve if you trust the requesting application and
                  recognize this transaction.
                </p>
              </div>
            </div>
          </div>

          {/* Status Message */}
          {statusMessage && operationStatus !== 'idle' && (
            <div
              className={`p-3 rounded-md text-sm flex items-center gap-2 transition-all duration-300 ${
                operationStatus === 'approved'
                  ? 'bg-green-50 text-green-800 border border-green-200 dark:bg-green-900/20 dark:text-green-200 dark:border-green-800'
                  : operationStatus === 'rejected'
                    ? 'bg-gray-50 text-gray-800 border border-gray-200 dark:bg-gray-900/20 dark:text-gray-200 dark:border-gray-800'
                    : operationStatus === 'error'
                      ? 'bg-red-50 text-red-800 border border-red-200 dark:bg-red-900/20 dark:text-red-200 dark:border-red-800'
                      : 'bg-blue-50 text-blue-800 border border-blue-200 dark:bg-blue-900/20 dark:text-blue-200 dark:border-blue-800'
              }`}
            >
              {operationStatus === 'approving' && <Loader2 className="w-4 h-4 animate-spin" />}
              {operationStatus === 'rejecting' && <Loader2 className="w-4 h-4 animate-spin" />}
              {operationStatus === 'approved' && <Check className="w-4 h-4" />}
              {operationStatus === 'rejected' && <XCircle className="w-4 h-4" />}
              <span className="font-medium">{statusMessage}</span>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex justify-end gap-3 pt-4 border-t border-gray-200 dark:border-gray-700">
            <button
              onClick={handleReject}
              disabled={isOperating || isCompleted}
              className={`px-6 py-2 rounded-md font-medium transition-all duration-200 flex items-center gap-2 ${
                operationStatus === 'rejected'
                  ? 'bg-gray-500 text-white'
                  : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 border border-gray-300 dark:border-gray-600'
              } disabled:opacity-50`}
            >
              {operationStatus === 'rejecting' ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <XCircle className="w-4 h-4" />
              )}
              {operationStatus === 'rejected' ? 'Rejected' : 'Reject'}
            </button>

            <button
              onClick={handleApprove}
              disabled={isOperating || isCompleted}
              className={`px-6 py-2 rounded-md font-medium transition-all duration-200 flex items-center gap-2 ${
                operationStatus === 'approved'
                  ? 'bg-green-600 text-white'
                  : 'bg-blue-600 hover:bg-blue-700 text-white'
              } disabled:opacity-50`}
            >
              {operationStatus === 'approving' ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Check className="w-4 h-4" />
              )}
              {operationStatus === 'approved'
                ? 'Approved'
                : operationStatus === 'approving'
                  ? 'Signing...'
                  : 'Sign'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
