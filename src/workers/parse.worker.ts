/// <reference lib="webworker" />

/**
 * Parse Worker — runs the expensive bezier tessellation + toTree off the main
 * thread so a large or complex SVG never freezes the browser tab.
 *
 * The main thread handles DOMParser (not available in workers) and sends the
 * serialized element data here for pure-computation processing.
 */

import { tessellateElements } from "src/core/svg-parser";
import type { SerializedElement } from "src/core/svg-parser";
import type { NestPolygon } from "src/types";

interface ParseRequest {
  elements: SerializedElement[];
  curveTolerance: number;
}

interface ParseResponse {
  polygons?: NestPolygon[];
  error?: string;
}

self.onmessage = (e: MessageEvent<ParseRequest>) => {
  const { elements, curveTolerance } = e.data;
  try {
    const polygons = tessellateElements(elements, curveTolerance);
    (self as unknown as DedicatedWorkerGlobalScope).postMessage({
      polygons,
    } satisfies ParseResponse);
  } catch (err) {
    (self as unknown as DedicatedWorkerGlobalScope).postMessage({
      error: (err as Error).message,
    } satisfies ParseResponse);
  }
};
