/**
 * Placement Worker — given a list of parts + their NFPs, finds the best
 * placement position for each part using a gravity / bottom-left heuristic.
 *
 * Algorithm outline:
 *   For each part (in order):
 *     1. Get the IFP (inner NFP of bin) and union of NFPs of already-placed parts.
 *     2. Candidate positions = IFP ∩ complement(union of outer NFPs).
 *     3. Score each candidate by the gravity criterion (minimize max-y of placed parts).
 *     4. Place at the best candidate.
 */

/// <reference lib="webworker" />

import ClipperLib from "clipper-lib";
import { GeometryUtil } from "src/core/geometry";
import { validAngles, grainAngles } from "src/core/optimizer";
import type {
  NestPolygon,
  PlacementWorkerInput,
  PlacementResult,
  PartPlacement,
  NfpKey,
  Point,
} from "src/types";

const CLIPPER_SCALE = 10_000_000;

// ---------------------------------------------------------------------------
// Convex Minkowski sum — used as an exact NFP fallback for convex polygons
// (triangles, rectangles, etc.) when the cache has no matching entry.
// ---------------------------------------------------------------------------

/** True when the polygon's vertices are strictly convex (no reflex angles). */
function isConvexPolygon(poly: Point[]): boolean {
  const n = poly.length;
  if (n < 3) return false;
  let sign = 0;
  for (let i = 0; i < n; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % n];
    const c = poly[(i + 2) % n];
    const cross = (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);
    if (cross !== 0) {
      if (sign === 0) sign = cross > 0 ? 1 : -1;
      else if ((cross > 0 ? 1 : -1) !== sign) return false;
    }
  }
  return true;
}

/**
 * Minkowski sum of convex polygon A with the NEGATION of convex polygon B.
 * This equals the outer NFP of A vs B (the set of positions where B's reference
 * point cannot be placed without overlapping A, when A sits at the origin).
 * Both polygons must be in CCW order; the result is also CCW.
 * Returns null if either polygon is not convex.
 */
function convexMinkowskiNfp(polyA: Point[], polyB: Point[]): Point[] | null {
  if (!isConvexPolygon(polyA) || !isConvexPolygon(polyB)) return null;

  // Negate B (reflect through origin).
  const negB: Point[] = polyB.map((p) => ({ x: -p.x, y: -p.y }));

  // Find the "bottom-most then left-most" vertex of each polygon as start.
  const startIdx = (poly: Point[]) => {
    let idx = 0;
    for (let i = 1; i < poly.length; i++) {
      if (
        poly[i].y < poly[idx].y ||
        (poly[i].y === poly[idx].y && poly[i].x < poly[idx].x)
      )
        idx = i;
    }
    return idx;
  };

  const nA = polyA.length;
  const nB = negB.length;
  const startA = startIdx(polyA);
  const startB = startIdx(negB);
  let iA = startA;
  let iB = startB;
  const result: Point[] = [];

  result.push({ x: polyA[iA].x + negB[iB].x, y: polyA[iA].y + negB[iB].y });

  let steps = 0;
  const maxSteps = nA + nB;
  while (steps < maxSteps) {
    const nextA = (iA + 1) % nA;
    const nextB = (iB + 1) % nB;
    const eA = {
      x: polyA[nextA].x - polyA[iA].x,
      y: polyA[nextA].y - polyA[iA].y,
    };
    const eB = { x: negB[nextB].x - negB[iB].x, y: negB[nextB].y - negB[iB].y };
    const cross = eA.x * eB.y - eA.y * eB.x;
    const last = result[result.length - 1];

    if (cross > 0) {
      iA = nextA;
      result.push({ x: last.x + eA.x, y: last.y + eA.y });
    } else if (cross < 0) {
      iB = nextB;
      result.push({ x: last.x + eB.x, y: last.y + eB.y });
    } else {
      iA = nextA;
      iB = nextB;
      result.push({ x: last.x + eA.x + eB.x, y: last.y + eA.y + eB.y });
    }
    steps++;

    if (iA === startA && iB === startB) break;
  }

  return result;
}

function toClipper(polygon: Point[]): { X: number; Y: number }[] {
  return polygon.map((p) => ({
    X: Math.round(p.x * CLIPPER_SCALE),
    Y: Math.round(p.y * CLIPPER_SCALE),
  }));
}

function fromClipper(pts: { X: number; Y: number }[]): Point[] {
  return pts.map((p) => ({ x: p.X / CLIPPER_SCALE, y: p.Y / CLIPPER_SCALE }));
}

