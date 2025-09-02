'use client'

import React, { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useDeviceConnection, useDeviceStatus, useDeviceStore } from '@/store'
import { useWalletStore } from '@/store/walletStore'
import { Wifi, WifiOff, Shield, ShieldCheck, RefreshCw, Settings, Copy, Check, Wallet, Trash2, AlertTriangle } from 'lucide-react'
import { useDeviceEvents } from '@/hooks/useDeviceEvents'
import { WalletSetup } from '@/components/setup'

/**
 * Connection status indicator component
 */
function ConnectionStatus() {
  const { isConnected, isPaired, isPairingMode, deviceId } = useDeviceConnection()
  const { name, firmwareVersion } = useDeviceStatus()
  const { pairingCode, pairingStartTime, pairingTimeoutMs, syncStoreToDeviceManager } = useDeviceStore()
  const [pairingTimeRemaining, setPairingTimeRemaining] = useState(0)
  const [isCopied, setIsCopied] = useState(false)
  
  // Enable SSE connection for real-time updates from server
  // Connect to SSE when we have a device ID, regardless of connection status
  useDeviceEvents(deviceId || 'SD0001', true)
  
  // Sync store state to device manager when component mounts
  useEffect(() => {
    const currentDeviceId = deviceId || 'SD0001'
    console.log('[ConnectionStatus] Component mounted, syncing store to device manager for:', currentDeviceId)
    syncStoreToDeviceManager(currentDeviceId)
  }, [deviceId, syncStoreToDeviceManager])

  const formatFirmwareVersion = (version: Buffer) => {
    if (!version || version.length < 3) return 'Unknown'
    return `${version[2]}.${version[1]}.${version[0]}`
  }

  const getPairingTimeRemaining = () => {
    if (!isPairingMode || !pairingStartTime) return 0
    const elapsed = Date.now() - pairingStartTime
    const remaining = Math.max(0, pairingTimeoutMs - elapsed)
    return Math.ceil(remaining / 1000) // Return seconds
  }

  const handleCopyPairingCode = async () => {
    if (!pairingCode) return
    
    try {
      await navigator.clipboard.writeText(pairingCode)
      setIsCopied(true)
      setTimeout(() => setIsCopied(false), 2000) // Reset after 2 seconds
    } catch (err) {
      console.error('Failed to copy pairing code:', err)
    }
  }

  // Update pairing timer every second
  useEffect(() => {
    if (!isPairingMode) {
      setPairingTimeRemaining(0)
      return
    }

    const updateTimer = () => {
      setPairingTimeRemaining(getPairingTimeRemaining())
    }

    updateTimer() // Initial update
    const interval = setInterval(updateTimer, 1000)

    return () => clearInterval(interval)
  }, [isPairingMode, pairingStartTime, pairingTimeoutMs])

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
          Connection Status
        </h3>
        <div className="flex items-center space-x-2">
          <div className={`w-3 h-3 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'}`} />
          <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
            {isConnected ? 'Connected' : 'Disconnected'}
          </span>
        </div>
      </div>

      <div className="space-y-4">
        <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700 rounded-lg">
          <div className="flex items-center space-x-3">
            {isConnected ? (
              <Wifi className="w-5 h-5 text-green-500" />
            ) : (
              <WifiOff className="w-5 h-5 text-red-500" />
            )}
            <div>
              <p className="font-medium text-gray-900 dark:text-white">
                {isConnected ? 'Device Connected' : 'No Device Connected'}
              </p>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                {isConnected ? name : 'Connect to a Lattice1 device'}
              </p>
            </div>
          </div>
        </div>

        {isConnected && (
          <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700 rounded-lg">
            <div className="flex items-center space-x-3">
              {isPaired ? (
                <ShieldCheck className="w-5 h-5 text-blue-500" />
              ) : (
                <Shield className="w-5 h-5 text-yellow-500" />
              )}
              <div>
                <p className="font-medium text-gray-900 dark:text-white">
                  {isPaired ? 'Device Paired' : 'Device Not Paired'}
                </p>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  {isPaired ? 'Secure communication established' : 'Pairing required for secure communication'}
                </p>
              </div>
            </div>
          </div>
        )}

        {isPairingMode && pairingCode && (
          <div className="p-4 bg-blue-50 dark:bg-blue-900 border border-blue-200 dark:border-blue-700 rounded-lg">
            <div className="text-center">
              <h4 className="text-lg font-semibold text-blue-900 dark:text-blue-100 mb-2">
                Pairing Mode Active
              </h4>
              <div className="mb-3">
                <div className="flex items-center justify-center space-x-3">
                  <div className="text-3xl font-mono font-bold text-blue-800 dark:text-blue-200 tracking-wider">
                    {pairingCode}
                  </div>
                  <button
                    onClick={handleCopyPairingCode}
                    className="p-2 rounded-lg bg-blue-100 hover:bg-blue-200 dark:bg-blue-800 dark:hover:bg-blue-700 transition-colors"
                    title={isCopied ? 'Copied!' : 'Copy pairing code'}
                  >
                    {isCopied ? (
                      <Check className="w-5 h-5 text-green-600 dark:text-green-400" />
                    ) : (
                      <Copy className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                    )}
                  </button>
                </div>
                <p className="text-sm text-blue-700 dark:text-blue-300 mt-1">
                  Enter this code in your application
                </p>
              </div>
              <div className="text-sm text-blue-600 dark:text-blue-400">
                Time remaining: {pairingTimeRemaining}s
              </div>
            </div>
          </div>
        )}


        {isConnected && (
          <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700 rounded-lg">
            <div className="flex items-center space-x-3">
              <Settings className="w-5 h-5 text-gray-500" />
              <div>
                <p className="font-medium text-gray-900 dark:text-white">Firmware Version</p>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  v{formatFirmwareVersion(firmwareVersion)}
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

/**
 * Connection info component - displays current connection status and device setup
 * Connections and pairing are handled via API calls from lattice-manager
 */
function ConnectionInfo() {
  const router = useRouter()
  const { isConnected, deviceId } = useDeviceConnection()
  const { resetDeviceState } = useDeviceStore()
  const { isInitialized: walletsInitialized, clearWallets } = useWalletStore()
  const [isResetting, setIsResetting] = useState(false)
  const [showWalletSetup, setShowWalletSetup] = useState(false)
  const [showResetConfirm, setShowResetConfirm] = useState(false)
  const [isResettingDevice, setIsResettingDevice] = useState(false)

  const handleResetConnectionState = async () => {
    setIsResetting(true)
    try {
      await resetDeviceState()
      console.log('[ConnectionInfo] Device state reset successfully')
    } catch (error) {
      console.error('[ConnectionInfo] Error resetting device state:', error)
    } finally {
      setIsResetting(false)
    }
  }

  const handleResetDevice = async () => {
    setIsResettingDevice(true)
    try {
      // Clear all wallet data
      clearWallets()
      console.log('[ConnectionInfo] Device wallets reset successfully')
      
      // Close the confirmation dialog
      setShowResetConfirm(false)
      
      // Optionally also reset connection state
      // await resetDeviceState()
      
    } catch (error) {
      console.error('[ConnectionInfo] Error resetting device:', error)
    } finally {
      setIsResettingDevice(false)
    }
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
      <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
        Connection Info
      </h3>

      <div className="space-y-3">
        <div className="p-3 bg-gray-50 dark:bg-gray-700 rounded-lg">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Current Device ID:</span>
            <span className="text-sm font-mono text-gray-900 dark:text-white">{deviceId}</span>
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Connections are initiated by lattice-manager via API calls
          </p>
        </div>

        {/* Wallet Initialization Status */}
        <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700 rounded-lg">
          <div 
            className={`flex items-center space-x-3 flex-1 ${
              walletsInitialized ? 'cursor-pointer hover:opacity-75 transition-opacity' : ''
            }`}
            onClick={walletsInitialized ? () => router.push('/wallets') : undefined}
          >
            {walletsInitialized ? (
              <Wallet className="w-5 h-5 text-green-500" />
            ) : (
              <Wallet className="w-5 h-5 text-orange-500" />
            )}
            <div>
              <p className={`font-medium text-gray-900 dark:text-white ${
                walletsInitialized ? 'hover:text-blue-600 dark:hover:text-blue-400' : ''
              }`}>
                {walletsInitialized ? 'Wallets Initialized' : 'Wallets Not Initialized'}
              </p>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                {walletsInitialized ? 'HD wallets ready for use • Click to manage' : 'Setup required to generate wallet accounts'}
              </p>
            </div>
          </div>
          <div className="flex space-x-2">
            {!walletsInitialized ? (
              <button
                onClick={() => setShowWalletSetup(true)}
                className="px-3 py-1.5 bg-orange-600 text-white text-sm rounded-lg hover:bg-orange-700 transition-colors"
              >
                Setup
              </button>
            ) : (
              <button
                onClick={() => setShowResetConfirm(true)}
                className="flex items-center space-x-1 px-3 py-1.5 bg-red-600 text-white text-sm rounded-lg hover:bg-red-700 transition-colors"
              >
                <Trash2 className="w-3 h-3" />
                <span>Reset Device</span>
              </button>
            )}
          </div>
        </div>

        {/* Wallet Setup Modal/Overlay */}
        {showWalletSetup && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white dark:bg-gray-800 rounded-lg max-w-4xl max-h-[90vh] overflow-y-auto m-4">
              <div className="sticky top-0 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-6 py-4 flex items-center justify-between">
                <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
                  Device Wallet Setup
                </h2>
                <button
                  onClick={() => setShowWalletSetup(false)}
                  className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              <WalletSetup 
                onSetupComplete={() => {
                  setShowWalletSetup(false)
                  // Force a re-render to show updated wallet status
                }}
              />
            </div>
          </div>
        )}

        {/* Reset Device Confirmation Dialog */}
        {showResetConfirm && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white dark:bg-gray-800 rounded-lg max-w-md m-4 p-6">
              <div className="flex items-center space-x-3 mb-4">
                <div className="flex-shrink-0">
                  <AlertTriangle className="w-8 h-8 text-red-500" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                    Reset Device
                  </h3>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    This action cannot be undone
                  </p>
                </div>
              </div>
              
              <div className="mb-6">
                <p className="text-gray-700 dark:text-gray-300 mb-4">
                  Are you sure you want to reset this device? This will:
                </p>
                <ul className="list-disc list-inside text-sm text-gray-600 dark:text-gray-400 space-y-1">
                  <li>Clear all initialized wallet accounts</li>
                  <li>Remove all generated addresses and keys</li>
                  <li>Reset the device to factory settings</li>
                  <li>Require wallet setup to be run again</li>
                </ul>
              </div>

              <div className="flex space-x-3">
                <button
                  onClick={() => setShowResetConfirm(false)}
                  className="flex-1 px-4 py-2 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300 transition-colors dark:bg-gray-600 dark:text-gray-200 dark:hover:bg-gray-500"
                >
                  Cancel
                </button>
                <button
                  onClick={handleResetDevice}
                  disabled={isResettingDevice}
                  className="flex-1 flex items-center justify-center space-x-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {isResettingDevice ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>Resetting...</span>
                    </>
                  ) : (
                    <>
                      <Trash2 className="w-4 h-4" />
                      <span>Reset Device</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}
        
        {isConnected && (
          <button
            onClick={handleResetConnectionState}
            disabled={isResetting}
            className="w-full flex items-center justify-center space-x-2 px-4 py-3 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isResetting ? (
              <RefreshCw className="w-4 h-4 animate-spin" />
            ) : (
              <WifiOff className="w-4 h-4" />
            )}
            <span>{isResetting ? 'Resetting...' : 'Reset Connection State'}</span>
          </button>
        )}
      </div>
    </div>
  )
}

