/**
 * Helper utilities for working with tiny-secp256k1 across different module formats.
 *
 * Vitest and various build tools sometimes surface the module as either:
 *   - CommonJS namespace object (with methods directly on the object)
 *   - ESM default export wrapping the namespace object
 *   - Nested default.default (when transpiled twice)
 *
 * We normalize these shapes so downstream code always receives an object that
 * implements the expected tiny-secp256k1 interface.
 */

type TinySecpModuleShape = {
  default?: TinySecpShape | { default?: TinySecpShape }
} & Partial<TinySecpShape>

type TinySecpShape = {
  isPoint: (...args: any[]) => boolean
  isPrivate: (...args: any[]) => boolean
  isXOnlyPoint?: (...args: any[]) => boolean
  pointAdd: (...args: any[]) => any
  pointAddScalar: (...args: any[]) => any
  pointMultiply: (...args: any[]) => any
  pointFromScalar: (...args: any[]) => any
  pointCompress?: (...args: any[]) => any
  xOnlyPointAddTweak?: (...args: any[]) => any
  privateAdd?: (...args: any[]) => any
  privateNegate?: (...args: any[]) => any
  sign: (...args: any[]) => any
  verify: (...args: any[]) => any
}

const hasTinySecpMethods = (candidate: unknown): candidate is TinySecpShape => {
  if (!candidate || typeof candidate !== 'object') {
    return false
  }
  const obj = candidate as Record<string, unknown>
  return (
    typeof obj.isPoint === 'function' &&
    typeof obj.isPrivate === 'function' &&
    typeof obj.pointAdd === 'function' &&
    typeof obj.pointAddScalar === 'function' &&
    typeof obj.pointMultiply === 'function' &&
    typeof obj.pointFromScalar === 'function' &&
    typeof obj.sign === 'function' &&
    typeof obj.verify === 'function'
  )
}

/**
 * Normalize the tiny-secp256k1 module to a consistent shape regardless of
 * how the bundler exposed it (CJS, default export, or nested default).
 */
export const resolveTinySecp = (moduleNamespace: TinySecpModuleShape): TinySecpShape => {
  if (hasTinySecpMethods(moduleNamespace)) {
    return moduleNamespace
  }

  if (moduleNamespace?.default && hasTinySecpMethods(moduleNamespace.default)) {
    return moduleNamespace.default
  }

  if (
    moduleNamespace?.default &&
    typeof moduleNamespace.default === 'object' &&
    'default' in moduleNamespace.default &&
    hasTinySecpMethods((moduleNamespace.default as { default?: unknown }).default)
  ) {
    return (moduleNamespace.default as { default: TinySecpShape }).default
  }

  throw new Error('Failed to resolve tiny-secp256k1 module: missing expected methods')
}

export type { TinySecpShape }
