/**
 * KV Records Event Management for Lattice1 Device Simulator
 *
 * Handles emitting events when KV records are modified through
 * protocol operations (get, add, remove). Address tags are a specific
 * use case of KV records.
 */

import type { KvRecord, KvRecordData } from './types/kvRecords'

/**
 * Event types for KV records operations
 */
export enum KvRecordsEventType {
  /** KV records were fetched/retrieved */
  FETCHED = 'kvRecords:fetched',
  /** New KV records were added */
  ADDED = 'kvRecords:added',
  /** KV records were removed */
  REMOVED = 'kvRecords:removed',
  /** KV records were updated */
  UPDATED = 'kvRecords:updated',
  /** KV records were synced from device */
  SYNCED = 'kvRecords:synced',
  /** KV records were reset/cleared */
  RESET = 'kvRecords:reset',
}

/**
 * Base event interface for KV records events
 */
export interface KvRecordsEvent {
  /** Type of event */
  type: KvRecordsEventType
  /** Timestamp when event occurred */
  timestamp: number
  /** Device ID associated with the event */
  deviceId: string
  /** Event payload data */
  data: any
}

/**
 * Specific event interfaces for different operations
 */
export interface KvRecordsFetchedEvent extends KvRecordsEvent {
  type: KvRecordsEventType.FETCHED
  data: {
    records: KvRecord[]
    total: number
    fetched: number
    start: number
    type: number
  }
}

export interface KvRecordsAddedEvent extends KvRecordsEvent {
  type: KvRecordsEventType.ADDED
  data: {
    records: KvRecordData[]
    addedCount: number
    type: number
  }
}

export interface KvRecordsRemovedEvent extends KvRecordsEvent {
  type: KvRecordsEventType.REMOVED
  data: {
    keys: string[]
    removedCount: number
    type: number
  }
}

export interface KvRecordsUpdatedEvent extends KvRecordsEvent {
  type: KvRecordsEventType.UPDATED
  data: {
    key: string
    oldValue: string
    newValue: string
    type: number
  }
}

export interface KvRecordsSyncedEvent extends KvRecordsEvent {
  type: KvRecordsEventType.SYNCED
  data: {
    records: Record<string, string>
    totalCount: number
    type: number
  }
}

export interface KvRecordsResetEvent extends KvRecordsEvent {
  type: KvRecordsEventType.RESET
  data: {
    previousCount: number
  }
}

/**
 * Union type for all KV records events
 */
export type KvRecordsEventUnion =
  | KvRecordsFetchedEvent
  | KvRecordsAddedEvent
  | KvRecordsRemovedEvent
  | KvRecordsUpdatedEvent
  | KvRecordsSyncedEvent
  | KvRecordsResetEvent

/**
 * Event emitter for KV records operations
 */
class KvRecordsEventEmitter {
  private listeners: Map<KvRecordsEventType, Set<(event: KvRecordsEventUnion) => void>> = new Map()

  /**
   * Add event listener for a specific event type
   */
  on(eventType: KvRecordsEventType, listener: (event: KvRecordsEventUnion) => void): () => void {
    if (!this.listeners.has(eventType)) {
      this.listeners.set(eventType, new Set())
    }

    const listeners = this.listeners.get(eventType)!
    listeners.add(listener)

    // Return unsubscribe function
    return () => {
      listeners.delete(listener)
      if (listeners.size === 0) {
        this.listeners.delete(eventType)
      }
    }
  }

  /**
   * Remove event listener for a specific event type
   */
  off(eventType: KvRecordsEventType, listener: (event: KvRecordsEventUnion) => void): void {
    const listeners = this.listeners.get(eventType)
    if (listeners) {
      listeners.delete(listener)
      if (listeners.size === 0) {
        this.listeners.delete(eventType)
      }
    }
  }

  /**
   * Emit event to all listeners
   */
  emit(event: KvRecordsEventUnion): void {
    const listeners = this.listeners.get(event.type)
    if (listeners) {
      listeners.forEach(listener => {
        try {
          listener(event)
        } catch (error) {
          console.error('[KvRecordsEventEmitter] Error in event listener:', error)
        }
      })
    }
  }

  /**
   * Remove all listeners
   */
  removeAllListeners(): void {
    this.listeners.clear()
  }
}

/**
 * Global instance of the KV records event emitter
 */
export const kvRecordsEventEmitter = new KvRecordsEventEmitter()

/**
 * Helper functions to emit specific KV records events
 */
export function emitKvRecordsFetched(
  deviceId: string,
  records: KvRecord[],
  total: number,
  fetched: number,
  start: number,
  type: number,
): void {
  const event: KvRecordsFetchedEvent = {
    type: KvRecordsEventType.FETCHED,
    timestamp: Date.now(),
    deviceId,
    data: { records, total, fetched, start, type },
  }
  kvRecordsEventEmitter.emit(event)
}

export function emitKvRecordsAdded(deviceId: string, records: KvRecordData[], type: number): void {
  const event: KvRecordsAddedEvent = {
    type: KvRecordsEventType.ADDED,
    timestamp: Date.now(),
    deviceId,
    data: { records, addedCount: records.length, type },
  }
  kvRecordsEventEmitter.emit(event)
}

export function emitKvRecordsRemoved(deviceId: string, keys: string[], type: number): void {
  const event: KvRecordsRemovedEvent = {
    type: KvRecordsEventType.REMOVED,
    timestamp: Date.now(),
    deviceId,
    data: { keys, removedCount: keys.length, type },
  }
  kvRecordsEventEmitter.emit(event)
}

export function emitKvRecordsUpdated(
  deviceId: string,
  key: string,
  oldValue: string,
  newValue: string,
  type: number,
): void {
  const event: KvRecordsUpdatedEvent = {
    type: KvRecordsEventType.UPDATED,
    timestamp: Date.now(),
    deviceId,
    data: { key, oldValue, newValue, type },
  }
  kvRecordsEventEmitter.emit(event)
}

export function emitKvRecordsSynced(
  deviceId: string,
  records: Record<string, string>,
  type: number,
): void {
  const event: KvRecordsSyncedEvent = {
    type: KvRecordsEventType.SYNCED,
    timestamp: Date.now(),
    deviceId,
    data: { records, totalCount: Object.keys(records).length, type },
  }
  kvRecordsEventEmitter.emit(event)
}

export function emitKvRecordsReset(deviceId: string, previousCount: number): void {
  const event: KvRecordsResetEvent = {
    type: KvRecordsEventType.RESET,
    timestamp: Date.now(),
    deviceId,
    data: { previousCount },
  }
  kvRecordsEventEmitter.emit(event)
}
