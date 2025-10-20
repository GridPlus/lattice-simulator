/**
 * Debug logging utility using the 'debug' npm package
 *
 * Usage:
 * - Enable all logs: DEBUG=lattice:* npm run dev
 * - Enable specific namespace: DEBUG=lattice:protocol npm run dev
 * - Enable multiple: DEBUG=lattice:protocol,lattice:signing npm run dev
 * - Wildcards work: DEBUG=lattice:server:* npm run dev
 *
 * Namespaces:
 * - lattice:protocol - Protocol parsing, encryption/decryption
 * - lattice:signing - Signing operations and debugging
 * - lattice:wallet - Wallet manager operations
 * - lattice:server - Server and WebSocket operations
 */

import createDebug from 'debug'

export const debug = {
  protocol: createDebug('lattice:protocol'),
  signing: createDebug('lattice:signing'),
  wallet: createDebug('lattice:wallet'),
  server: createDebug('lattice:server'),
}
