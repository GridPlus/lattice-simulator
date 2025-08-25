/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: {
    dirs: ['src', 'app', 'components', 'lib', 'utils'],
  },
  typescript: {
    ignoreBuildErrors: false,
  },
}

module.exports = nextConfig

