import { ConnectionPanel } from '@/client/components/connection/ConnectionPanel'
import { MainLayout } from '@/client/components/layout'

/**
 * Connection page component
 * Displays the device connection interface
 */
export default function ConnectionPage() {
  return (
    <MainLayout>
      <ConnectionPanel />
    </MainLayout>
  )
}
