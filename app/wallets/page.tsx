'use client'

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@radix-ui/react-select'
import { Search, Copy, ChevronDown, Plus, Star, Loader2, AlertCircle } from 'lucide-react'
import { useRouter } from 'next/navigation'
import React, { useState, useMemo } from 'react'
import { MainLayout } from '@/client/components/layout'
import { useWalletStore, useWalletStats } from '@/client/store/clientWalletStore'
import type { WalletCoinType, WalletAccount } from '@/types/wallet'

interface DisplayWalletAccount {
  index: number
  path: string
  address: string
  publicKey: string
  type: 'external' | 'internal'
  name: string
  isActive: boolean
}

const COIN_TYPES = {
  BTC: { name: 'Bitcoin', purpose: 44, coinType: 0 },
  ETH: { name: 'Ethereum', purpose: 44, coinType: 60 },
  SOL: { name: 'Solana', purpose: 44, coinType: 501 },
}

export default function WalletsPage() {
  const router = useRouter()
  const [selectedCoin, setSelectedCoin] = useState<WalletCoinType>('ETH')
  const [searchPath, setSearchPath] = useState('')
  const [copiedAddress, setCopiedAddress] = useState<string | null>(null)
  const [accountTypeFilter, setAccountTypeFilter] = useState<'all' | 'external' | 'internal'>('all')

  const {
    wallets,
    activeWallets,
    isInitialized,
    isLoading,
    error,
    setActiveWallet,
    initializeWallets,
    createAccounts,
  } = useWalletStore()

  const walletStats = useWalletStats()

  const accounts = useMemo(() => {
    if (!isInitialized || !wallets[selectedCoin]) {
      return []
    }

    const coinWallets = wallets[selectedCoin]
    const externalAccounts = coinWallets.external || []
    const internalAccounts = coinWallets.internal || []

    // Convert wallet accounts to display format
    const convertToDisplayAccount = (account: WalletAccount): DisplayWalletAccount => ({
      index: account.accountIndex,
      path: account.derivationPathString,
      address: account.address,
      publicKey: account.publicKey,
      type: account.type,
      name: account.name,
      isActive: account.isActive,
    })

    switch (accountTypeFilter) {
      case 'all':
        return [
          ...externalAccounts.map(convertToDisplayAccount),
          ...internalAccounts.map(convertToDisplayAccount),
        ]
      case 'internal':
        return internalAccounts.map(convertToDisplayAccount)
      case 'external':
      default:
        return externalAccounts.map(convertToDisplayAccount)
    }
  }, [wallets, selectedCoin, accountTypeFilter, isInitialized])

  const filteredAccounts = useMemo(() => {
    if (!searchPath.trim()) return accounts

    return accounts.filter(
      account =>
        account.path.toLowerCase().includes(searchPath.toLowerCase()) ||
        account.index.toString().includes(searchPath) ||
        account.name.toLowerCase().includes(searchPath.toLowerCase()) ||
        account.address.toLowerCase().includes(searchPath.toLowerCase()),
    )
  }, [accounts, searchPath])

  const handleCopyAddress = async (address: string) => {
    try {
      await navigator.clipboard.writeText(address)
      setCopiedAddress(address)
      setTimeout(() => setCopiedAddress(null), 2000)
    } catch (err) {
      console.error('Failed to copy address:', err)
    }
  }

  const handleSetActiveWallet = (account: DisplayWalletAccount) => {
    if (!isInitialized || isLoading) return

    // Find the full wallet account from the store
    const coinWallets = wallets[selectedCoin]
    const accountType = account.type
    const fullAccount = coinWallets[accountType].find(w => w.address === account.address)

    if (fullAccount) {
      setActiveWallet(selectedCoin, fullAccount)
      console.log(`[WalletsPage] Set active ${selectedCoin} wallet:`, fullAccount.name)
    }
  }

  const handleCreateMoreAccounts = async () => {
    if (!isInitialized || isLoading) return

    try {
      // Default to external accounts if "all" is selected
      const accountType = accountTypeFilter === 'internal' ? 'internal' : 'external'
      await createAccounts(selectedCoin, accountType, 5)
      console.log(`[WalletsPage] Created 5 more ${accountType} ${selectedCoin} accounts`)
    } catch (err) {
      console.error('[WalletsPage] Failed to create more accounts:', err)
    }
  }

  // Show loading state during wallet initialization
  if (!isInitialized && isLoading) {
    return (
      <MainLayout>
        <div>
          <div className="flex items-center justify-center min-h-[400px]">
            <div className="text-center">
              <Loader2 className="w-12 h-12 text-blue-500 mx-auto mb-4 animate-spin" />
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
                Initializing Wallets
              </h2>
              <p className="text-gray-600 dark:text-gray-400">
                Generating HD wallet accounts from mnemonic...
              </p>
            </div>
          </div>
        </div>
      </MainLayout>
    )
  }

  // Show error state if wallet initialization failed
  if (!isInitialized && error) {
    return (
      <MainLayout>
        <div>
          <div className="flex items-center justify-center min-h-[400px]">
            <div className="text-center">
              <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
                Wallet Initialization Failed
              </h2>
              <p className="text-gray-600 dark:text-gray-400 mb-4">{error}</p>
              <button
                onClick={() => initializeWallets()}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                Try Again
              </button>
            </div>
          </div>
        </div>
      </MainLayout>
    )
  }

  // Show setup prompt if wallets aren't initialized
  if (!isInitialized) {
    return (
      <MainLayout>
        <div>
          <div className="flex items-center justify-center min-h-[400px]">
            <div className="text-center">
              <AlertCircle className="w-12 h-12 text-orange-500 mx-auto mb-4" />
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
                Wallets Not Initialized
              </h2>
              <p className="text-gray-600 dark:text-gray-400 mb-4">
                Please set up your wallets first to view accounts.
              </p>
              <button
                onClick={() => router.push('/connection')}
                className="px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-colors"
              >
                Go to Wallet Setup
              </button>
            </div>
          </div>
        </div>
      </MainLayout>
    )
  }

  return (
    <MainLayout>
      <div>
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">Wallet Accounts</h1>
          <p className="text-gray-600 dark:text-gray-400 mb-4">
            View and manage your HD wallet accounts across different blockchains
          </p>

          {/* Wallet Stats */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
            <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-lg">
              <h3 className="text-sm font-medium text-blue-900 dark:text-blue-100">
                Total Accounts
              </h3>
              <p className="text-2xl font-bold text-blue-600 dark:text-blue-300">
                {walletStats.totalAccounts}
              </p>
            </div>
            <div className="bg-green-50 dark:bg-green-900/20 p-4 rounded-lg">
              <h3 className="text-sm font-medium text-green-900 dark:text-green-100">
                ETH Accounts
              </h3>
              <p className="text-2xl font-bold text-green-600 dark:text-green-300">
                {walletStats.accountsByType.ETH}
              </p>
            </div>
            <div className="bg-orange-50 dark:bg-orange-900/20 p-4 rounded-lg">
              <h3 className="text-sm font-medium text-orange-900 dark:text-orange-100">
                BTC Accounts
              </h3>
              <p className="text-2xl font-bold text-orange-600 dark:text-orange-300">
                {walletStats.accountsByType.BTC}
              </p>
            </div>
            <div className="bg-purple-50 dark:bg-purple-900/20 p-4 rounded-lg">
              <h3 className="text-sm font-medium text-purple-900 dark:text-purple-100">
                SOL Accounts
              </h3>
              <p className="text-2xl font-bold text-purple-600 dark:text-purple-300">
                {walletStats.accountsByType.SOL}
              </p>
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700">
          {/* Header Controls */}
          <div className="p-6 border-b border-gray-200 dark:border-gray-700">
            <div className="flex flex-col lg:flex-row gap-4">
              {/* Left side controls */}
              <div className="flex flex-col sm:flex-row gap-4 flex-1">
                {/* Coin Type Selector */}
                <div className="flex-1">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Coin Type
                  </label>
                  <Select
                    value={selectedCoin}
                    onValueChange={(value: WalletCoinType) => setSelectedCoin(value)}
                  >
                    <SelectTrigger className="w-full flex items-center justify-between h-10 px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100">
                      <SelectValue placeholder="Select coin type">
                        <span className="flex items-center">
                          {COIN_TYPES[selectedCoin].name} ({selectedCoin})
                          {activeWallets[selectedCoin] && (
                            <Star className="w-4 h-4 ml-2 text-yellow-500 fill-current" />
                          )}
                        </span>
                      </SelectValue>
                      <ChevronDown className="h-4 w-4 opacity-50" />
                    </SelectTrigger>
                    <SelectContent className="bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md shadow-lg">
                      {Object.entries(COIN_TYPES).map(([key, { name }]) => (
                        <SelectItem
                          key={key}
                          value={key}
                          className="px-3 py-2 text-sm cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-600"
                        >
                          <span className="flex items-center">
                            {name} ({key})
                            {activeWallets[key as WalletCoinType] && (
                              <Star className="w-4 h-4 ml-2 text-yellow-500 fill-current" />
                            )}
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Account Type Filter */}
                <div className="flex-1">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Account Type
                  </label>
                  <div className="flex bg-gray-100 dark:bg-gray-700 rounded-md p-1">
                    <button
                      onClick={() => setAccountTypeFilter('all')}
                      className={`flex-1 px-3 py-2 text-sm font-medium rounded transition-colors ${
                        accountTypeFilter === 'all'
                          ? 'bg-white dark:bg-gray-600 text-gray-900 dark:text-white shadow-sm'
                          : 'text-gray-600 dark:text-gray-400'
                      }`}
                    >
                      All
                    </button>
                    <button
                      onClick={() => setAccountTypeFilter('external')}
                      className={`flex-1 px-3 py-2 text-sm font-medium rounded transition-colors ${
                        accountTypeFilter === 'external'
                          ? 'bg-white dark:bg-gray-600 text-gray-900 dark:text-white shadow-sm'
                          : 'text-gray-600 dark:text-gray-400'
                      }`}
                    >
                      External
                    </button>
                    <button
                      onClick={() => setAccountTypeFilter('internal')}
                      className={`flex-1 px-3 py-2 text-sm font-medium rounded transition-colors ${
                        accountTypeFilter === 'internal'
                          ? 'bg-white dark:bg-gray-600 text-gray-900 dark:text-white shadow-sm'
                          : 'text-gray-600 dark:text-gray-400'
                      }`}
                    >
                      Internal
                    </button>
                  </div>
                </div>

                {/* Search */}
                <div className="flex-1">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Search
                  </label>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                    <input
                      type="text"
                      placeholder="Search by path, address, name..."
                      value={searchPath}
                      onChange={e => setSearchPath(e.target.value)}
                      className="w-full pl-10 pr-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>
                </div>
              </div>

              {/* Right side - Create More Button */}
              <div className="flex items-end">
                <button
                  onClick={handleCreateMoreAccounts}
                  disabled={isLoading}
                  className="flex items-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  <Plus className="w-4 h-4" />
                  <span>Create More</span>
                </button>
              </div>
            </div>
          </div>

          {/* Accounts List */}
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 dark:bg-gray-900/50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Account
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Derivation Path
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Address
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                {filteredAccounts.length === 0 ? (
                  <tr>
                    <td
                      colSpan={4}
                      className="px-6 py-8 text-center text-gray-500 dark:text-gray-400"
                    >
                      {accounts.length === 0 ? (
                        <div>
                          <AlertCircle className="w-8 h-8 mx-auto mb-2 text-gray-400" />
                          <p>
                            No{' '}
                            {accountTypeFilter === 'internal'
                              ? 'internal'
                              : accountTypeFilter === 'external'
                                ? 'external'
                                : ''}{' '}
                            accounts available.
                          </p>
                          <button
                            onClick={handleCreateMoreAccounts}
                            className="mt-2 text-blue-600 hover:text-blue-700 text-sm"
                          >
                            Create some accounts
                          </button>
                        </div>
                      ) : (
                        'No accounts found matching your search criteria'
                      )}
                    </td>
                  </tr>
                ) : (
                  filteredAccounts.map(account => (
                    <tr
                      key={`${account.address}-${account.index}`}
                      className={`hover:bg-gray-50 dark:hover:bg-gray-700/50 ${
                        account.isActive ? 'bg-blue-50 dark:bg-blue-900/20' : ''
                      }`}
                    >
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center">
                          <div
                            className={`flex-shrink-0 h-8 w-8 rounded-full flex items-center justify-center ${
                              account.isActive
                                ? 'bg-blue-100 dark:bg-blue-900/40'
                                : 'bg-gray-100 dark:bg-gray-700'
                            }`}
                          >
                            {account.isActive ? (
                              <Star className="w-4 h-4 text-blue-600 dark:text-blue-400 fill-current" />
                            ) : (
                              <span className="text-sm font-medium text-gray-600 dark:text-gray-300">
                                {account.index}
                              </span>
                            )}
                          </div>
                          <div className="ml-3">
                            <div className="flex items-center space-x-2">
                              <div className="text-sm font-medium text-gray-900 dark:text-white">
                                {account.name}
                              </div>
                              {account.isActive && (
                                <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300">
                                  Active
                                </span>
                              )}
                            </div>
                            <div className="text-xs text-gray-500 dark:text-gray-400">
                              {account.type === 'internal' ? 'Internal' : 'External'} •{' '}
                              {COIN_TYPES[selectedCoin].name}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <code className="text-sm bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded text-gray-800 dark:text-gray-200">
                          {account.path}
                        </code>
                      </td>
                      <td className="px-6 py-4">
                        <div className="text-sm font-mono text-gray-900 dark:text-white break-all">
                          {account.address}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium space-x-2">
                        {!account.isActive && (
                          <button
                            onClick={() => handleSetActiveWallet(account)}
                            className="inline-flex items-center px-3 py-1.5 border border-transparent text-xs font-medium rounded text-blue-700 bg-blue-100 hover:bg-blue-200 dark:bg-blue-900/20 dark:text-blue-300 dark:hover:bg-blue-900/40 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                          >
                            <Star className="h-3 w-3 mr-1" />
                            Set Active
                          </button>
                        )}
                        <button
                          onClick={() => handleCopyAddress(account.address)}
                          className="inline-flex items-center px-3 py-1.5 border border-gray-300 dark:border-gray-600 text-xs font-medium rounded text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                        >
                          <Copy className="h-3 w-3 mr-1" />
                          {copiedAddress === account.address ? 'Copied!' : 'Copy'}
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Footer Info */}
          <div className="px-6 py-4 bg-gray-50 dark:bg-gray-900/50 rounded-b-lg">
            <div className="flex items-center justify-between text-sm text-gray-500 dark:text-gray-400">
              <p>
                Showing {filteredAccounts.length} of {accounts.length}{' '}
                {accountTypeFilter === 'all' ? '' : accountTypeFilter} accounts for{' '}
                {COIN_TYPES[selectedCoin].name}
              </p>
              {activeWallets[selectedCoin] && (
                <p className="flex items-center space-x-1">
                  <Star className="w-4 h-4 text-yellow-500 fill-current" />
                  <span>Active: {activeWallets[selectedCoin]?.name || 'Unknown'}</span>
                </p>
              )}
            </div>
          </div>
        </div>
      </div>
    </MainLayout>
  )
}
