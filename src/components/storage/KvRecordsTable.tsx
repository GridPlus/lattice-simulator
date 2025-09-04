'use client'

/**
 * KV Records Table Component
 * 
 * Displays key-value records in a table format with actions for editing and removal.
 * Supports both address tags and general KV records.
 */

import React, { useState } from 'react'
import { Edit, Trash2, Copy, Check, X } from 'lucide-react'
import { validateKvRecord } from '@/types/kvRecords'

interface KvRecord {
  key: string
  value: string
  type: number
  isAddressTag: boolean
}

interface KvRecordsTableProps {
  records: KvRecord[]
  onRemove: (key: string) => void
  onUpdate?: (key: string, newValue: string) => void
  isLoading?: boolean
}

export function KvRecordsTable({ records, onRemove, onUpdate, isLoading }: KvRecordsTableProps) {
  const [editingKey, setEditingKey] = useState<string | null>(null)
  const [editingValue, setEditingValue] = useState<string>('')
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(null)

  const handleEdit = (record: KvRecord) => {
    setEditingKey(record.key)
    setEditingValue(record.value)
  }

  const handleSave = async (key: string) => {
    try {
      const validation = validateKvRecord(key, editingValue)
      if (!validation.isValid) {
        alert(validation.error)
        return
      }

      if (onUpdate) {
        await onUpdate(key, editingValue)
        alert('Record updated successfully')
      }
      setEditingKey(null)
      setEditingValue('')
    } catch (error) {
      alert('Failed to update record')
      console.error('Update error:', error)
    }
  }

  const handleCancel = () => {
    setEditingKey(null)
    setEditingValue('')
  }

  const handleCopy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      alert('Copied to clipboard')
    } catch (error) {
      alert('Failed to copy to clipboard')
    }
  }

  const handleDelete = (key: string) => {
    onRemove(key)
    setShowDeleteConfirm(null)
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    )
  }

  if (records.length === 0) {
    return (
      <div className="text-center py-8 text-gray-500">
        No records found
      </div>
    )
  }

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
        <thead className="bg-gray-50 dark:bg-gray-800">
          <tr>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
              Type
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
              Key
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
              Value
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
              Actions
            </th>
          </tr>
        </thead>
        <tbody className="bg-white dark:bg-gray-900 divide-y divide-gray-200 dark:divide-gray-700">
          {records.map((record) => (
            <tr key={record.key} className="hover:bg-gray-50 dark:hover:bg-gray-800">
              {/* Type */}
              <td className="px-6 py-4 whitespace-nowrap">
                <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                  record.isAddressTag 
                    ? 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200'
                    : 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200'
                }`}>
                  {record.isAddressTag ? 'Address Tag' : 'KV Record'}
                </span>
              </td>

              {/* Key */}
              <td className="px-6 py-4 whitespace-nowrap">
                <div className="flex items-center gap-2">
                  <code className="text-sm bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded">
                    {record.isAddressTag ? record.key.slice(0, 8) + '...' + record.key.slice(-6) : record.key}
                  </code>
                  <button
                    onClick={() => handleCopy(record.key)}
                    className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                    title="Copy key"
                  >
                    <Copy className="w-4 h-4" />
                  </button>
                </div>
              </td>

              {/* Value */}
              <td className="px-6 py-4">
                                 {editingKey === record.key ? (
                   <input
                     type="text"
                     value={editingValue}
                     onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEditingValue(e.target.value)}
                     onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => e.key === 'Enter' && handleSave(record.key)}
                     className="max-w-xs px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                     autoFocus
                   />
                 ) : (
                  <div className="flex items-center gap-2">
                    <span className="max-w-xs truncate">{record.value}</span>
                    <button
                      onClick={() => handleCopy(record.value)}
                      className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                      title="Copy value"
                    >
                      <Copy className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </td>

              {/* Actions */}
              <td className="px-6 py-4 whitespace-nowrap">
                {editingKey === record.key ? (
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleSave(record.key)}
                      className="text-green-600 hover:text-green-800 dark:hover:text-green-400"
                      title="Save"
                    >
                      <Check className="w-4 h-4" />
                    </button>
                    <button
                      onClick={handleCancel}
                      className="text-red-600 hover:text-red-800 dark:hover:text-red-400"
                      title="Cancel"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ) : (
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleEdit(record)}
                      className="text-blue-600 hover:text-blue-800 dark:hover:text-blue-400"
                      title="Edit"
                    >
                      <Edit className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => setShowDeleteConfirm(record.key)}
                      className="text-red-600 hover:text-red-800 dark:hover:text-red-400"
                      title="Delete"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
              Delete Record?
            </h3>
            <p className="text-gray-500 dark:text-gray-400 mb-6">
              This action cannot be undone.
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setShowDeleteConfirm(null)}
                className="px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md"
              >
                Cancel
              </button>
              <button
                onClick={() => handleDelete(showDeleteConfirm)}
                className="px-4 py-2 bg-red-600 text-white hover:bg-red-700 rounded-md"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