function serializeKey(key: NfpKey): string {
  return `${key.A}_${key.B}_${key.inside ? 1 : 0}_${key.Arotation.toFixed(2)}_${key.Brotation.toFixed(2)}_${key.Amirrored ? 1 : 0}${key.Bmirrored ? 1 : 0}`;
}

function clipperUnion(polys: Point[][]): Point[][] {
  if (polys.length === 0) return [];
  const clipper = new ClipperLib.Clipper();
  for (const poly of polys) {
    const cp = toClipper(poly);
    clipper.AddPath(cp, ClipperLib.PolyType.ptSubject, true);
  }
  const solution: ClipperLib.Paths = [];
  clipper.Execute(
    ClipperLib.ClipType.ctUnion,
    solution,
    ClipperLib.PolyFillType.pftNonZero,
    ClipperLib.PolyFillType.pftNonZero,
  );
  return solution.map(fromClipper);
}

/**
 * subject − clip.  Used to carve the already-occupied no-fit regions out of the
 * inner-fit polygon, leaving the exact region where the part may legally sit.
 */
function clipperDifference(subject: Point[][], clip: Point[][]): Point[][] {
  if (subject.length === 0) return [];
  if (clip.length === 0) return subject;
  const clipper = new ClipperLib.Clipper();
  for (const poly of subject) {
    clipper.AddPath(toClipper(poly), ClipperLib.PolyType.ptSubject, true);
  }
  for (const poly of clip) {
    clipper.AddPath(toClipper(poly), ClipperLib.PolyType.ptClip, true);
  }
  const solution: ClipperLib.Paths = [];
  clipper.Execute(
    ClipperLib.ClipType.ctDifference,
    solution,
    ClipperLib.PolyFillType.pftNonZero,
    ClipperLib.PolyFillType.pftNonZero,
  );
  return solution.map(fromClipper);
}

// Project all NFP points into world-space given current part position offset
function nfpToWorldPoints(
  nfpPolygon: NestPolygon,
  offsetx: number,
  offsety: number,
): Point[] {
  return nfpPolygon.map((p) => ({ x: p.x + offsetx, y: p.y + offsety }));
}

interface ScoredPosition {
  x: number;
  y: number;
  score: number;
}

function scorePosition(
  x: number,
  y: number,
  transformedPart: NestPolygon,
  placed: PartPlacement[],
  placedParts: NestPolygon[],
  corner: string,
): number {
  const bounds = GeometryUtil.getPolygonBounds(transformedPart);
  // Horizontal extents including the candidate part
  let maxRight = (bounds ? bounds.x + bounds.width : 0) + x;
  let minLeft = (bounds ? bounds.x : 0) + x;
  for (let i = 0; i < placed.length; i++) {
    const p = placed[i];
    const pb = GeometryUtil.getPolygonBounds(
      GeometryUtil.transformPolygon(placedParts[i], p.rotation, p.mirrored),
    );
    if (pb) {
      maxRight = Math.max(maxRight, pb.x + pb.width + p.x);
      minLeft = Math.min(minLeft, pb.x + p.x);
    }
  }
  // Each corner favours a different horizontal primary + vertical bias:
  //   TL — pack left  (minimize maxRight), bias toward small y (top)
  //   TR — pack right (minimize -minLeft), bias toward small y (top)
  //   BL — pack left  (minimize maxRight), bias toward large y (bottom)
  //   BR — pack right (minimize -minLeft), bias toward large y (bottom)
  const horiz = corner === "TR" || corner === "BR" ? -minLeft : maxRight;
  const vertBias = corner === "BL" || corner === "BR" ? -y * 0.001 : y * 0.001;
  return horiz + vertBias;
}

