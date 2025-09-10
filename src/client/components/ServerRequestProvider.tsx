/**
 * Server Request Provider Component
 *
 * This component should be included in the app to enable server-client
 * communication for KV records and other data requests.
 */

'use client'

import React from 'react'
import { useServerRequestHandler } from '@/client/hooks/useClientWebSocketHandler'
import { useDeviceStore } from '@/client/store/clientDeviceStore'

interface ServerRequestProviderProps {
  children: React.ReactNode
}

export function ServerRequestProvider({ children }: ServerRequestProviderProps) {
  const deviceId = useDeviceStore(state => state.deviceInfo.deviceId)

  // Initialize the server request handler
  useServerRequestHandler(deviceId)

  return <>{children}</>
}

export default ServerRequestProvider
