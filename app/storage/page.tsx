'use client'

/**
 * KV Records Management Page
 *
 * Displays and manages key-value records stored on the device.
 * Address tags are a specific use case where keys are addresses and values are tags.
 */

import { Plus, Database, Tag } from 'lucide-react'
import React, { useState } from 'react'
import { ServerClientDebug } from '@/client/components/debug/ServerClientDebug'
import { MainLayout } from '@/client/components/layout'
import { AddKvRecordModal } from '@/client/components/storage/AddKvRecordModal'
import { KvRecordsTable } from '@/client/components/storage/KvRecordsTable'
import { useDeviceStore } from '@/client/store/clientDeviceStore'

export default function StoragePage() {
  const [isAddModalVisible, setIsAddModalVisible] = useState(false)
  const [isLoading, setIsLoading] = useState(false)

  const { getAllKvRecords, setKvRecord, removeKvRecord, updateKvRecord } = useDeviceStore()

  // Get all KV records
  const allRecords = getAllKvRecords()
  const recordCount = Object.keys(allRecords).length

  // Separate address tags (type 0) from other KV records
  const addressTags = Object.entries(allRecords)
    .filter(() => {
      // For now, assume all records are address tags
      // In the future, we can add type filtering
      return true
    })
    .map(([address, tag]) => ({ address, tag }))

  const otherRecords = Object.entries(allRecords)
    .filter(() => {
      // Filter out what we consider address tags
      // This is a simple heuristic - could be improved with proper type tracking
      return false // For now, all records are treated as address tags
    })
    .map(([key, value]) => ({ key, value }))

  const handleAddRecord = async (key: string, value: string, type: number = 0) => {
    try {
      setIsLoading(true)
      setKvRecord(key, value, type)
      // Don't close modal here - let the modal handle its own closing timing
    } catch (error) {
      console.error('Failed to add KV record:', error)
      throw error // Re-throw so modal can handle the error
    } finally {
      setIsLoading(false)
    }
  }

  const handleRemoveRecord = async (key: string) => {
    try {
      removeKvRecord(key)
    } catch (error) {
      console.error('Failed to remove KV record:', error)
    }
  }

  const handleUpdateRecord = async (key: string, newValue: string) => {
    try {
      updateKvRecord(key, newValue)
    } catch (error) {
      console.error('Failed to update KV record:', error)
    }
  }

  return (
    <MainLayout>
      <div className="space-y-6">
        {/* Page Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
              <Database className="w-8 h-8" />
              KV Records - Address Tags
            </h1>
            <p className="text-gray-600 dark:text-gray-400 mt-2">
              Manage key-value records stored on the device, including address tags
            </p>
          </div>
          <button
            onClick={() => setIsAddModalVisible(true)}
            disabled={isLoading}
            className="px-4 py-2 bg-blue-600 text-white hover:bg-blue-700 rounded-md disabled:opacity-50 flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            Add Record
          </button>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
            <div className="text-center">
              <div className="text-2xl font-bold text-blue-600">{recordCount}</div>
              <div className="text-gray-600 dark:text-gray-400">Total Records</div>
            </div>
          </div>
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
            <div className="text-center">
              <div className="text-2xl font-bold text-green-600">{addressTags.length}</div>
              <div className="text-gray-600 dark:text-gray-400">Address Tags</div>
            </div>
          </div>
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
            <div className="text-center">
              <div className="text-2xl font-bold text-purple-600">{otherRecords.length}</div>
              <div className="text-gray-600 dark:text-gray-400">Other Records</div>
            </div>
          </div>
        </div>

        {/* Address Tags Section */}
        {addressTags.length > 0 && (
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow">
            <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
              <div className="flex items-center gap-2">
                <Tag className="w-5 h-5 text-blue-500" />
                <span className="text-lg font-medium text-gray-900 dark:text-white">
                  Address Tags
                </span>
                <span className="px-2 py-1 bg-blue-100 text-blue-800 text-xs font-medium rounded-full dark:bg-blue-900 dark:text-blue-200">
                  {addressTags.length}
                </span>
              </div>
            </div>
            <div className="p-6">
              <KvRecordsTable
                records={addressTags.map(({ address, tag }) => ({
                  key: address,
                  value: String(tag),
                  type: 0,
                  isAddressTag: true,
                }))}
                onRemove={handleRemoveRecord}
                onUpdate={handleUpdateRecord}
              />
            </div>
          </div>
        )}

        {/* Other KV Records Section */}
        {otherRecords.length > 0 && (
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow">
            <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
              <div className="flex items-center gap-2">
                <Database className="w-5 h-5 text-purple-500" />
                <span className="text-lg font-medium text-gray-900 dark:text-white">
                  Other KV Records
                </span>
                <span className="px-2 py-1 bg-purple-100 text-purple-800 text-xs font-medium rounded-full dark:bg-purple-900 dark:text-purple-200">
                  {otherRecords.length}
                </span>
              </div>
            </div>
            <div className="p-6">
              <KvRecordsTable
                records={otherRecords.map(({ key, value }) => ({
                  key,
                  value: String(value),
                  type: 1,
                  isAddressTag: false,
                }))}
                onRemove={handleRemoveRecord}
                onUpdate={handleUpdateRecord}
              />
            </div>
          </div>
        )}

        {/* Empty State */}
        {recordCount === 0 && (
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow">
            <div className="text-center py-12">
              <Database className="w-24 h-24 text-gray-300 dark:text-gray-600 mx-auto mb-4" />
              <h3 className="text-xl font-medium text-gray-500 dark:text-gray-400 mb-2">
                No KV Records Found
              </h3>
              <p className="text-gray-500 dark:text-gray-400 mb-4">
                Start by adding some key-value records or address tags
              </p>
              <button
                onClick={() => setIsAddModalVisible(true)}
                className="px-4 py-2 bg-blue-600 text-white hover:bg-blue-700 rounded-md flex items-center gap-2 mx-auto"
              >
                <Plus className="w-4 h-4" />
                Add Your First Record
              </button>
            </div>
          </div>
        )}

        {/* Add Record Modal */}
        <AddKvRecordModal
          visible={isAddModalVisible}
          onCancel={() => setIsAddModalVisible(false)}
          onAdd={handleAddRecord}
          loading={isLoading}
        />

        {/* Debug Panel - Collapsible at bottom */}
        <div className="mt-8">
          <ServerClientDebug defaultCollapsed={true} />
        </div>
      </div>
    </MainLayout>
  )
}
