'use client'

/**
 * Main Layout Component for Lattice1 Device Simulator
 * 
 * Provides the overall application structure with header, sidebar,
 * and main content area. Handles responsive design and navigation.
 */

import React from 'react'
import { useDeviceConnection, useDeviceStatus } from '@/client/store'
import { Header } from '@/client/components/layout/Header'
import { Sidebar } from '@/client/components/layout/Sidebar'
import { useClientStateSync } from '@/client/hooks/useClientServerStateSync'

interface MainLayoutProps {
  children: React.ReactNode
}

/**
 * Main layout component that wraps the entire application
 * 
 * @param children - Child components to render in the main content area
 * @returns Main layout with header, sidebar, and content area
 */
export function MainLayout({ children }: MainLayoutProps) {
  const { isConnected, isPaired } = useDeviceConnection()
  const { isLocked, isBusy } = useDeviceStatus()
  
  // Sync client state to server on page load
  useClientStateSync()

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* Header */}
      <Header />
      
      <div className="flex">
        {/* Sidebar */}
        <Sidebar />
        
        {/* Main Content */}
        <main className="flex-1 p-6">
          <div className="max-w-7xl mx-auto">
            {/* Status Bar */}
            <div className="mb-6 flex items-center justify-between">
              <div className="flex items-center space-x-4">
                <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
                  Lattice1 Device Simulator
                </h1>
                
                {/* Connection Status */}
                <div className="flex items-center space-x-2">
                  <div className={`w-3 h-3 rounded-full ${
                    isConnected ? 'bg-green-500' : 'bg-red-500'
                  }`} />
                  <span className="text-sm text-gray-600 dark:text-gray-400">
                    {isConnected ? 'Connected' : 'Disconnected'}
                  </span>
                </div>
                
                {/* Pairing Status */}
                {isConnected && (
                  <div className="flex items-center space-x-2">
                    <div className={`w-3 h-3 rounded-full ${
                      isPaired ? 'bg-blue-500' : 'bg-yellow-500'
                    }`} />
                    <span className="text-sm text-gray-600 dark:text-gray-400">
                      {isPaired ? 'Paired' : 'Unpaired'}
                    </span>
                  </div>
                )}
                
                {/* Lock Status */}
                {isLocked && (
                  <div className="flex items-center space-x-2">
                    <div className="w-3 h-3 rounded-full bg-red-500" />
                    <span className="text-sm text-gray-600 dark:text-gray-400">
                      Locked
                    </span>
                  </div>
                )}
                
                {/* Busy Status */}
                {isBusy && (
                  <div className="flex items-center space-x-2">
                    <div className="w-3 h-3 rounded-full bg-yellow-500 animate-pulse" />
                    <span className="text-sm text-gray-600 dark:text-gray-400">
                      Busy
                    </span>
                  </div>
                )}
              </div>
            </div>
            
            {/* Page Content */}
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6">
              {children}
            </div>
          </div>
        </main>
      </div>
    </div>
  )
}
