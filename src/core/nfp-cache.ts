/**
 * NFP Cache — two-tier storage:
 *   1. In-memory Map (fastest — same-tab access)
 *   2. IndexedDB (persistent — survives page refresh, shared across tabs via BroadcastChannel)
 *
 * SharedArrayBuffer coordination: a Uint8Array flags buffer marks which (key-hash → slot)
 * entries are "being computed" so workers can skip duplicate work without re-messaging.
 * Actual polygon data lives in the Map (variable length can't fit in a fixed SAB).
 */

import type { NestPolygon, NfpKey } from 'src/types';

const DB_NAME = 'svgnest-nfp-cache';
const DB_VERSION = 1;
const STORE_NAME = 'nfp';

// ---------------------------------------------------------------------------
// Key serialization
// ---------------------------------------------------------------------------

export function serializeKey(key: NfpKey): string {
  return `${key.A}_${key.B}_${key.inside ? 1 : 0}_${key.Arotation.toFixed(2)}_${key.Brotation.toFixed(2)}_${key.Amirrored ? 1 : 0}${key.Bmirrored ? 1 : 0}`;
}

// Fast djb2 hash — maps a string key to a 32-bit integer slot index
function hashKey(str: string, slots: number): number {
  let h = 5381;
  for (let i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) & 0xffffffff;
  return Math.abs(h) % slots;
}

// ---------------------------------------------------------------------------
// Shared-memory "in-flight" marker (SharedArrayBuffer)
// Allows multiple workers to see which keys are currently being computed.
// ---------------------------------------------------------------------------

const SAB_SLOTS = 4096; // power-of-2, collision-tolerant
let sharedFlags: Int32Array | null = null;
let sabAvailable = false;

try {
  const sab = new SharedArrayBuffer(SAB_SLOTS * 4);
  sharedFlags = new Int32Array(sab);
  sabAvailable = true;
} catch {
  // COOP/COEP headers not set — fall back gracefully
  sabAvailable = false;
}

export function isSharedMemAvailable(): boolean { return sabAvailable; }

/**
 * Mark a key as "currently being computed" in the shared flags buffer.
 * Returns true if this worker successfully claimed the slot (CAS).
 */
export function claimSlot(key: string): boolean {
  if (!sharedFlags) return true; // no contention tracking without SAB
  const slot = hashKey(key, SAB_SLOTS);
  // Atomics.compareExchange: if value at slot is 0, set to 1 and return 0 (success)
  const prev = Atomics.compareExchange(sharedFlags, slot, 0, 1);
  return prev === 0;
}

export function releaseSlot(key: string): void {
  if (!sharedFlags) return;
  const slot = hashKey(key, SAB_SLOTS);
  Atomics.store(sharedFlags, slot, 0);
}

export function isSlotClaimed(key: string): boolean {
  if (!sharedFlags) return false;
  const slot = hashKey(key, SAB_SLOTS);
  return Atomics.load(sharedFlags, slot) === 1;
}

// ---------------------------------------------------------------------------
// IndexedDB helpers
// ---------------------------------------------------------------------------

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(STORE_NAME);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

async function idbGet(key: string): Promise<NestPolygon[] | undefined> {
  try {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const req = tx.objectStore(STORE_NAME).get(key);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return undefined;
  }
}

async function idbSet(key: string, value: NestPolygon[]): Promise<void> {
  try {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const req = tx.objectStore(STORE_NAME).put(value, key);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch {
    // IndexedDB not available (e.g., in worker without importScripts)
  }
}

// ---------------------------------------------------------------------------
// BroadcastChannel — sync computed NFPs across tabs
// ---------------------------------------------------------------------------

const channel = typeof BroadcastChannel !== 'undefined'
  ? new BroadcastChannel('svgnest-nfp')
  : null;

// ---------------------------------------------------------------------------
// Main NfpCache class
// ---------------------------------------------------------------------------

export class NfpCache {
  private map = new Map<string, NestPolygon[]>();
  private size = 0;
  private readonly maxSize: number;

  constructor(maxSize = 50_000) {
    this.maxSize = maxSize;
    channel?.addEventListener('message', (ev: MessageEvent) => {
      const { key, value } = ev.data as { key: string; value: NestPolygon[] };
      if (!this.map.has(key)) {
        this.setLocal(key, value);
      }
    });
  }

  has(key: NfpKey): boolean {
    return this.map.has(serializeKey(key));
  }

  get(key: NfpKey): NestPolygon[] | undefined {
    return this.map.get(serializeKey(key));
  }

  set(key: NfpKey, value: NestPolygon[]): void {
    const k = serializeKey(key);
    this.setLocal(k, value);
    // Broadcast to other tabs
    channel?.postMessage({ key: k, value });
    // Persist to IndexedDB (fire-and-forget)
    idbSet(k, value);
    releaseSlot(k);
  }

  private setLocal(k: string, value: NestPolygon[]): void {
    if (!this.map.has(k)) this.size++;
    this.map.set(k, value);
    // Basic LRU eviction — drop oldest 25% when at capacity
    if (this.size > this.maxSize) {
      let evicted = 0;
      for (const key of this.map.keys()) {
        this.map.delete(key);
        evicted++;
        if (evicted >= this.maxSize * 0.25) break;
      }
      this.size = this.map.size;
    }
  }

  /** Try loading a key from IndexedDB (for warm starts after page refresh) */
  async preload(key: NfpKey): Promise<NestPolygon[] | undefined> {
    const k = serializeKey(key);
    if (this.map.has(k)) return this.map.get(k);
    const value = await idbGet(k);
    if (value) this.setLocal(k, value);
    return value;
  }

  /** Serialize cache for transfer to workers (only current generation) */
  toEntries(): [string, NestPolygon[]][] {
    return Array.from(this.map.entries());
  }

  fromEntries(entries: [string, NestPolygon[]][]): void {
    for (const [k, v] of entries) this.setLocal(k, v);
  }

  get count(): number { return this.size; }

  /** Clear the in-memory map (keeps IndexedDB — disk cache persists) */
  clearMemory(): void {
    this.map.clear();
    this.size = 0;
  }

  /** Wipe IndexedDB entirely (reset button) */
  static async clearPersisted(): Promise<void> {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const req = tx.objectStore(STORE_NAME).clear();
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }
}
