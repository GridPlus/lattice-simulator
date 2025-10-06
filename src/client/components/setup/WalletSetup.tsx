'use client'

import { Wallet, Eye, EyeOff, RefreshCw, CheckCircle, AlertCircle } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'
import { useWalletStore } from '@/client/store/clientWalletStore'
import { SIMULATOR_CONSTANTS } from '@/shared/constants'
import { getWalletConfig, normalizeMnemonic, validateMnemonic } from '@/shared/walletConfig'

interface WalletSetupProps {
  onSetupComplete?: () => void
}

export function WalletSetup({ onSetupComplete }: WalletSetupProps) {
  const router = useRouter()
  const { initializeWallets, isInitialized, isLoading, error, clearError, setActiveMnemonic } =
    useWalletStore()

  const [mnemonic, setMnemonic] = useState('')
  const [showMnemonic, setShowMnemonic] = useState(false)
  const [isCustomMnemonic, setIsCustomMnemonic] = useState(false)
  const [defaultMnemonic, setDefaultMnemonic] = useState('')
  const [setupStep, setSetupStep] = useState<'input' | 'generating' | 'complete' | 'error'>('input')

  useEffect(() => {
    const loadMnemonic = async () => {
      try {
        const config = await getWalletConfig()
        const defaultPhrase = normalizeMnemonic(SIMULATOR_CONSTANTS.DEFAULT_MNEMONIC)
        setDefaultMnemonic(defaultPhrase)

        if (config.isDefault) {
          setMnemonic(defaultPhrase)
          setIsCustomMnemonic(false)
        } else {
          setMnemonic(config.mnemonic)
          setIsCustomMnemonic(true)
        }
      } catch (loadError) {
        console.error('Failed to load default mnemonic:', loadError)
        setSetupStep('error')
      }
    }

    loadMnemonic()
  }, [])

  useEffect(() => {
    if (error) {
      clearError()
    }
  }, [mnemonic, error, clearError])

  const normalizedMnemonic = useMemo(() => normalizeMnemonic(mnemonic), [mnemonic])

  const isValidMnemonic = useMemo(
    () => (normalizedMnemonic ? validateMnemonic(normalizedMnemonic) : false),
    [normalizedMnemonic],
  )

  const handleInitializeWallets = async () => {
    if (!normalizedMnemonic) {
      return
    }

    try {
      setSetupStep('generating')
      clearError()

      if (isCustomMnemonic && normalizedMnemonic !== defaultMnemonic) {
        console.log('[WalletSetup] Using custom mnemonic for wallet generation')
      }

      if (!validateMnemonic(normalizedMnemonic)) {
        throw new Error('Invalid mnemonic provided')
      }

      setActiveMnemonic(normalizedMnemonic)
      await initializeWallets()

      setSetupStep('complete')
      setTimeout(() => {
        onSetupComplete?.()
      }, 2000)
    } catch (initError) {
      console.error('[WalletSetup] Failed to initialize wallets:', initError)
      setSetupStep('error')
    }
  }

  const handleMnemonicTypeChange = (useCustom: boolean) => {
    setIsCustomMnemonic(useCustom)
    setMnemonic(useCustom ? '' : defaultMnemonic)
  }

  const restoreDefaultMnemonic = () => {
    setMnemonic(defaultMnemonic)
    setIsCustomMnemonic(false)
  }

  const renderValidationState = () => {
    if (!isCustomMnemonic || !normalizedMnemonic) {
      return null
    }

    if (isValidMnemonic) {
      return (
        <div className="mt-2 flex items-center text-green-600 dark:text-green-400 text-sm">
          <CheckCircle className="w-4 h-4 mr-1" />
          Valid mnemonic phrase
        </div>
      )
    }

    return (
      <div className="mt-2 flex items-center text-red-600 dark:text-red-400 text-sm">
        <AlertCircle className="w-4 h-4 mr-1" />
        Please enter a valid 12 or 24-word mnemonic phrase
      </div>
    )
  }

  const renderInputStep = () => (
    <div className="space-y-6">
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
            <span className="ml-2 text-gray-900 dark:text-white">Enter custom mnemonic</span>
          </label>
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
            Mnemonic phrase (12 or 24 words)
          </label>
          <button
            type="button"
            onClick={() => setShowMnemonic(show => !show)}
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
          onChange={event => setMnemonic(event.target.value)}
          disabled={!isCustomMnemonic}
          placeholder="Enter your 12 or 24-word mnemonic phrase..."
          className={`w-full h-32 px-3 py-2 border rounded-lg text-sm font-mono resize-none ${
            showMnemonic ? '' : 'text-security-disc'
          } ${
            isCustomMnemonic
              ? 'border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white'
              : 'border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-600 dark:text-gray-400'
          } focus:ring-2 focus:ring-blue-500 focus:border-blue-500`}
        />

        {!isCustomMnemonic && (
          <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
            The default mnemonic is provided for local testing. Switch to "Enter custom mnemonic" to
            paste your own.
          </p>
        )}

        {renderValidationState()}
      </div>

      {isCustomMnemonic && (
        <div className="p-4 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg">
          <div className="flex">
            <AlertCircle className="w-5 h-5 text-yellow-500 dark:text-yellow-400 mr-3" />
            <div className="text-sm text-yellow-700 dark:text-yellow-200">
              Only use mnemonics you trust. Never share your mnemonic phrase with anyone.
            </div>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={restoreDefaultMnemonic}
          className="inline-flex items-center px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm text-sm font-medium text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700"
        >
          <RefreshCw className="-ml-0.5 mr-2 h-4 w-4 text-gray-500" />
          Restore default mnemonic
        </button>
        <button
          type="button"
          onClick={handleInitializeWallets}
          disabled={isLoading || (isCustomMnemonic && !isValidMnemonic)}
          className={`px-4 py-2 rounded-md text-sm font-medium text-white transition-colors ${
            isLoading || (isCustomMnemonic && !isValidMnemonic)
              ? 'bg-blue-300 cursor-not-allowed'
              : 'bg-blue-600 hover:bg-blue-700'
          }`}
        >
          {isLoading ? 'Generating wallets...' : 'Generate wallets'}
        </button>
      </div>
    </div>
  )

  const renderGeneratingStep = () => (
    <div className="text-center py-10">
      <div className="flex justify-center mb-4">
        <svg
          className="animate-spin -ml-1 mr-3 h-6 w-6 text-blue-600"
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
        >
          <circle
            className="opacity-25"
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            strokeWidth="4"
          ></circle>
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path>
        </svg>
      </div>
      <p className="text-gray-600 dark:text-gray-400">
        Creating HD wallet accounts from your mnemonic...
      </p>
    </div>
  )

  const renderErrorStep = () => (
    <div className="text-center py-10">
      <div className="flex justify-center mb-4">
        <AlertCircle className="w-8 h-8 text-red-600" />
      </div>
      <p className="text-red-600 dark:text-red-400 mb-3">
        {error || 'Failed to initialize wallets. Please check the mnemonic and try again.'}
      </p>
      <button
        onClick={() => {
          clearError()
          setSetupStep('input')
        }}
        className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
      >
        Try again
      </button>
    </div>
  )

  if (isInitialized) {
    const handleContinue = () => {
      onSetupComplete?.()
      router.push('/wallets')
    }

    return (
      <div className="max-w-2xl mx-auto p-6">
        <div className="text-center">
          <CheckCircle className="w-16 h-16 text-green-500 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
            Wallets Initialized Successfully
          </h2>
          <p className="text-gray-600 dark:text-gray-400 mb-6">
            Your HD wallets have been set up and are ready to use.
          </p>
          <button
            onClick={handleContinue}
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
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-blue-100 dark:bg-blue-900/20 rounded-full flex items-center justify-center mx-auto mb-4">
            <Wallet className="w-8 h-8 text-blue-600 dark:text-blue-400" />
          </div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">Wallet Setup</h2>
          <p className="text-gray-600 dark:text-gray-400">
            Initialize your HD wallet with a mnemonic phrase
          </p>
        </div>

        {setupStep === 'input' && renderInputStep()}
        {setupStep === 'generating' && renderGeneratingStep()}
        {setupStep === 'error' && renderErrorStep()}
      </div>
    </div>
  )
}
