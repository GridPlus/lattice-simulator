import './globals.css'
import ServerRequestProvider from '@/client/components/ServerRequestProvider'
import { ToastProvider } from '@/client/components/ui/ToastProvider'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Lattice1 Device Simulator',
  description: 'A software simulator for GridPlus Lattice1 hardware wallet',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="font-sans">
        <ToastProvider>
          <ServerRequestProvider>{children}</ServerRequestProvider>
        </ToastProvider>
      </body>
    </html>
  )
}
