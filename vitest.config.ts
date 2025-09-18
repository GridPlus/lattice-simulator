import { resolve } from 'path'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,  // Enable global test APIs (expect, describe, it, etc.)
    setupFiles: ['./src/test/setup.ts'],
    include: ['**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
    exclude: ['node_modules', 'dist', '.next'],
    coverage: {
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/',
        'src/test/setup.ts',
      ],
    },
    // Use Node.js environment for Bitcoin wallet tests
    environmentMatchGlobs: [
      ['**/bitcoinWallet.test.ts', 'node'],
    ],
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
      '@/lib': resolve(__dirname, './src/lib'),
      '@/server': resolve(__dirname, './src/server'),
      '@/client': resolve(__dirname, './src/client'),
      '@/shared': resolve(__dirname, './src/shared'),
      '@/utils': resolve(__dirname, './src/shared/utils'),
      '@/types': resolve(__dirname, './src/shared/types'),
      '@/store': resolve(__dirname, './src/client/store'),
    },
  },
})
