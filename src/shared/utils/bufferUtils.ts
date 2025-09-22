/**
 * Utility functions for handling Buffer objects in various formats
 */

/**
 * Normalizes a value to a Buffer object, handling multiple input formats:
 * - Actual Buffer objects
 * - Serialized Buffer objects {type: 'Buffer', data: [...]}
 * - Uint8Array objects
 * - Array of numbers
 * - Other values (attempts conversion)
 *
 * @param value - The value to normalize to a Buffer
 * @returns A Buffer object
 */
export function normalizeBuffer(value: any): Buffer {
  if (Buffer.isBuffer(value)) {
    return value
  } else if (
    value &&
    typeof value === 'object' &&
    value.type === 'Buffer' &&
    Array.isArray(value.data)
  ) {
    // Handle serialized Buffer objects {type: 'Buffer', data: [...]}
    return Buffer.from(value.data)
  } else if (value instanceof Uint8Array) {
    return Buffer.from(value)
  } else if (Array.isArray(value)) {
    return Buffer.from(value)
  } else {
    return Buffer.from(value)
  }
}

/**
 * Safely renders a Buffer or serialized Buffer object as a hex string
 * Handles both actual Buffer objects and serialized Buffer objects
 *
 * @param value - The Buffer or serialized Buffer object to render
 * @returns A hex string representation
 */
export function renderBufferAsHex(value: any): string {
  if (Buffer.isBuffer(value)) {
    return value.toString('hex')
  } else if (typeof value === 'object' && value !== null && value.type === 'Buffer' && value.data) {
    // Handle serialized Buffer objects
    return Buffer.from(value.data).toString('hex')
  } else if (typeof value === 'object' && value !== null) {
    return JSON.stringify(value, null, 2)
  } else {
    return String(value)
  }
}

/**
 * Checks if a value is a serialized Buffer object
 *
 * @param value - The value to check
 * @returns True if the value is a serialized Buffer object
 */
export function isSerializedBuffer(value: any): boolean {
  return value && typeof value === 'object' && value.type === 'Buffer' && Array.isArray(value.data)
}
