import { MainLayout } from '@/components/layout'

export default function Home() {
  return (
    <MainLayout>
      <div className="p-6">
        <div className="text-center">
          <h2 className="text-3xl font-bold text-gray-900 dark:text-white mb-4">
            Welcome to Lattice1 Simulator
          </h2>
          <p className="text-lg text-gray-600 dark:text-gray-400 mb-8">
            A complete simulation of the GridPlus Lattice1 hardware wallet
          </p>
          
          {/* Quick Stats */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
            <div className="bg-blue-50 dark:bg-blue-900/20 p-6 rounded-lg">
              <h3 className="text-lg font-semibold text-blue-900 dark:text-blue-100">Device Status</h3>
              <p className="text-blue-600 dark:text-blue-300">Ready for connection</p>
            </div>
            <div className="bg-green-50 dark:bg-green-900/20 p-6 rounded-lg">
              <h3 className="text-lg font-semibold text-green-900 dark:text-green-100">Supported Chains</h3>
              <p className="text-green-600 dark:text-green-300">ETH, BTC, SOL</p>
            </div>
            <div className="bg-purple-50 dark:bg-purple-900/20 p-6 rounded-lg">
              <h3 className="text-lg font-semibold text-purple-900 dark:text-purple-100">Features</h3>
              <p className="text-purple-600 dark:text-purple-300">Full protocol support</p>
            </div>
          </div>
          
          {/* Getting Started */}
          <div className="bg-gray-50 dark:bg-gray-800 p-6 rounded-lg">
            <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
              Getting Started
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-left">
              <div>
                <h4 className="font-medium text-gray-900 dark:text-white mb-2">1. Connect Device</h4>
                <p className="text-gray-600 dark:text-gray-400">
                  Use the Connection panel to establish a connection with the simulated device.
                </p>
              </div>
              <div>
                <h4 className="font-medium text-gray-900 dark:text-white mb-2">2. Pair Application</h4>
                <p className="text-gray-600 dark:text-gray-400">
                  Complete the pairing process to enable secure communication.
                </p>
              </div>
              <div>
                <h4 className="font-medium text-gray-900 dark:text-white mb-2">3. Manage Wallets</h4>
                <p className="text-gray-600 dark:text-gray-400">
                  View and manage your cryptocurrency wallets and addresses.
                </p>
              </div>
              <div>
                <h4 className="font-medium text-gray-900 dark:text-white mb-2">4. Handle Requests</h4>
                <p className="text-gray-600 dark:text-gray-400">
                  Approve or decline signing requests and transactions.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </MainLayout>
  )
}
