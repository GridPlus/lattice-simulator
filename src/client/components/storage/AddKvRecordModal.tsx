'use client'

/**
 * Add KV Record Modal Component
 *
 * Modal for adding new key-value records to the device.
 * Supports both address tags and general KV records with validation.
 */

import { Tag, Database, Info, X, Check, AlertCircle, Loader2 } from 'lucide-react'
import React, { useState, useEffect } from 'react'
import { validateKvRecord, KV_RECORDS_CONSTANTS } from '@/types/kvRecords'

interface AddKvRecordModalProps {
  visible: boolean
  onCancel: () => void
  onAdd: (key: string, value: string, type: number) => Promise<void>
  loading?: boolean
}

interface FormValues {
  key: string
  value: string
  type: number
  description?: string
}

export function AddKvRecordModal({ visible, onCancel, onAdd, loading }: AddKvRecordModalProps) {
  const [formData, setFormData] = useState<FormValues>({
    key: '',
    value: '',
    type: 0,
    description: '',
  })
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Operation status for enhanced UX feedback
  type OperationStatus = 'idle' | 'loading' | 'success' | 'error'
  const [operationStatus, setOperationStatus] = useState<OperationStatus>('idle')
  const [statusMessage, setStatusMessage] = useState('')

  // Reset form when modal opens/closes
  useEffect(() => {
    if (visible) {
      setFormData({
        key: '',
        value: '',
        type: 0,
        description: '',
      })
      setOperationStatus('idle')
      setStatusMessage('')
    }
  }, [visible])

  // Auto-reset status after showing success/error
  useEffect(() => {
    if (operationStatus === 'success' || operationStatus === 'error') {
      const resetDelay = operationStatus === 'success' ? 2500 : 4000 // Success: 2.5s, Error: 4s

      const timer = setTimeout(() => {
        setOperationStatus('idle')
        setStatusMessage('')

        // If successful, close modal after showing success
        if (operationStatus === 'success') {
          setTimeout(() => {
            onCancel() // Close modal
          }, 300)
        }
      }, resetDelay)

      return () => clearTimeout(timer)
    }
  }, [operationStatus, onCancel])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    try {
      setIsSubmitting(true)
      setOperationStatus('loading')
      setStatusMessage('Adding record...')

      // Validate the record
      const validation = validateKvRecord(formData.key, formData.value)
      if (!validation.isValid) {
        // Add a small delay to show the loading state briefly
        await new Promise(resolve => setTimeout(resolve, 800))
        setOperationStatus('error')
        setStatusMessage(validation.error || 'Validation failed')
        return
      }

      // Add minimum loading time to show the loading state (1.5 seconds)
      const [addResult] = await Promise.all([
        onAdd(formData.key, formData.value, formData.type),
        new Promise(resolve => setTimeout(resolve, 1500)),
      ])

      // Show success with improved message
      setOperationStatus('success')
      setStatusMessage(`✨ ${isAddressTag ? 'Address tag' : 'Record'} added successfully!`)

      // Reset form
      setFormData({
        key: '',
        value: '',
        type: 0,
        description: '',
      })
    } catch (error) {
      console.error('Failed to add record:', error)
      // Ensure minimum loading time even on error
      await new Promise(resolve => setTimeout(resolve, 800))
      setOperationStatus('error')
      setStatusMessage(error instanceof Error ? error.message : 'Failed to add record')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleCancel = () => {
    setFormData({
      key: '',
      value: '',
      type: 0,
      description: '',
    })
    onCancel()
  }

  const handleInputChange = (field: keyof FormValues, value: string | number) => {
    setFormData(prev => ({ ...prev, [field]: value }))
  }

  const isAddressTag = formData.type === 0
  const isSubmittingOrLoading = isSubmitting || loading

  // Get button content based on operation status
  const getButtonContent = () => {
    switch (operationStatus) {
      case 'loading':
        return {
          icon: <Loader2 className="w-4 h-4 animate-spin" />,
          text: `Adding ${isAddressTag ? 'tag' : 'record'}...`,
          className: 'bg-blue-500 hover:bg-blue-600 cursor-wait',
        }
      case 'success':
        return {
          icon: <Check className="w-4 h-4" />,
          text: 'Successfully Added!',
          className: 'bg-green-500 hover:bg-green-600',
        }
      case 'error':
        return {
          icon: <AlertCircle className="w-4 h-4" />,
          text: 'Add Failed',
          className: 'bg-red-500 hover:bg-red-600',
        }
      default:
        return {
          icon: isAddressTag ? <Tag className="w-4 h-4" /> : <Database className="w-4 h-4" />,
          text: `Add ${isAddressTag ? 'Address Tag' : 'Record'}`,
          className: 'bg-blue-600 hover:bg-blue-700',
        }
    }
  }

  const buttonContent = getButtonContent()

  if (!visible) return null

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
        {/* Modal Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-2">
            {isAddressTag ? (
              <Tag className="w-5 h-5 text-blue-500" />
            ) : (
              <Database className="w-5 h-5 text-purple-500" />
            )}
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
              Add {isAddressTag ? 'Address Tag' : 'KV Record'}
            </h2>
          </div>
          <button
            onClick={handleCancel}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {/* Record Type Selection */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Record Type *
            </label>
            <select
              value={formData.type}
              onChange={e => handleInputChange('type', parseInt(e.target.value))}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value={0}>Address Tag (Type 0)</option>
              <option value={1}>General KV Record (Type 1)</option>
            </select>
          </div>

          {/* Key Input */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              {isAddressTag ? 'Address' : 'Key'} *
            </label>
            <input
              type="text"
              value={formData.key}
              onChange={e => handleInputChange('key', e.target.value)}
              placeholder={isAddressTag ? '0x1234...abcd' : 'Enter key'}
              maxLength={KV_RECORDS_CONSTANTS.MAX_KEY_LENGTH}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              required
            />
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              {isAddressTag
                ? 'Enter the cryptocurrency address (e.g., 0x1234...abcd)'
                : 'Enter a unique identifier for this record'}
            </p>
            <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">
              {formData.key.length}/{KV_RECORDS_CONSTANTS.MAX_KEY_LENGTH} characters
            </p>
          </div>

          {/* Value Input */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              {isAddressTag ? 'Tag' : 'Value'} *
            </label>
            <textarea
              value={formData.value}
              onChange={e => handleInputChange('value', e.target.value)}
              placeholder={isAddressTag ? 'My Wallet' : 'Enter value'}
              rows={3}
              maxLength={KV_RECORDS_CONSTANTS.MAX_VALUE_LENGTH}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              required
            />
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              {isAddressTag
                ? 'Enter a human-readable name for this address (e.g., "My Wallet", "Exchange")'
                : 'Enter the data to store for this key'}
            </p>
            <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">
              {formData.value.length}/{KV_RECORDS_CONSTANTS.MAX_VALUE_LENGTH} characters
            </p>
          </div>

          {/* Description (Optional) */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Description (Optional)
            </label>
            <textarea
              value={formData.description}
              onChange={e => handleInputChange('description', e.target.value)}
              placeholder="Add a description for this record"
              rows={2}
              maxLength={200}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">
              {formData.description?.length || 0}/200 characters
            </p>
          </div>

          {/* Info Alert */}
          <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-md p-4">
            <div className="flex">
              <Info className="w-5 h-5 text-blue-400 mt-0.5 mr-3 flex-shrink-0" />
              <div className="text-sm text-blue-800 dark:text-blue-200">
                <h4 className="font-medium mb-2">Record Information</h4>
                <div className="space-y-1">
                  <p>
                    <strong>Type {formData.type}:</strong>{' '}
                    {isAddressTag ? 'Address Tag' : 'General KV Record'}
                  </p>
                  <p>
                    <strong>Max Key Length:</strong> {KV_RECORDS_CONSTANTS.MAX_KEY_LENGTH}{' '}
                    characters
                  </p>
                  <p>
                    <strong>Max Value Length:</strong> {KV_RECORDS_CONSTANTS.MAX_VALUE_LENGTH}{' '}
                    characters
                  </p>
                  {isAddressTag && (
                    <p className="text-blue-600 dark:text-blue-400">
                      Address tags will be displayed in transaction requests and other UI elements
                    </p>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Status Message */}
          {statusMessage && operationStatus !== 'idle' && (
            <div
              className={`mt-4 p-3 rounded-md text-sm flex items-center gap-2 transition-all duration-500 ease-in-out transform animate-in slide-in-from-top-2 ${
                operationStatus === 'success'
                  ? 'bg-green-50 text-green-800 border border-green-200 dark:bg-green-900/20 dark:text-green-200 dark:border-green-800'
                  : operationStatus === 'error'
                    ? 'bg-red-50 text-red-800 border border-red-200 dark:bg-red-900/20 dark:text-red-200 dark:border-red-800'
                    : 'bg-blue-50 text-blue-800 border border-blue-200 dark:bg-blue-900/20 dark:text-blue-200 dark:border-blue-800'
              }`}
            >
              {operationStatus === 'loading' && <Loader2 className="w-4 h-4 animate-spin" />}
              {operationStatus === 'success' && <Check className="w-4 h-4 animate-pulse" />}
              {operationStatus === 'error' && <AlertCircle className="w-4 h-4 animate-pulse" />}
              <span className="font-medium">{statusMessage}</span>
            </div>
          )}

          {/* Form Actions */}
          <div className="flex justify-end gap-3 pt-4 border-t border-gray-200 dark:border-gray-700">
            <button
              type="button"
              onClick={handleCancel}
              disabled={isSubmittingOrLoading}
              className="px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmittingOrLoading || operationStatus === 'success'}
              className={`px-4 py-2 text-white rounded-md disabled:opacity-50 flex items-center gap-2 transition-all duration-300 ${buttonContent.className}`}
            >
              {buttonContent.icon}
              {buttonContent.text}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