/**
 * Connection settings component
 */
function ConnectionSettings() {
  const { deviceId } = useDeviceConnection()
  const { setDeviceInfo } = useDeviceStore()
  const [autoConnect, setAutoConnect] = useState(false)
  const [autoPair, setAutoPair] = useState(false)
  const [connectionTimeout, setConnectionTimeout] = useState(30)
  const [deviceIdInput, setDeviceIdInput] = useState(deviceId || 'SD0001')
  const [isSaving, setIsSaving] = useState(false)

  const handleSaveDeviceId = async () => {
    setIsSaving(true)
    try {
      setDeviceInfo({ deviceId: deviceIdInput })
      // You could also save to localStorage or make an API call here
    } catch (error) {
      console.error('Failed to save device ID:', error)
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
      <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
        Connection Settings
      </h3>

      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Device ID
          </label>
          <div className="flex space-x-2">
            <input
              type="text"
              value={deviceIdInput}
              onChange={(e) => setDeviceIdInput(e.target.value)}
              placeholder="Enter device ID"
              className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white"
            />
            <button
              onClick={handleSaveDeviceId}
              disabled={isSaving || deviceIdInput === deviceId}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {isSaving ? 'Saving...' : 'Save'}
            </button>
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            Unique identifier for this device simulator
          </p>
        </div>

        <div className="flex items-center justify-between">
          <div>
            <p className="font-medium text-gray-900 dark:text-white">Auto-connect</p>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Automatically connect when device is available
            </p>
          </div>
          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={autoConnect}
              onChange={(e) => setAutoConnect(e.target.checked)}
              className="sr-only peer"
            />
            <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 dark:peer-focus:ring-blue-800 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-blue-600"></div>
          </label>
        </div>

        <div className="flex items-center justify-between">
          <div>
            <p className="font-medium text-gray-900 dark:text-white">Auto-pair</p>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Automatically pair after connection
            </p>
          </div>
          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={autoPair}
              onChange={(e) => setAutoPair(e.target.checked)}
              className="sr-only peer"
            />
            <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 dark:peer-focus:ring-blue-800 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-blue-600"></div>
          </label>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Connection Timeout (seconds)
          </label>
          <input
            type="number"
            min="5"
            max="120"
            value={connectionTimeout}
            onChange={(e) => setConnectionTimeout(Number(e.target.value))}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white"
          />
        </div>
      </div>
    </div>
  )
}

/**
 * Main Connection Panel component
 */
export function ConnectionPanel() {
  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
          Device Connection
        </h2>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="space-y-6">
          <ConnectionStatus />
          <ConnectionInfo />
        </div>
        <div>
          <ConnectionSettings />
        </div>
      </div>
    </div>
  )
}
