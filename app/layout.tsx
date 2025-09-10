import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import ServerRequestProvider from '@/client/components/ServerRequestProvider'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'Lattice1 Device Simulator',
  description: 'A software simulator for GridPlus Lattice1 hardware wallet',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <ServerRequestProvider>{children}</ServerRequestProvider>
      </body>
    </html>
  )
}
