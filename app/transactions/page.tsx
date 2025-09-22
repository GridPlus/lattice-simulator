'use client'

/**
 * Transaction History Page
 *
 * Displays completed transactions (approved and rejected) with filtering and pagination.
 * Shows transaction details, signatures, and metadata.
 */

import { FileText, Filter, CheckCircle, XCircle, Eye, Download, Search } from 'lucide-react'
import React, { useState, useMemo, useEffect } from 'react'
import { MainLayout } from '@/client/components/layout'
import { useTransactionStore } from '@/client/store/clientTransactionStore'
import type { TransactionRecord } from '@/shared/types/device'

export default function TransactionsPage() {
  const [mounted, setMounted] = useState(false)
  const [selectedTransaction, setSelectedTransaction] = useState<TransactionRecord | null>(null)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')

  // Only access store after component is mounted (client-side)
  const transactions = useTransactionStore(state => (mounted ? state.transactions : []))
  const filters = useTransactionStore(state =>
    mounted ? state.filters : { coinType: 'ALL', status: 'ALL', type: 'ALL', dateRange: undefined },
  )
  const setFilters = useTransactionStore(state => state.setFilters)
  const resetFilters = useTransactionStore(state => state.resetFilters)
  const getStats = useTransactionStore(state => state.getStats)

  // Set mounted state on client side
  useEffect(() => {
    setMounted(true)
  }, [])

  const stats = mounted ? getStats() : { total: 0, approved: 0, rejected: 0 }

  // Filter and search transactions
  const filteredTransactions = useMemo(() => {
    if (!mounted) return []

    let filtered = transactions

    // Apply store filters
    if (filters.coinType && filters.coinType !== 'ALL') {
      filtered = filtered.filter(tx => tx.coinType === filters.coinType)
    }
    if (filters.status && filters.status !== 'ALL') {
      filtered = filtered.filter(tx => tx.status === filters.status)
    }
    if (filters.type && filters.type !== 'ALL') {
      filtered = filtered.filter(tx => tx.type === filters.type)
    }

    // Apply search term
    if (searchTerm) {
      filtered = filtered.filter(
        tx =>
          tx.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
          tx.metadata.description?.toLowerCase().includes(searchTerm.toLowerCase()) ||
          tx.metadata.from?.toLowerCase().includes(searchTerm.toLowerCase()) ||
          tx.metadata.to?.toLowerCase().includes(searchTerm.toLowerCase()),
      )
    }

    // Sort by timestamp (newest first)
    return filtered.sort((a, b) => b.timestamp - a.timestamp)
  }, [transactions, filters, searchTerm, mounted])

  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleString()
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'approved':
        return 'text-green-600 bg-green-50 dark:bg-green-900/20 dark:text-green-400'
      case 'rejected':
        return 'text-red-600 bg-red-50 dark:bg-red-900/20 dark:text-red-400'
      default:
        return 'text-gray-600 bg-gray-50 dark:bg-gray-900/20 dark:text-gray-400'
    }
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

  const exportTransactions = () => {
    const dataStr = JSON.stringify(filteredTransactions, null, 2)
    const dataUri = 'data:application/json;charset=utf-8,' + encodeURIComponent(dataStr)

    const exportFileDefaultName = `lattice_transactions_${new Date().toISOString().split('T')[0]}.json`

    const linkElement = document.createElement('a')
    linkElement.setAttribute('href', dataUri)
    linkElement.setAttribute('download', exportFileDefaultName)
    linkElement.click()
  }

  return (
    <MainLayout>
      <div>
        <div className="mb-6">
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100 flex items-center">
            <FileText className="mr-3 h-6 w-6" />
            Transaction History
          </h1>
          <p className="text-gray-600 dark:text-gray-400 mt-1">
            View completed signing operations and their results
          </p>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
            <div className="flex items-center">
              <div className="p-2 bg-blue-100 dark:bg-blue-900/20 rounded-lg">
                <FileText className="h-5 w-5 text-blue-600 dark:text-blue-400" />
              </div>
              <div className="ml-3">
                <p className="text-sm text-gray-500 dark:text-gray-400">Total</p>
                <p className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                  {stats.total}
                </p>
              </div>
            </div>
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
            <div className="flex items-center">
              <div className="p-2 bg-green-100 dark:bg-green-900/20 rounded-lg">
                <CheckCircle className="h-5 w-5 text-green-600 dark:text-green-400" />
              </div>
              <div className="ml-3">
                <p className="text-sm text-gray-500 dark:text-gray-400">Approved</p>
                <p className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                  {stats.approved}
                </p>
              </div>
            </div>
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
            <div className="flex items-center">
              <div className="p-2 bg-red-100 dark:bg-red-900/20 rounded-lg">
                <XCircle className="h-5 w-5 text-red-600 dark:text-red-400" />
              </div>
              <div className="ml-3">
                <p className="text-sm text-gray-500 dark:text-gray-400">Rejected</p>
                <p className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                  {stats.rejected}
                </p>
              </div>
            </div>
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
            <div className="flex items-center">
              <div className="p-2 bg-purple-100 dark:bg-purple-900/20 rounded-lg">
                <Filter className="h-5 w-5 text-purple-600 dark:text-purple-400" />
              </div>
              <div className="ml-3">
                <p className="text-sm text-gray-500 dark:text-gray-400">Filtered</p>
                <p className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                  {filteredTransactions.length}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Filters and Search */}
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4 mb-6">
          <div className="flex flex-col sm:flex-row gap-4">
            {/* Search */}
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search transactions..."
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
            </div>

            {/* Filters */}
            <div className="flex gap-3">
              <select
                value={filters.coinType || 'ALL'}
                onChange={e => setFilters({ coinType: e.target.value as any })}
                className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
              >
                <option value="ALL">All Coins</option>
                <option value="ETH">Ethereum</option>
                <option value="BTC">Bitcoin</option>
                <option value="SOL">Solana</option>
              </select>

              <select
                value={filters.status || 'ALL'}
                onChange={e => setFilters({ status: e.target.value as any })}
                className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
              >
                <option value="ALL">All Status</option>
                <option value="approved">Approved</option>
                <option value="rejected">Rejected</option>
              </select>

              <select
                value={filters.type || 'ALL'}
                onChange={e => setFilters({ type: e.target.value as any })}
                className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
              >
                <option value="ALL">All Types</option>
                <option value="transaction">Transactions</option>
                <option value="message">Messages</option>
              </select>

              <button
                onClick={resetFilters}
                className="px-3 py-2 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100"
              >
                Reset
              </button>

              <button
                onClick={exportTransactions}
                className="inline-flex items-center px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm font-medium text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600"
              >
                <Download className="h-4 w-4 mr-2" />
                Export
              </button>
            </div>
          </div>
        </div>

        {/* Transaction List */}
        {filteredTransactions.length === 0 ? (
          <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-8 text-center">
            <FileText className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-2">
              No Transactions Found
            </h3>
            <p className="text-gray-600 dark:text-gray-400">
              {transactions.length === 0
                ? 'Complete some signing requests to see transaction history.'
                : 'Try adjusting your search or filter criteria.'}
            </p>
          </div>
        ) : (
          <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                <thead className="bg-gray-50 dark:bg-gray-900">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Transaction
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Type
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Status
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Date
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                  {filteredTransactions.map(transaction => (
                    <tr key={transaction.id} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center">
                          <div>
                            <div className="flex items-center space-x-2">
                              <span
                                className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${getCoinTypeColor(transaction.coinType)}`}
                              >
                                {transaction.coinType}
                              </span>
                              <div className="text-sm font-medium text-gray-900 dark:text-gray-100">
                                {transaction.metadata.description || 'Transaction'}
                              </div>
                            </div>
                            <div className="text-sm text-gray-500 dark:text-gray-400 font-mono">
                              {transaction.id.substring(0, 16)}...
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className="text-sm text-gray-900 dark:text-gray-100 capitalize">
                          {transaction.type}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${getStatusColor(transaction.status)}`}
                        >
                          {transaction.status === 'approved' ? (
                            <CheckCircle className="h-3 w-3 mr-1" />
                          ) : (
                            <XCircle className="h-3 w-3 mr-1" />
                          )}
                          {transaction.status}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                        {formatDate(transaction.timestamp)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                        <button
                          onClick={() => {
                            setSelectedTransaction(transaction)
                            setIsModalOpen(true)
                          }}
                          className="text-blue-600 hover:text-blue-500 dark:text-blue-400 dark:hover:text-blue-300"
                        >
                          <Eye className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Transaction Details Modal */}
        {isModalOpen && selectedTransaction && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
            <div className="bg-white dark:bg-gray-800 rounded-lg max-w-4xl w-full max-h-[80vh] overflow-y-auto">
              <div className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
                    Transaction Details
                  </h2>
                  <button
                    onClick={() => setIsModalOpen(false)}
                    className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                  >
                    <XCircle className="h-6 w-6" />
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Basic Info */}
                  <div className="space-y-4">
                    <div>
                      <label className="text-sm font-medium text-gray-500 dark:text-gray-400">
                        Transaction ID
                      </label>
                      <div className="font-mono text-xs bg-gray-100 dark:bg-gray-700 rounded px-3 py-2 mt-1 break-all">
                        {selectedTransaction.id}
                      </div>
                    </div>

                    <div>
                      <label className="text-sm font-medium text-gray-500 dark:text-gray-400">
                        Status
                      </label>
                      <div className="mt-1">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${getStatusColor(selectedTransaction.status)}`}
                        >
                          {selectedTransaction.status === 'approved' ? (
                            <CheckCircle className="h-3 w-3 mr-1" />
                          ) : (
                            <XCircle className="h-3 w-3 mr-1" />
                          )}
                          {selectedTransaction.status}
                        </span>
                      </div>
                    </div>

                    <div>
                      <label className="text-sm font-medium text-gray-500 dark:text-gray-400">
                        Date
                      </label>
                      <div className="mt-1">{formatDate(selectedTransaction.timestamp)}</div>
                    </div>

                    <div>
                      <label className="text-sm font-medium text-gray-500 dark:text-gray-400">
                        Description
                      </label>
                      <div className="mt-1">
                        {selectedTransaction.metadata.description || 'No description'}
                      </div>
                    </div>
                  </div>

                  {/* Transaction Details */}
                  <div className="space-y-4">
                    {selectedTransaction.metadata.from && (
                      <div>
                        <label className="text-sm font-medium text-gray-500 dark:text-gray-400">
                          From
                        </label>
                        <div className="font-mono text-xs bg-gray-100 dark:bg-gray-700 rounded px-3 py-2 mt-1 break-all">
                          {selectedTransaction.metadata.from}
                        </div>
                      </div>
                    )}

                    {selectedTransaction.metadata.to && (
                      <div>
                        <label className="text-sm font-medium text-gray-500 dark:text-gray-400">
                          To
                        </label>
                        <div className="font-mono text-xs bg-gray-100 dark:bg-gray-700 rounded px-3 py-2 mt-1 break-all">
                          {selectedTransaction.metadata.to}
                        </div>
                      </div>
                    )}

                    {selectedTransaction.metadata.value && (
                      <div>
                        <label className="text-sm font-medium text-gray-500 dark:text-gray-400">
                          Value
                        </label>
                        <div className="mt-1">
                          {selectedTransaction.metadata.value}{' '}
                          {selectedTransaction.metadata.tokenSymbol}
                        </div>
                      </div>
                    )}

                    {selectedTransaction.signature && (
                      <div>
                        <label className="text-sm font-medium text-gray-500 dark:text-gray-400">
                          Signature
                        </label>
                        <div className="font-mono text-xs bg-gray-100 dark:bg-gray-700 rounded px-3 py-2 mt-1 max-h-32 overflow-y-auto break-all">
                          {Buffer.isBuffer(selectedTransaction.signature)
                            ? selectedTransaction.signature.toString('hex')
                            : selectedTransaction.signature}
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Original Request Data - Show for all transactions */}
                {selectedTransaction.originalRequest && (
                  <div className="mt-6 border-t border-gray-200 dark:border-gray-700 pt-6">
                    <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-4">
                      Original Request Data
                    </h3>
                    <div className="space-y-4">
                      <div>
                        <label className="text-sm font-medium text-gray-500 dark:text-gray-400">
                          Request Type
                        </label>
                        <div className="mt-1 text-sm text-gray-900 dark:text-gray-100">
                          {selectedTransaction.originalRequest.type}
                        </div>
                      </div>

                      <div>
                        <label className="text-sm font-medium text-gray-500 dark:text-gray-400">
                          Data (Hex)
                        </label>
                        <div className="font-mono text-xs bg-gray-100 dark:bg-gray-700 rounded px-3 py-2 mt-1 max-h-32 overflow-y-auto break-all">
                          {Buffer.isBuffer(selectedTransaction.originalRequest.data.data)
                            ? selectedTransaction.originalRequest.data.data.toString('hex')
                            : String(selectedTransaction.originalRequest.data.data)}
                        </div>
                      </div>

                      {selectedTransaction.originalRequest.data.path && (
                        <div>
                          <label className="text-sm font-medium text-gray-500 dark:text-gray-400">
                            Derivation Path
                          </label>
                          <div className="font-mono text-xs bg-gray-100 dark:bg-gray-700 rounded px-3 py-2 mt-1">
                            {selectedTransaction.originalRequest.data.path.join('/')}
                          </div>
                        </div>
                      )}

                      {selectedTransaction.originalRequest.metadata && (
                        <div>
                          <label className="text-sm font-medium text-gray-500 dark:text-gray-400">
                            Request Metadata
                          </label>
                          <div className="font-mono text-xs bg-gray-100 dark:bg-gray-700 rounded px-3 py-2 mt-1 max-h-32 overflow-y-auto">
                            <pre>
                              {JSON.stringify(
                                selectedTransaction.originalRequest.metadata,
                                null,
                                2,
                              )}
                            </pre>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </MainLayout>
  )
}
