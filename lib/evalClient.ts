/**
 * lib/evalClient.ts — UI-facing engine API for client components.
 *
 * evaluateMove() grades a move in a Web Worker so the UI never blocks.
 * The Worker is created LAZILY on first call (never at module top-level),
 * so importing this module during SSR prerender is safe. If Worker
 * construction or messaging fails, it falls back to a synchronous grade.
 */

import { gradeMove } from './engine';

export { formatEval, winProbability } from './engine';
export type { GradeResult } from './engine';
import type { GradeResult } from './engine';

interface GradeRequest {
  id: number;
  beforeFen: string;
  moveUci: string;
  afterFen: string;
}

type GradeResponse =
  | { id: number; ok: true; result: GradeResult }
  | { id: number; ok: false; error: string };

interface PendingRequest {
  resolve: (result: GradeResult) => void;
  reject: (err: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

const REQUEST_TIMEOUT_MS = 20_000;

let worker: Worker | null = null;
let nextId = 1;
const pending = new Map<number, PendingRequest>();

function settlePending(id: number, response: GradeResponse): void {
  const entry = pending.get(id);
  if (!entry) return;
  pending.delete(id);
  clearTimeout(entry.timer);
  if (response.ok) {
    entry.resolve(response.result);
  } else {
    entry.reject(new Error(response.error || 'Engine worker failed'));
  }
}

function failAllPending(err: Error): void {
  for (const [id, entry] of pending) {
    pending.delete(id);
    clearTimeout(entry.timer);
    entry.reject(err);
  }
}

/** Create (or reuse) the engine worker. Returns null on the server. */
function getWorker(): Worker | null {
  if (typeof window === 'undefined') return null;
  if (worker) return worker;
  try {
    const w = new Worker(new URL('./engine.worker.ts', import.meta.url));
    w.onmessage = (event: MessageEvent<GradeResponse>) => {
      settlePending(event.data.id, event.data);
    };
    w.onerror = () => {
      failAllPending(new Error('Engine worker error'));
    };
    worker = w;
    return worker;
  } catch {
    return null;
  }
}

/**
 * Grade a move off the UI thread. Falls back to a synchronous grade when
 * the worker is unavailable (SSR, worker construction failure, or
 * postMessage failure).
 */
export function evaluateMove(
  beforeFen: string,
  moveUci: string,
  afterFen: string,
): Promise<GradeResult> {
  const w = getWorker();
  if (!w) {
    return Promise.resolve(gradeMove(beforeFen, moveUci, afterFen));
  }

  return new Promise<GradeResult>((resolve, reject) => {
    const id = nextId++;
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error('Engine worker timed out'));
    }, REQUEST_TIMEOUT_MS);
    pending.set(id, { resolve, reject, timer });

    try {
      const request: GradeRequest = { id, beforeFen, moveUci, afterFen };
      w.postMessage(request);
    } catch (err) {
      pending.delete(id);
      clearTimeout(timer);
      // postMessage failed: grade synchronously instead of failing the call.
      try {
        resolve(gradeMove(beforeFen, moveUci, afterFen));
      } catch (syncErr) {
        reject(syncErr instanceof Error ? syncErr : new Error(String(syncErr)));
      }
    }
  });
}
