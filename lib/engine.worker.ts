/// <reference lib="webworker" />

/**
 * lib/engine.worker.ts — Web Worker wrapper around the chess engine.
 * Receives a grade request, runs gradeMove off the UI thread, and posts
 * the result back. Never touches the DOM.
 */

import { gradeMove } from './engine';
import type { GradeResult } from './engine';

interface GradeRequest {
  id: number;
  beforeFen: string;
  moveUci: string;
  afterFen: string;
}

interface GradeSuccess {
  id: number;
  ok: true;
  result: GradeResult;
}

interface GradeFailure {
  id: number;
  ok: false;
  error: string;
}

self.onmessage = (event: MessageEvent<GradeRequest>): void => {
  const { id, beforeFen, moveUci, afterFen } = event.data;
  try {
    const result = gradeMove(beforeFen, moveUci, afterFen);
    const response: GradeSuccess = { id, ok: true, result };
    self.postMessage(response);
  } catch (err) {
    const response: GradeFailure = {
      id,
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
    self.postMessage(response);
  }
};
