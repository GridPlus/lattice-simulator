'use client'

/**
 * Sidebar Component for Lattice1 Device Simulator
 * 
 * Provides navigation between different simulator views and sections.
 */

import React from 'react'
import { usePathname } from 'next/navigation'
import Link from 'next/link'
import { 
  Home, 
  Wifi, 
  Wallet, 
  FileText, 
  Clock,
  Database
} from 'lucide-react'

interface NavItem {
  id: string
  label: string
  icon: React.ComponentType<{ className?: string }>
  href: string
  badge?: string
}

const navigationItems: NavItem[] = [
  {
    id: 'dashboard',
    label: 'Dashboard',
    icon: Home,
    href: '/'
  },
  {
    id: 'connection',
    label: 'Connection',
    icon: Wifi,
    href: '/connection'
  },
  {
    id: 'wallets',
    label: 'Wallets',
    icon: Wallet,
    href: '/wallets'
  },
  {
    id: 'requests',
    label: 'Pending Requests',
    icon: Clock,
    href: '/requests',
    badge: '2'
  },
  {
    id: 'transactions',
    label: 'Transactions',
    icon: FileText,
    href: '/transactions'
  },
  {
    id: 'storage',
    label: 'Address Tags',
    icon: Database,
    href: '/storage'
  }
]

/**
 * Sidebar component with navigation menu
 * 
 * @returns Sidebar with navigation items and active state
 */
export function Sidebar() {
  const pathname = usePathname()

  return (
    <aside className="w-64 bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 min-h-screen">
      <div className="p-4">
        {/* Navigation */}
        <nav className="space-y-1">
          {navigationItems.map((item) => {
            const Icon = item.icon
            const isActive = pathname === item.href
            
            return (
              <Link
                key={item.id}
                href={item.href}
                className={`group flex items-center px-3 py-2 text-sm font-medium rounded-lg transition-colors ${
                  isActive
                    ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/20 dark:text-blue-400'
                    : 'text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700'
                }`}
              >
                <Icon 
                  className={`mr-3 h-5 w-5 ${
                    isActive 
                      ? 'text-blue-500' 
                      : 'text-gray-400 group-hover:text-gray-500 dark:text-gray-500 dark:group-hover:text-gray-400'
                  }`} 
                />
                <span className="flex-1">{item.label}</span>
                {item.badge && (
                  <span className="ml-auto inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-400">
                    {item.badge}
                  </span>
                )}
              </Link>
            )
          })}
        </nav>
      </div>
    </aside>
  )
}
