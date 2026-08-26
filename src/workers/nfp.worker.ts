/**
 * NFP Worker — computes No-Fit Polygons for a batch of part pairs.
 * Each worker runs fully independently; the main thread coordinates batches.
 *
 * Uses ClipperLib for Minkowski-difference NFP (outer NFP, fast path)
 * and the orbital algorithm for inner NFP / concave exploration.
 */

/// <reference lib="webworker" />

import ClipperLib from "clipper-lib";
import { GeometryUtil } from "src/core/geometry";
import type {
  NestPolygon,
  NfpWorkerInput,
  NfpWorkerOutput,
  Point,
} from "src/types";

const CLIPPER_SCALE = 10_000_000;

function toClipper(polygon: NestPolygon) {
  const pts = polygon.map((p) => ({
    X: Math.round(p.x * CLIPPER_SCALE),
    Y: Math.round(p.y * CLIPPER_SCALE),
  }));
  return pts;
}

function fromClipper(pts: { X: number; Y: number }[]): Point[] {
  return pts.map((p) => ({ x: p.X / CLIPPER_SCALE, y: p.Y / CLIPPER_SCALE }));
}

function minkowskiDifference(
  A: NestPolygon,
  B: NestPolygon,
): NestPolygon[] | null {
  const Ac = toClipper(A);
  const Bc = toClipper(B).map((p) => ({ X: -p.X, Y: -p.Y }));

  let solution: { X: number; Y: number }[][];
  try {
    solution = ClipperLib.Clipper.MinkowskiSum(Ac, Bc, true);
  } catch {
    return null;
  }

  if (!solution || solution.length === 0) return null;

  let clipperNfp: Point[] | null = null;
  let largestArea: number | null = null;

  for (const path of solution) {
    const n = fromClipper(path) as NestPolygon;
    const area = GeometryUtil.polygonArea(n);
    if (largestArea === null || area < largestArea) {
      clipperNfp = n;
      largestArea = area;
    }
  }

  if (!clipperNfp) return null;

  // MinkowskiSum(A, -B) gives exactly the set of translation offsets δ where
  // (B + δ) overlaps A.  The placement worker tests candidate positions as
  // translation offsets, so NO additional reference-point shift is needed.
  // (The original SVGnest added B[0] here because it normalised polygons to
  // their first vertex, making B[0] = (0,0); our bounding-box normalisation
  // makes B[0] non-zero, so the shift must be omitted.)
  return [clipperNfp as NestPolygon];
}

function processNfpPair(input: NfpWorkerInput): NfpWorkerOutput {
  const { pair, config } = input;
  const A = GeometryUtil.transformPolygon(
    pair.A,
    pair.key.Arotation,
    pair.key.Amirrored,
  );
  const B = GeometryUtil.transformPolygon(
    pair.B,
    pair.key.Brotation,
    pair.key.Bmirrored,
  );

  let nfp: NestPolygon[] | null = null;

  if (pair.key.inside) {
    // Inner NFP (IFP): B fits inside A
    if (GeometryUtil.isRectangle(A, 0.001)) {
      nfp = GeometryUtil.noFitPolygonRectangle(A, B);
    } else {
      nfp = GeometryUtil.noFitPolygon(A, B, true, config.exploreConcave);
    }

    if (nfp && nfp.length > 0) {
      // Ensure all inner NFPs are clockwise (positive area = clockwise in SVG coords)
      for (const poly of nfp) {
        if (GeometryUtil.polygonArea(poly) > 0) poly.reverse();
      }
    } else {
      nfp = null; // part doesn't fit
    }
  } else {
    // Outer NFP: how B orbits A without overlap
    if (config.exploreConcave) {
      nfp = GeometryUtil.noFitPolygon(A, B, false, true);
    } else {
      nfp = minkowskiDifference(A, B);
    }

    if (!nfp || nfp.length === 0) {
      return { key: pair.key, value: null };
    }

    // Sanity check: NFP area must be >= A area
    for (let i = nfp.length - 1; i >= 0; i--) {
      if (
        i === 0 ||
        Math.abs(GeometryUtil.polygonArea(nfp[i])) >=
          Math.abs(GeometryUtil.polygonArea(A))
      ) {
        if (GeometryUtil.polygonArea(nfp[i]) > 0) nfp[i].reverse();
        // Mark inner NFPs (holes)
        if (i > 0 && GeometryUtil.pointInPolygon(nfp[i][0], nfp[0])) {
          if (GeometryUtil.polygonArea(nfp[i]) < 0) nfp[i].reverse();
        }
      } else {
        nfp.splice(i, 1);
      }
    }

    // Part-in-part: also generate NFPs for children (holes of A) if enabled
    if (
      config.useHoles &&
      (A as any).childNodes &&
      (A as any).childNodes.length > 0
    ) {
      const Bbounds = GeometryUtil.getPolygonBounds(B);
      for (const hole of (A as any).childNodes as NestPolygon[]) {
        const Abounds = GeometryUtil.getPolygonBounds(hole);
        if (
          Abounds &&
          Bbounds &&
          Abounds.width > Bbounds.width &&
          Abounds.height > Bbounds.height
        ) {
          const cnfp = GeometryUtil.noFitPolygon(
            hole,
            B,
            true,
            config.exploreConcave,
          );
          if (cnfp) {
            for (const p of cnfp) {
              if (GeometryUtil.polygonArea(p) < 0) p.reverse();
              nfp!.push(p);
            }
          }
        }
      }
    }
  }

  return { key: pair.key, value: nfp ?? null };
}

self.addEventListener(
  "message",
  (ev: MessageEvent<NfpWorkerInput | NfpWorkerInput[]>) => {
    const inputs = Array.isArray(ev.data) ? ev.data : [ev.data];
    const results: NfpWorkerOutput[] = inputs.map(processNfpPair);
    self.postMessage(results);
  },
);
