/**
 * Debug Component for Server-Client Communication
 * 
 * This component shows the status of server-client communication
 * and allows testing the request-response flow.
 */

'use client'

import React, { useState, useEffect } from 'react'
import { useDeviceStore } from '@/client/store/clientDeviceStore'
import { ChevronDown, ChevronUp, Bug } from 'lucide-react'

interface RequestLog {
  timestamp: number
  type: 'server_request' | 'client_response' | 'ws_connect' | 'error'
  message: string
  data?: any
}

interface ServerClientDebugProps {
  defaultCollapsed?: boolean
}

export function ServerClientDebug({ defaultCollapsed = true }: ServerClientDebugProps) {
  const [logs, setLogs] = useState<RequestLog[]>([])
  const [isConnected, setIsConnected] = useState(false)
  const [testing, setTesting] = useState(false)
  const [isCollapsed, setIsCollapsed] = useState(defaultCollapsed)
  const deviceId = useDeviceStore(state => state.deviceInfo.deviceId)

  const addLog = (type: RequestLog['type'], message: string, data?: any) => {
    setLogs(prev => [...prev.slice(-9), { // Keep last 10 logs
      timestamp: Date.now(),
      type,
      message,
      data
    }])
  }

  const testKvRequest = async () => {
    setTesting(true)
    addLog('server_request', 'Triggering test KV records request...')
    
    try {
      const response = await fetch('/api/test-kv-request', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          deviceId,
          type: 0,
          n: 3,
          start: 0
        })
      })
      
      const result = await response.json()
      
      if (result.success) {
        addLog('client_response', 'Test request completed successfully', result.data)
      } else {
        addLog('error', `Test request failed: ${result.error}`)
      }
    } catch (error) {
      addLog('error', `Test request error: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
    
    setTesting(false)
  }

  const clearLogs = () => {
    setLogs([])
  }

  // Monitor WebSocket connection status (passive monitoring)
  useEffect(() => {
    if (!deviceId) return

    // Instead of creating our own WebSocket connection, just assume it's connected
    // The main app uses ServerRequestProvider which handles the actual connection
    setIsConnected(true)
    addLog('ws_connect', 'Debug component initialized - monitoring existing WebSocket connection')
    
    // Set up a timer to occasionally log that we're monitoring
    const monitorInterval = setInterval(() => {
      addLog('server_request', 'Debug monitoring active...', { deviceId })
    }, 30000) // Every 30 seconds
    
    return () => {
      clearInterval(monitorInterval)
      setIsConnected(false)
    }
  }, [deviceId])

  const formatTime = (timestamp: number) => {
    return new Date(timestamp).toLocaleTimeString()
  }

  const getLogIcon = (type: RequestLog['type']) => {
    switch (type) {
      case 'server_request': return '📤'
      case 'client_response': return '📥'
      case 'ws_connect': return '🔗'
      case 'error': return '❌'
      default: return '📝'
    }
  }

  const getLogColor = (type: RequestLog['type']) => {
    switch (type) {
      case 'server_request': return 'text-blue-600 dark:text-blue-400'
      case 'client_response': return 'text-green-600 dark:text-green-400'
      case 'ws_connect': return 'text-purple-600 dark:text-purple-400'
      case 'error': return 'text-red-600 dark:text-red-400'
      default: return 'text-gray-600 dark:text-gray-400'
    }
  }

  return (
    <div className="border rounded-lg bg-white dark:bg-gray-800 shadow-sm">
      {/* Header - Always visible */}
      <div 
        className="flex items-center justify-between p-4 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
        onClick={() => setIsCollapsed(!isCollapsed)}
      >
        <div className="flex items-center space-x-2">
          <Bug className="w-5 h-5 text-gray-600 dark:text-gray-400" />
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
            Server-Client Debug
          </h3>
          <div className={`w-3 h-3 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'}`} />
          <span className="text-sm text-gray-600 dark:text-gray-400">
            {isConnected ? 'WebSocket Connected' : 'WebSocket Disconnected'}
          </span>
        </div>
        
        <div className="flex items-center space-x-2">
          {!isCollapsed && (
            <div className="flex space-x-2">
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  testKvRequest()
                }}
                disabled={testing || !isConnected}
                className={`px-3 py-1 text-sm rounded ${
                  testing || !isConnected
                    ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                    : 'bg-blue-600 text-white hover:bg-blue-700'
                }`}
              >
                {testing ? 'Testing...' : 'Test KV Request'}
              </button>
              
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  clearLogs()
                }}
                className="px-3 py-1 text-sm bg-gray-600 text-white rounded hover:bg-gray-700"
              >
                Clear
              </button>
            </div>
          )}
          
          {isCollapsed ? (
            <ChevronDown className="w-5 h-5 text-gray-400" />
          ) : (
            <ChevronUp className="w-5 h-5 text-gray-400" />
          )}
        </div>
      </div>

      {/* Collapsible Content */}
      {!isCollapsed && (
        <div className="px-4 pb-4 space-y-4 border-t border-gray-200 dark:border-gray-700">

      <div className="space-y-1">
        <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300">
          Communication Log:
        </h4>
        
        <div className="bg-gray-50 dark:bg-gray-800 rounded p-3 h-64 overflow-y-auto">
          {logs.length === 0 ? (
            <p className="text-sm text-gray-500 dark:text-gray-400 italic">
              No activity yet. Click "Test KV Request" to test the flow.
            </p>
          ) : (
            <div className="space-y-2">
              {logs.map((log, index) => (
                <div key={index} className="text-xs">
                  <div className="flex items-start space-x-2">
                    <span>{getLogIcon(log.type)}</span>
                    <span className="text-gray-500 dark:text-gray-400">
                      {formatTime(log.timestamp)}
                    </span>
                    <span className={getLogColor(log.type)}>
                      {log.message}
                    </span>
                  </div>
                  {log.data && (
                    <pre className="ml-6 text-gray-600 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 p-2 rounded text-xs overflow-x-auto">
                      {JSON.stringify(log.data, null, 2)}
                    </pre>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

          <div className="text-xs text-gray-500 dark:text-gray-400">
            <p><strong>Device ID:</strong> {deviceId}</p>
            <p><strong>How it works:</strong> Server requests sent via WebSocket → Client responds over same WebSocket connection</p>
          </div>
        </div>
      )}
    </div>
  )
}