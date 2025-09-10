'use client'

/**
 * Header Component for Lattice1 Device Simulator
 *
 * Displays device information, firmware version, and quick action buttons.
 */

import { Lock, Unlock, Power, Settings } from 'lucide-react'
import React from 'react'
import { useDeviceStatus } from '@/client/store'
import { formatFirmwareVersion } from '@/utils/protocol'

/**
 * Header component with device information and controls
 *
 * @returns Header with device info and quick action buttons
 */
export function Header() {
  const { isLocked, firmwareVersion, name } = useDeviceStatus()

  return (
    <header className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          {/* Device Info */}
          <div className="flex items-center space-x-4">
            <div className="flex items-center space-x-3">
              <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
                <span className="text-white font-semibold text-sm">L</span>
              </div>
              <div>
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white">{name}</h2>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  v{formatFirmwareVersion(firmwareVersion)}
                </p>
              </div>
            </div>
          </div>

          {/* Quick Actions */}
          <div className="flex items-center space-x-2">
            {/* Lock/Unlock Button */}
            <button
              className={`p-2 rounded-lg transition-colors ${
                isLocked
                  ? 'bg-red-100 text-red-600 hover:bg-red-200 dark:bg-red-900/20 dark:text-red-400'
                  : 'bg-green-100 text-green-600 hover:bg-green-200 dark:bg-green-900/20 dark:text-green-400'
              }`}
              title={isLocked ? 'Unlock Device' : 'Lock Device'}
            >
              {isLocked ? <Unlock className="w-4 h-4" /> : <Lock className="w-4 h-4" />}
            </button>

            {/* Power Button */}
            <button
              className="p-2 rounded-lg bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600 transition-colors"
              title="Power Off"
            >
              <Power className="w-4 h-4" />
            </button>

            {/* Settings Button */}
            <button
              className="p-2 rounded-lg bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600 transition-colors"
              title="Settings"
            >
              <Settings className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </header>
  )
}
