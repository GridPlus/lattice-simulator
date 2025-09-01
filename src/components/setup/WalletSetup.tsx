'use client'

import React, { useState, useEffect } from 'react'
import { useWalletStore } from '@/store/walletStore'
import { getWalletConfig } from '@/lib/walletConfig'
import { Wallet, Eye, EyeOff, RefreshCw, CheckCircle, AlertCircle } from 'lucide-react'

interface WalletSetupProps {
  onSetupComplete?: () => void
}

export function WalletSetup({ onSetupComplete }: WalletSetupProps) {
  const { initializeWallets, isInitialized, isLoading, error, clearError } = useWalletStore()
  const [mnemonic, setMnemonic] = useState('')
  const [showMnemonic, setShowMnemonic] = useState(false)
  const [isCustomMnemonic, setIsCustomMnemonic] = useState(false)
  const [defaultMnemonic, setDefaultMnemonic] = useState('')
  const [setupStep, setSetupStep] = useState<'input' | 'generating' | 'complete' | 'error'>('input')

  // Load default mnemonic on component mount
  useEffect(() => {
    const loadDefaultMnemonic = async () => {
      try {
        const config = await getWalletConfig()
        const defaultPhrase = config.mnemonic
        setDefaultMnemonic(defaultPhrase)
        setMnemonic(defaultPhrase)
      } catch (err) {
        console.error('Failed to load default mnemonic:', err)
        setSetupStep('error')
      }
    }

    loadDefaultMnemonic()
  }, [])

  // Clear error when component mounts or mnemonic changes
  useEffect(() => {
    if (error) {
      clearError()
    }
  }, [mnemonic, clearError])

  // Handle wallet initialization
  const handleInitializeWallets = async () => {
    if (!mnemonic.trim()) {
      return
    }

    try {
      setSetupStep('generating')
      clearError()

      // If using custom mnemonic, update the wallet config
      if (isCustomMnemonic && mnemonic !== defaultMnemonic) {
        // We could save this to localStorage or update env var here
        console.log('[WalletSetup] Using custom mnemonic for wallet generation')
      }

      await initializeWallets()
      
      setSetupStep('complete')
      
      // Call completion callback after a brief delay to show success
      setTimeout(() => {
        onSetupComplete?.()
      }, 2000)

    } catch (err) {
      console.error('[WalletSetup] Failed to initialize wallets:', err)
      setSetupStep('error')
    }
  }

  // Toggle between default and custom mnemonic
  const handleMnemonicTypeChange = (useCustom: boolean) => {
    setIsCustomMnemonic(useCustom)
    if (!useCustom) {
      setMnemonic(defaultMnemonic)
    } else {
      setMnemonic('')
    }
  }

  // Validate mnemonic (basic check for 24 words)
  const validateMnemonic = (phrase: string) => {
    const words = phrase.trim().split(/\s+/)
    return words.length === 24 && words.every(word => word.length > 0)
  }

  const isValidMnemonic = validateMnemonic(mnemonic)

  if (isInitialized) {
    return (
      <div className="max-w-2xl mx-auto p-6">
        <div className="text-center">
          <CheckCircle className="w-16 h-16 text-green-500 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
            Wallets Already Initialized
          </h2>
          <p className="text-gray-600 dark:text-gray-400 mb-6">
            Your wallets have already been set up and are ready to use.
          </p>
          <button
            onClick={onSetupComplete}
            className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            Continue to Wallets
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-2xl mx-auto p-6">
      <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-8">
        
        {/* Header */}
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-blue-100 dark:bg-blue-900/20 rounded-full flex items-center justify-center mx-auto mb-4">
            <Wallet className="w-8 h-8 text-blue-600 dark:text-blue-400" />
          </div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
            Wallet Setup
          </h2>
          <p className="text-gray-600 dark:text-gray-400">
            Initialize your HD wallet with a 24-word mnemonic phrase
          </p>
        </div>

        {setupStep === 'input' && (
          <div className="space-y-6">
            {/* Mnemonic Type Selection */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
                Choose mnemonic source:
              </label>
              <div className="space-y-3">
                <label className="flex items-center">
                  <input
                    type="radio"
                    name="mnemonicType"
                    checked={!isCustomMnemonic}
                    onChange={() => handleMnemonicTypeChange(false)}
                    className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 dark:border-gray-600"
                  />
                  <span className="ml-2 text-gray-900 dark:text-white">
                    Use default mnemonic (recommended for testing)
                  </span>
                </label>
                <label className="flex items-center">
                  <input
                    type="radio"
                    name="mnemonicType"
                    checked={isCustomMnemonic}
                    onChange={() => handleMnemonicTypeChange(true)}
                    className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 dark:border-gray-600"
                  />
                  <span className="ml-2 text-gray-900 dark:text-white">
                    Enter custom mnemonic
                  </span>
                </label>
              </div>
            </div>

            {/* Mnemonic Input */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                  24-word mnemonic phrase
                </label>
                <button
                  type="button"
                  onClick={() => setShowMnemonic(!showMnemonic)}
                  className="text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 flex items-center space-x-1"
                >
                  {showMnemonic ? (
                    <>
                      <EyeOff className="w-4 h-4" />
                      <span>Hide</span>
                    </>
                  ) : (
                    <>
                      <Eye className="w-4 h-4" />
                      <span>Show</span>
                    </>
                  )}
                </button>
              </div>
              
              <textarea
                value={mnemonic}
                onChange={(e) => setMnemonic(e.target.value)}
                disabled={!isCustomMnemonic}
                placeholder="Enter your 24-word mnemonic phrase..."
                className={`w-full h-32 px-3 py-2 border rounded-lg text-sm font-mono resize-none
                  ${showMnemonic ? '' : 'text-security-disc'}
                  ${isCustomMnemonic ? 
                    'border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white' : 
                    'border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-600 dark:text-gray-400'
                  }
                  focus:ring-2 focus:ring-blue-500 focus:border-blue-500
                `}
              />
              
              {/* Validation feedback */}
              <div className="mt-2 flex items-center space-x-2 text-sm">
                {isValidMnemonic ? (
                  <>
                    <CheckCircle className="w-4 h-4 text-green-500" />
                    <span className="text-green-600 dark:text-green-400">
                      Valid 24-word mnemonic
                    </span>
                  </>
                ) : mnemonic.trim() ? (
                  <>
                    <AlertCircle className="w-4 h-4 text-red-500" />
                    <span className="text-red-600 dark:text-red-400">
                      Please enter exactly 24 words
                    </span>
                  </>
                ) : null}
              </div>
            </div>

            {/* Warning for custom mnemonic */}
            {isCustomMnemonic && (
              <div className="p-4 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg">
                <div className="flex items-start space-x-3">
                  <AlertCircle className="w-5 h-5 text-yellow-600 dark:text-yellow-400 mt-0.5" />
                  <div>
                    <h4 className="font-medium text-yellow-800 dark:text-yellow-200">
                      Security Notice
                    </h4>
                    <p className="text-sm text-yellow-700 dark:text-yellow-300 mt-1">
                      Only use mnemonics you trust. Never share your mnemonic phrase with anyone.
                      This simulator is for development and testing purposes only.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Error display */}
            {error && (
              <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                <div className="flex items-start space-x-3">
                  <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400 mt-0.5" />
                  <div>
                    <h4 className="font-medium text-red-800 dark:text-red-200">
                      Setup Error
                    </h4>
                    <p className="text-sm text-red-700 dark:text-red-300 mt-1">
                      {error}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Action buttons */}
            <div className="flex space-x-4 pt-4">
              <button
                onClick={handleInitializeWallets}
                disabled={!isValidMnemonic || isLoading}
                className="flex-1 flex items-center justify-center space-x-2 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {isLoading ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Generating Wallets...</span>
                  </>
                ) : (
                  <>
                    <Wallet className="w-4 h-4" />
                    <span>Initialize Wallets</span>
                  </>
                )}
              </button>
            </div>
          </div>
        )}

        {setupStep === 'generating' && (
          <div className="text-center py-8">
            <RefreshCw className="w-16 h-16 text-blue-500 mx-auto mb-4 animate-spin" />
            <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
              Generating Wallets
            </h3>
            <p className="text-gray-600 dark:text-gray-400">
              Creating HD wallet accounts from your mnemonic...
            </p>
          </div>
        )}

        {setupStep === 'complete' && (
          <div className="text-center py-8">
            <CheckCircle className="w-16 h-16 text-green-500 mx-auto mb-4" />
            <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
              Wallets Created Successfully!
            </h3>
            <p className="text-gray-600 dark:text-gray-400 mb-4">
              Generated accounts for ETH, BTC, and SOL with external and internal addresses
            </p>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Redirecting to wallet management...
            </p>
          </div>
        )}

        {setupStep === 'error' && (
          <div className="text-center py-8">
            <AlertCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
            <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
              Setup Failed
            </h3>
            <p className="text-gray-600 dark:text-gray-400 mb-4">
              {error || 'An error occurred during wallet setup'}
            </p>
            <button
              onClick={() => setSetupStep('input')}
              className="px-6 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors"
            >
              Try Again
            </button>
          </div>
        )}

      </div>
    </div>
  )
}