/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: {
    dirs: ['../../src', './app'],
  },
  typescript: {
    ignoreBuildErrors: false,
  },
  webpack: config => {
    // Enable WebAssembly experiments for tiny-secp256k1
    config.experiments = {
      ...config.experiments,
      asyncWebAssembly: true,
    }

    // Handle .wasm files
    config.module.rules.push({
      test: /\.wasm$/,
      type: 'webassembly/async',
    })

    // Handle tiny-secp256k1 specifically
    config.resolve.fallback = {
      ...config.resolve.fallback,
      crypto: false,
      stream: false,
      buffer: false,
    }

    return config
  },
}

module.exports = nextConfig
