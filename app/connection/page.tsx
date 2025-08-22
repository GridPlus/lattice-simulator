import { ConnectionPanel } from '@/components/connection/ConnectionPanel'
import { MainLayout } from '@/components/layout'

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