function placeParts(input: PlacementWorkerInput): PlacementResult {
  const {
    placelist,
    rotations,
    mirrors,
    binPolygon,
    nfpCache: cacheEntries,
    config,
    existingPlacements,
    fillInOrder,
  } = input;
  const nfpCache = new Map<string, NestPolygon[]>(cacheEntries);
  const binBounds = GeometryUtil.getPolygonBounds(binPolygon);

  // When existingPlacements is provided we skip the main placement loop and
  // jump straight to the fill-in pass below.
  const allPlacements: PartPlacement[][] = existingPlacements
    ? existingPlacements.map((bin) => bin.map((p) => ({ ...p })))
    : [];
  let fitness = 0;

  let remaining = existingPlacements ? [] : placelist.slice();
  let remainingRotations = existingPlacements ? [] : rotations.slice();
  let remainingMirrors = existingPlacements ? [] : mirrors.slice();

  while (remaining.length > 0) {
    const countAtRoundStart = remaining.length;
    const binPlacements: PartPlacement[] = [];
    const placedParts: NestPolygon[] = [];
    const placed: PartPlacement[] = [];
    const nextRemaining: NestPolygon[] = [];
    const nextRotations: number[] = [];
    const nextMirrors: boolean[] = [];

    for (let idx = 0; idx < remaining.length; idx++) {
      const part = remaining[idx];
      const rotation = remainingRotations[idx];
      const mirrored = remainingMirrors[idx] ?? false;
      const transformedPart = GeometryUtil.transformPolygon(
        part,
        rotation,
        mirrored,
      );

      const ifpKey: NfpKey = {
        A: binPolygon.id ?? -1,
        B: part.id ?? idx,
        inside: true,
        Arotation: 0,
        Brotation: rotation,
        Amirrored: false,
        Bmirrored: mirrored,
      };
      const ifp = nfpCache.get(serializeKey(ifpKey));

      if (!ifp || ifp.length === 0) {
        // Part can't fit in bin at this rotation
        nextRemaining.push(part);
        nextRotations.push(rotation);
        nextMirrors.push(mirrored);
        continue;
      }

      // Build union of outer NFPs from already-placed parts — the region this
      // part may NOT occupy without overlapping something already down.
      // If the NFP for any placed part is missing we cannot guarantee a
      // non-overlapping position, so bail out and defer to the next sheet.
      const nfpUnionPolys: Point[][] = [];
      let missingNfp = false;
      for (const pp of placed) {
        const nfpKey: NfpKey = {
          A: pp.id ?? -1,
          B: part.id ?? idx,
          inside: false,
          Arotation: pp.rotation,
          Brotation: rotation,
          Amirrored: pp.mirrored,
          Bmirrored: mirrored,
        };
        const nfp = nfpCache.get(serializeKey(nfpKey));
        if (!nfp) {
          missingNfp = true;
          break;
        }
        for (const poly of nfp) {
          nfpUnionPolys.push(nfpToWorldPoints(poly, pp.x, pp.y));
        }
      }

      if (missingNfp) {
        nextRemaining.push(part);
        nextRotations.push(rotation);
        nextMirrors.push(mirrored);
        continue;
      }

      // Valid region = IFP − union(outer NFPs).  Its vertices are the candidate
      // positions: each one has the part flush against a placed part or a bin
      // wall.  Merely filtering the IFP's own corners would never surface these
      // tucked-in spots, so parts would spill into extra bins.
      // Both branches go through Clipper so the degenerate zero-area spike that
      // noFitPolygonRectangle emits (points 1-2-3 are collinear, with point 2
      // reaching past the true limit) gets cleaned away instead of being offered
      // as a position that hangs the part off the bin edge.
      const validRegion =
        nfpUnionPolys.length > 0
          ? clipperDifference(ifp as Point[][], clipperUnion(nfpUnionPolys))
          : clipperUnion(ifp as Point[][]);

      const transformedBounds = GeometryUtil.getPolygonBounds(transformedPart);

      const candidates: Point[] = [];
      for (const poly of validRegion) {
        for (const c of poly) {
          // Belt-and-braces containment check.  A correct IFP already guarantees
          // this, but there are two independent IFP code paths (rectangle and
          // orbital) and a part silently placed outside the bin is a much worse
          // failure than one reported as unplaced.
          if (binBounds && transformedBounds) {
            const eps = 1e-6;
            const left = transformedBounds.x + c.x;
            const top = transformedBounds.y + c.y;
            if (
              left < binBounds.x - eps ||
              top < binBounds.y - eps ||
              left + transformedBounds.width >
                binBounds.x + binBounds.width + eps ||
              top + transformedBounds.height >
                binBounds.y + binBounds.height + eps
            ) {
              continue;
            }
          }
          candidates.push(c);
        }
      }

      if (candidates.length === 0) {
        nextRemaining.push(part);
        nextRotations.push(rotation);
        nextMirrors.push(mirrored);
        continue;
      }

      // Find best candidate by score
      let best: ScoredPosition | null = null;
      for (const c of candidates) {
        const score = scorePosition(
          c.x,
          c.y,
          transformedPart,
          placed,
          placedParts,
          config.gravityCorner ?? "TL",
        );
        if (!best || score < best.score) best = { x: c.x, y: c.y, score };
      }

      if (!best) {
        nextRemaining.push(part);
        nextRotations.push(rotation);
        nextMirrors.push(mirrored);
        continue;
      }

      const placement: PartPlacement = {
        id: part.id ?? idx,
        x: best.x,
        y: best.y,
        rotation,
        mirrored,
      };
      placed.push({ ...placement, id: part.id ?? idx });
      binPlacements.push(placement);
      placedParts.push(part);
    }

    // Only record a bin that actually holds something, so an unplaceable part
    // can't manufacture phantom empty bins in the result.
    if (binPlacements.length > 0) {
      allPlacements.push(binPlacements);
      fitness += 1; // each bin used adds to fitness
    }

    // Parts that didn't fit go to the next bin
    remaining = nextRemaining;
    remainingRotations = nextRotations;
    remainingMirrors = nextMirrors;

    // Nothing was placed this round, so another round would behave identically.
    // (Comparing against the original placelist length instead would never fire
    // when only some parts are unplaceable, and would spin forever.)
    if (nextRemaining.length === countAtRoundStart) break;
  }

  // Fill-in pass: greedily pack copies of the parts (smallest-first) into any
  // remaining space on the last sheet.
  if (config.fillInMode && allPlacements.length > 0) {
    try {
      // Map part id → shape polygon for quick lookup (used for existing-bin
      // reconstruction where we have instance ids, not source ids).
      const shapeById = new Map<number, NestPolygon>();
      for (const p of placelist) if (p.id != null) shapeById.set(p.id, p);

      // One representative polygon per unique SHAPE TYPE (source).  Multiple
      // instances of the same shape share the same source id; without this
      // grouping every instance would appear as a separate candidate and the
      // fill-in would dump N copies of the same tiny piece in one pass.
      const shapeBySource = new Map<number, NestPolygon>();
      // All instance IDs per source — used to find cached NFPs regardless of
      // which specific instance pair the main run happened to compute.
      const instancesBySource = new Map<number, number[]>();
      for (const p of placelist) {
        const key = p.source ?? p.id ?? 0;
        if (!shapeBySource.has(key)) shapeBySource.set(key, p);
        if (!instancesBySource.has(key)) instancesBySource.set(key, []);
        if (p.id != null) instancesBySource.get(key)!.push(p.id);
      }

      // Counter per source for cycling filler IDs through real instance IDs.
      // When a filler uses an actual instance ID, the direct NFP cache lookup
      // succeeds instead of falling through to the over-conservative bbox fallback.
      const fillerCountBySource = new Map<number, number>();

      // Helper: look up an outer NFP by direct key first, then try all instance-ID
      // combinations of the same source pair.  This recovers cached NFPs even
      // when filler copies end up sharing an id (e.g. copy-vs-copy) or when the
      // main run stored the pair under different instance IDs.
      function findNfp(key: NfpKey): NestPolygon[] | undefined {
        const direct = nfpCache.get(serializeKey(key));
        if (direct) return direct;
        const aSrc = shapeById.get(key.A)?.source ?? key.A;
        const bSrc = shapeById.get(key.B)?.source ?? key.B;
        const aIds = instancesBySource.get(aSrc) ?? [key.A];
        const bIds = instancesBySource.get(bSrc) ?? [key.B];
        for (const altA of aIds) {
          for (const altB of bIds) {
            if (altA === key.A && altB === key.B) continue;
            const nfp = nfpCache.get(
              serializeKey({ ...key, A: altA, B: altB }),
            );
            if (nfp) return nfp;
          }
        }
        return undefined;
      }

      // Build the ordered list of shapes to try — ONE entry per shape type.
      // When the caller provides an explicit source-keyed ordering (for
      // iterative optimisation), honour it; otherwise default to
      // area-ascending so smallest types are placed first.
      const uniqueShapes: NestPolygon[] = fillInOrder
        ? fillInOrder
            .map((key) => shapeBySource.get(key))
            .filter((s): s is NestPolygon => s != null)
        : [...shapeBySource.values()].sort(
            (a, b) =>
              Math.abs(GeometryUtil.polygonArea(a)) -
              Math.abs(GeometryUtil.polygonArea(b)),
          );

      // Build allowed orientations per shape using the same rules as the main
      // nesting algorithm: validAngles (or grainAngles when grain is on) ×
      // mirror options.  This ensures filler copies can be placed at any valid
      // rotation, not just the angles the GA happened to converge on.
      const mirrorOptions = config.allowMirroring ? [false, true] : [false];
      const baseAngles = validAngles(config);

      function orientationsForShape(
        shape: NestPolygon,
      ): Array<{ rotation: number; mirrored: boolean }> {
        const result: Array<{ rotation: number; mirrored: boolean }> = [];
        for (const mirrored of mirrorOptions) {
          const angles =
            config.grainAxis === "off"
              ? baseAngles
              : grainAngles(
                  shape,
                  config.grainAxis,
                  config.grainTolerance,
                  mirrored,
                );
          for (const rotation of angles) {
            result.push({ rotation, mirrored });
          }
        }
        return result;
      }

      // Safety cap spread across all bins to prevent hanging the worker.
      const MAX_FILLERS = 500;
      let totalAdded = 0;

      // Run the fill-in pass on EVERY bin, not just the last one.
      for (const currentBin of allPlacements) {
        if (totalAdded >= MAX_FILLERS) break;

        // Reconstruct the placed state of this bin as guaranteed-parallel
        // arrays (required by scorePosition).
        const filledPlaced: PartPlacement[] = [];
        const filledParts: NestPolygon[] = [];
        for (const p of currentBin) {
          const shape = shapeById.get(p.id);
          if (shape) {
            filledPlaced.push({ ...p });
            filledParts.push(shape);
          }
        }

        let anyAdded = true;
        while (anyAdded && totalAdded < MAX_FILLERS) {
          anyAdded = false;

          for (const shape of uniqueShapes) {
            if (totalAdded >= MAX_FILLERS) break;

            let bestPos: ScoredPosition | null = null;
            let bestRot = 0;
            let bestMirror = false;

            const orientations = orientationsForShape(shape);

            for (const { rotation, mirrored } of orientations) {
              const transformedPart = GeometryUtil.transformPolygon(
                shape,
                rotation,
                mirrored,
              );

              // Inner-fit polygon: where can the part's reference point sit?
              const ifpKey: NfpKey = {
                A: binPolygon.id ?? -1,
                B: shape.id ?? 0,
                inside: true,
                Arotation: 0,
                Brotation: rotation,
                Amirrored: false,
                Bmirrored: mirrored,
              };
              let ifp = nfpCache.get(serializeKey(ifpKey));
              if (!ifp || ifp.length === 0) {
                // IFP not cached for this rotation — derive it from bounding
                // boxes.  For a rectangular bin this is exact; for a
                // non-rectangular bin it is slightly permissive, but the
                // per-candidate bounds check below still guards placement.
                const tb2 = GeometryUtil.getPolygonBounds(transformedPart);
                if (!tb2 || !binBounds) continue;
                const ix0 = binBounds.x - tb2.x;
                const iy0 = binBounds.y - tb2.y;
                const ix1 = binBounds.x + binBounds.width - tb2.x - tb2.width;
                const iy1 = binBounds.y + binBounds.height - tb2.y - tb2.height;
                if (ix1 < ix0 || iy1 < iy0) continue; // part doesn't fit bin
                ifp = [
                  [
                    { x: ix0, y: iy0 },
                    { x: ix1, y: iy0 },
                    { x: ix1, y: iy1 },
                    { x: ix0, y: iy1 },
                  ] as unknown as NestPolygon,
                ];
              }

              // Build the union of no-fit polygons for every currently-placed
              // part.  When the precise NFP is missing (e.g. part vs its own
              // copy) fall back to a bounding-box NFP — conservative but safe.
              const nfpUnion: Point[][] = [];
              for (let fi = 0; fi < filledPlaced.length; fi++) {
                const pp = filledPlaced[fi];
                const ppShape = filledParts[fi];
                const outerKey: NfpKey = {
                  A: pp.id,
                  B: shape.id ?? 0,
                  inside: false,
                  Arotation: pp.rotation,
                  Brotation: rotation,
                  Amirrored: pp.mirrored,
                  Bmirrored: mirrored,
                };
                const nfp = findNfp(outerKey);
                if (nfp) {
                  for (const poly of nfp)
                    nfpUnion.push(nfpToWorldPoints(poly, pp.x, pp.y));
                } else {
                  // Try an exact convex Minkowski NFP before falling back to
                  // the coarse bbox approximation.  Exact for triangles,
                  // quads, and other convex shapes; falls through to bbox for
                  // non-convex shapes.
                  const ppTransformed = GeometryUtil.transformPolygon(
                    ppShape,
                    pp.rotation,
                    pp.mirrored,
                  );
                  const minkNfp = convexMinkowskiNfp(
                    ppTransformed as Point[],
                    transformedPart as Point[],
                  );
                  if (minkNfp && minkNfp.length >= 3) {
                    nfpUnion.push(
                      nfpToWorldPoints(
                        minkNfp as unknown as NestPolygon,
                        pp.x,
                        pp.y,
                      ),
                    );
                  } else {
                    // Last-resort bbox Minkowski-difference fallback.
                    const ba = GeometryUtil.getPolygonBounds(ppTransformed);
                    const bb = GeometryUtil.getPolygonBounds(transformedPart);
                    if (ba && bb) {
                      const x0 = ba.x - bb.x - bb.width + pp.x;
                      const x1 = ba.x - bb.x + ba.width + pp.x;
                      const y0 = ba.y - bb.y - bb.height + pp.y;
                      const y1 = ba.y - bb.y + ba.height + pp.y;
                      nfpUnion.push([
                        { x: x0, y: y0 },
                        { x: x1, y: y0 },
                        { x: x1, y: y1 },
                        { x: x0, y: y1 },
                      ]);
                    }
                  }
                }
              }

              const validRegion =
                nfpUnion.length > 0
                  ? clipperDifference(ifp as Point[][], clipperUnion(nfpUnion))
                  : clipperUnion(ifp as Point[][]);

              const tb = GeometryUtil.getPolygonBounds(transformedPart);
              for (const poly of validRegion) {
                for (const c of poly) {
                  if (binBounds && tb) {
                    const eps = 1e-6;
                    if (
                      tb.x + c.x < binBounds.x - eps ||
                      tb.y + c.y < binBounds.y - eps ||
                      tb.x + c.x + tb.width >
                        binBounds.x + binBounds.width + eps ||
                      tb.y + c.y + tb.height >
                        binBounds.y + binBounds.height + eps
                    )
                      continue;
                  }
                  const score = scorePosition(
                    c.x,
                    c.y,
                    transformedPart,
                    filledPlaced,
                    filledParts,
                    config.gravityCorner ?? "BL",
                  );
                  if (!bestPos || score < bestPos.score) {
                    bestPos = { x: c.x, y: c.y, score };
                    bestRot = rotation;
                    bestMirror = mirrored;
                  }
                }
              }
            }

            if (bestPos) {
              // Cycle through the real instance IDs for this source so that
              // subsequent copy-vs-copy NFP lookups hit the cache (which was
              // keyed on actual instance pairs) rather than always falling back
              // to the over-conservative bbox approximation.
              const srcKey = shape.source ?? shape.id ?? 0;
              const instances = instancesBySource.get(srcKey) ?? [
                shape.id ?? 0,
              ];
              const idx = fillerCountBySource.get(srcKey) ?? 0;
              fillerCountBySource.set(srcKey, idx + 1);
              const fillerId = instances[idx % instances.length];

              const filler: PartPlacement = {
                id: fillerId,
                x: bestPos.x,
                y: bestPos.y,
                rotation: bestRot,
                mirrored: bestMirror,
              };
              filledPlaced.push({ ...filler });
              filledParts.push(shape);
              currentBin.push(filler);
              anyAdded = true;
              totalAdded++;
            }
          }
        }
      }
    } catch {
      // Fill-in failed — return the layout as-is without crashing the engine.
    }
  }

  // Add penalty for unplaced parts
  fitness += 2 * remaining.length;

  // Minimize used width across all placements
  let totalWidth = 0;
  for (const bpl of allPlacements) {
    let maxX = 0;
    for (const p of bpl) {
      const part = placelist.find((pl) => pl.id === p.id);
      if (part) {
        const b = GeometryUtil.getPolygonBounds(
          GeometryUtil.transformPolygon(part, p.rotation, p.mirrored),
        );
        if (b) maxX = Math.max(maxX, p.x + b.width);
      }
    }
    totalWidth += maxX;
  }
  fitness +=
    totalWidth / (GeometryUtil.getPolygonBounds(binPolygon)?.width ?? 1);

  return { placements: allPlacements, fitness };
}

self.addEventListener("message", (ev: MessageEvent<PlacementWorkerInput>) => {
  const result = placeParts(ev.data);
  self.postMessage(result);
});
