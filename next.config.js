/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    appDir: true,
  },
  eslint: {
    dirs: ['src', 'app', 'components', 'lib', 'utils'],
  },
  typescript: {
    ignoreBuildErrors: false,
  },
}

module.exports = nextConfig

