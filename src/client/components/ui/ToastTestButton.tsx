'use client'

/**
 * Toast Test Button Component
 *
 * A simple component to test toast notifications.
 * This can be used for development and testing purposes.
 */

import { useToast } from './ToastProvider'

export function ToastTestButton() {
  const { showToast } = useToast()

  const testSignRequestToast = () => {
    showToast({
      title: 'New Sign Request',
      description: 'A new signing request has been received. Click to view pending requests.',
      type: 'info',
      action: {
        label: 'View Requests',
        onClick: () => {
          console.log('Navigating to requests page...')
          // In a real scenario, this would navigate to /requests
        },
      },
      duration: 10000,
    })
  }

  const testSuccessToast = () => {
    showToast({
      title: 'Success!',
      description: 'Operation completed successfully.',
      type: 'success',
      duration: 3000,
    })
  }

  const testErrorToast = () => {
    showToast({
      title: 'Error',
      description: 'Something went wrong. Please try again.',
      type: 'error',
      duration: 5000,
    })
  }

  const testWarningToast = () => {
    showToast({
      title: 'Warning',
      description: 'Please review your settings before proceeding.',
      type: 'warning',
      duration: 4000,
    })
  }

  return (
    <div className="space-y-4 p-4 border rounded-lg">
      <h3 className="text-lg font-semibold">Toast Notification Test</h3>
      <div className="flex flex-wrap gap-2">
        <button
          onClick={testSignRequestToast}
          className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
        >
          Test Sign Request Toast
        </button>
        <button
          onClick={testSuccessToast}
          className="px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600"
        >
          Test Success Toast
        </button>
        <button
          onClick={testErrorToast}
          className="px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600"
        >
          Test Error Toast
        </button>
        <button
          onClick={testWarningToast}
          className="px-4 py-2 bg-yellow-500 text-white rounded hover:bg-yellow-600"
        >
          Test Warning Toast
        </button>
      </div>
    </div>
  )
}
