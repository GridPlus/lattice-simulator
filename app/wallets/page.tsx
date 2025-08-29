'use client'

import React, { useState, useMemo } from 'react'
import { MainLayout } from '@/components/layout'
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@radix-ui/react-select'
import { Search, Copy, ChevronDown } from 'lucide-react'

type CoinType = 'BTC' | 'ETH' | 'SOL'

interface WalletAccount {
  index: number
  path: string
  address: string
  publicKey: string
}

const COIN_TYPES = {
  BTC: { name: 'Bitcoin', purpose: 44, coinType: 0 },
  ETH: { name: 'Ethereum', purpose: 44, coinType: 60 },
  SOL: { name: 'Solana', purpose: 44, coinType: 501 },
}

function generateMockAddress(coinType: CoinType, accountIndex: number): WalletAccount {
  const { purpose, coinType: coin } = COIN_TYPES[coinType]
  const path = `m/${purpose}'/${coin}'/${accountIndex}'/0/0`
  
  let address: string
  let publicKey: string
  
  switch (coinType) {
    case 'BTC':
      // Generate a proper Bitcoin address (P2PKH format starting with '1')
      const btcHex = Array.from({length: 25}, () => Math.floor(Math.random() * 16).toString(16)).join('')
      address = `1${btcHex.substring(0, 33)}`
      publicKey = `02${Array.from({length: 32}, () => Math.floor(Math.random() * 16).toString(16)).join('')}`
      break
    case 'ETH':
      // Generate a proper Ethereum address (40 hex characters)
      address = `0x${Array.from({length: 40}, () => Math.floor(Math.random() * 16).toString(16)).join('')}`
      publicKey = `04${Array.from({length: 128}, () => Math.floor(Math.random() * 16).toString(16)).join('')}`
      break
    case 'SOL':
      // Generate a proper Solana address (base58, ~44 characters)
      const chars = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'
      address = Array.from({length: 44}, () => chars[Math.floor(Math.random() * chars.length)]).join('')
      publicKey = Array.from({length: 64}, () => Math.floor(Math.random() * 16).toString(16)).join('')
      break
  }
  
  return {
    index: accountIndex,
    path,
    address,
    publicKey,
  }
}

export default function WalletsPage() {
  const [selectedCoin, setSelectedCoin] = useState<CoinType>('ETH')
  const [searchPath, setSearchPath] = useState('')
  const [copiedAddress, setCopiedAddress] = useState<string | null>(null)

  const accounts = useMemo(() => {
    return Array.from({ length: 10 }, (_, i) => 
      generateMockAddress(selectedCoin, i)
    )
  }, [selectedCoin])

  const filteredAccounts = useMemo(() => {
    if (!searchPath.trim()) return accounts
    
    return accounts.filter(account => 
      account.path.toLowerCase().includes(searchPath.toLowerCase()) ||
      account.index.toString().includes(searchPath)
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

  return (
    <MainLayout>
      <div className="p-6">
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
            Wallet Accounts
          </h1>
          <p className="text-gray-600 dark:text-gray-400">
            View and manage your cryptocurrency wallet accounts across different chains
          </p>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700">
          {/* Header Controls */}
          <div className="p-6 border-b border-gray-200 dark:border-gray-700">
            <div className="flex flex-col sm:flex-row gap-4">
              {/* Coin Type Selector */}
              <div className="flex-1">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Coin Type
                </label>
                <Select value={selectedCoin} onValueChange={(value: CoinType) => setSelectedCoin(value)}>
                  <SelectTrigger className="w-full flex items-center justify-between h-10 px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100">
                    <SelectValue placeholder="Select coin type">
                      <span className="flex items-center">
                        {COIN_TYPES[selectedCoin].name} ({selectedCoin})
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
                        {name} ({key})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Search by Derivation Path */}
              <div className="flex-1">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Search by Path or Account Index
                </label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <input
                    type="text"
                    placeholder="e.g., m/44'/60'/0'/0/0 or 0"
                    value={searchPath}
                    onChange={(e) => setSearchPath(e.target.value)}
                    className="w-full pl-10 pr-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
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
                    <td colSpan={4} className="px-6 py-4 text-center text-gray-500 dark:text-gray-400">
                      No accounts found matching your search criteria
                    </td>
                  </tr>
                ) : (
                  filteredAccounts.map((account) => (
                    <tr key={account.index} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center">
                          <div className="flex-shrink-0 h-8 w-8 bg-blue-100 dark:bg-blue-900/20 rounded-full flex items-center justify-center">
                            <span className="text-sm font-medium text-blue-700 dark:text-blue-300">
                              {account.index}
                            </span>
                          </div>
                          <div className="ml-3">
                            <div className="text-sm font-medium text-gray-900 dark:text-white">
                              Account {account.index}
                            </div>
                            <div className="text-xs text-gray-500 dark:text-gray-400">
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
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
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
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Showing {filteredAccounts.length} of {accounts.length} accounts for {COIN_TYPES[selectedCoin].name}
            </p>
          </div>
        </div>
      </div>
    </MainLayout>
  )
}