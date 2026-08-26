/**
 * NestEngine — orchestrates the full nesting pipeline:
 *   1. Parse SVG → polygons
 *   2. Build NFP pairs needed for the current individual
 *   3. Dispatch NFP computation to workers
 *   4. Run placement worker
 *   5. Feed fitness back to GA/SA
 *   6. Emit progress callbacks
 *
 * Improvements over original:
 * - Typed throughout
 * - Persistent IndexedDB NFP cache (survives page refresh)
 * - SharedArrayBuffer in-flight deduplication
 * - SA optimizer alongside GA
 * - WebGPU scoring in placement step
 * - RDP polygon simplification before NFP computation
 */

import ClipperLib from "clipper-lib";
import type {
  NestPolygon,
  NestConfig,
  NestStats,
  PlacementResult,
  PartPlacement,
  NfpKey,
} from "src/types";
import { DEFAULT_CONFIG } from "src/types";
import { parseSvg, type ParseResult } from "src/core/svg-parser";
import { GeometryUtil } from "src/core/geometry";
import { simplifyPolygon } from "src/core/simplify";
import { NfpCache, serializeKey } from "src/core/nfp-cache";
import {
  GeneticAlgorithm,
  SimulatedAnnealing,
  enforceGrainAngles,
  seedPopulation,
} from "src/core/optimizer";
import {
  initGpu,
  isGpuAvailable,
  isSharedMemAvailable,
} from "src/core/nest-engine-util";

import NfpWorker from "src/workers/nfp.worker?worker";
import PlacementWorker from "src/workers/placement.worker?worker";

// ---------------------------------------------------------------------------
// Worker pool
// ---------------------------------------------------------------------------

const WORKER_COUNT = Math.max(1, (navigator.hardwareConcurrency ?? 4) - 1);

function shuffleArray<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

class WorkerPool {
  private workers: Worker[] = [];
  private queue: Array<{
    data: unknown;
    resolve: (v: unknown) => void;
    reject: (e: unknown) => void;
  }> = [];
  private idle: Worker[] = [];

  constructor(
    private factory: () => Worker,
    count: number,
  ) {
    for (let i = 0; i < count; i++) {
      const w = factory();
      w.onmessage = (e) => this.onResult(w, e.data);
      w.onerror = (e) => this.onError(w, e);
      this.idle.push(w);
    }
  }

  run<T>(data: unknown): Promise<T> {
    return new Promise((resolve, reject) => {
      this.queue.push({
        data,
        resolve: resolve as (v: unknown) => void,
        reject,
      });
      this.drain();
    });
  }

  private drain() {
    while (this.queue.length > 0 && this.idle.length > 0) {
      const worker = this.idle.pop()!;
      const task = this.queue.shift()!;
      (worker as any).__task = task;
      worker.postMessage(task.data);
    }
  }

  private onResult(worker: Worker, data: unknown) {
    const task = (worker as any).__task;
    (worker as any).__task = null;
    this.idle.push(worker);
    task?.resolve(data);
    this.drain();
  }

  private onError(worker: Worker, e: ErrorEvent) {
    const task = (worker as any).__task;
    (worker as any).__task = null;
    this.idle.push(worker);
    task?.reject(e);
    this.drain();
  }

  terminate() {
    this.workers.forEach((w) => w.terminate());
    this.workers = [];
    this.idle = [];
  }
}

// ---------------------------------------------------------------------------
// Clipper integration (for polygon offset)
// ---------------------------------------------------------------------------

/**
 * Cap on how far a mitered corner may extend, as a multiple of the offset
 * distance. Beyond this Clipper bevels the corner instead.
 */
const MITER_LIMIT = 4;

function offsetPolygon(
  polygon: NestPolygon,
  offset: number,
  config: NestConfig,
): NestPolygon[] {
  if (offset === 0) return [polygon];
  const scale = config.clipperScale;
  const path = polygon.map((p) => ({
    X: Math.round(p.x * scale),
    Y: Math.round(p.y * scale),
  }));
  // Miter joins keep corners sharp. Round joins would arc every convex corner
  // by the offset distance, visibly deforming rectangles and other hard-edged
  // parts once the gap is more than hairline. MITER_LIMIT squares off joins on
  // very acute angles instead of letting them shoot out into long spikes.
  const co = new ClipperLib.ClipperOffset(
    MITER_LIMIT,
    config.curveTolerance * scale,
  );
  co.AddPath(
    path,
    ClipperLib.JoinType.jtMiter,
    ClipperLib.EndType.etClosedPolygon,
  );
  const result: ClipperLib.Paths = [];
  co.Execute(result, offset * scale);
  return result.map(
    (p: { X: number; Y: number }[]) =>
      p.map((pt) => ({ x: pt.X / scale, y: pt.Y / scale })) as NestPolygon,
  );
}

/**
 * Bounding-box Minkowski difference — used as a conservative fallback NFP when
 * the precise Minkowski sum fails for degenerate geometry.  It over-excludes
 * slightly (allows less room than strictly necessary) but never under-excludes,
 * so it cannot produce an overlapping placement.
 */
function bboxMinkowskiDiff(
  A: NestPolygon,
  B: NestPolygon,
): NestPolygon[] | null {
  const ba = GeometryUtil.getPolygonBounds(A);
  const bb = GeometryUtil.getPolygonBounds(B);
  if (!ba || !bb) return null;
  // NFP = set of δ where (B + δ) touches A at origin.
  // For bounding boxes: δ ranges from (ba.x − bb.x − bb.width) to
  // (ba.x + ba.width − bb.x).
  const minX = ba.x - bb.x - bb.width;
  const minY = ba.y - bb.y - bb.height;
  const maxX = ba.x + ba.width - bb.x;
  const maxY = ba.y + ba.height - bb.y;
  return [
    [
      { x: minX, y: minY },
      { x: maxX, y: minY },
      { x: maxX, y: maxY },
      { x: minX, y: maxY },
    ] as NestPolygon,
  ];
}

function cleanPolygon(
  polygon: NestPolygon,
  config: NestConfig,
): NestPolygon | null {
  const scale = config.clipperScale;
  const path = polygon.map((p) => ({
    X: Math.round(p.x * scale),
    Y: Math.round(p.y * scale),
  }));
  const simple = ClipperLib.Clipper.SimplifyPolygon(
    path,
    ClipperLib.PolyFillType.pftNonZero,
  );
  if (!simple || simple.length === 0) return null;
  let biggest = simple[0];
  let biggestArea = Math.abs(ClipperLib.Clipper.Area(biggest));
  for (let i = 1; i < simple.length; i++) {
    const area = Math.abs(ClipperLib.Clipper.Area(simple[i]));
    if (area > biggestArea) {
      biggest = simple[i];
      biggestArea = area;
    }
  }
  const clean = ClipperLib.Clipper.CleanPolygon(
    biggest,
    config.curveTolerance * scale,
  );
  if (!clean || clean.length === 0) return null;
  return clean.map((p: { X: number; Y: number }) => ({
    x: p.X / scale,
    y: p.Y / scale,
  })) as NestPolygon;
}

// ---------------------------------------------------------------------------
// NestEngine
// ---------------------------------------------------------------------------

export interface NestEngineCallbacks {
  onProgress: (stats: NestStats) => void;
  onPlacement: (placements: PartPlacement[][], stats: NestStats) => void;
}

export class NestEngine {
  private config: NestConfig;
  private nfpPool: WorkerPool;
  private placementPool: WorkerPool;
  private nfpCache: NfpCache;
  private ga: GeneticAlgorithm | null = null;
  private sa: SimulatedAnnealing | null = null;
  private running = false;
  /** Incremented per start() so a stale loop can tell it has been superseded. */
  private runId = 0;
  private iteration = 0;
  private startTime = 0;
  private bestResult: PlacementResult | null = null;
  private parseResult: ParseResult | null = null;
  private binPolygon: NestPolygon | null = null;
  private tree: NestPolygon[] = [];

  /**
   * Collision geometry: parts inflated by half the part gap and shifted to
   * origin. This is what the nester packs, so these outlines end up tangent to
   * each other — do not render them, or a gap looks like parts touching.
   */
  preparedPartsMap: Map<number, NestPolygon> = new Map();

  /**
   * Display geometry: the true part outlines, in the same coordinate frame as
   * `preparedPartsMap`, so one placement applies to either. Render these.
   */
  partOutlines: Map<number, NestPolygon> = new Map();

  /**
   * Translation from the placement frame to the full-size bin's frame. The
   * nester places parts relative to the corner of the *shrunk* bin, which sits
   * half a part gap inside the real one; the canvas draws the real bin. Add this
   * to a placement to move it into what's drawn.
   */
  binOffset: { x: number; y: number } = { x: 0, y: 0 };

  constructor(config: Partial<NestConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.nfpCache = new NfpCache();
    this.nfpPool = new WorkerPool(() => new NfpWorker(), WORKER_COUNT);
    this.placementPool = new WorkerPool(() => new PlacementWorker(), 1);
  }

  updateConfig(patch: Partial<NestConfig>) {
    // Any of these invalidate cached NFPs or the seeded population: geometry
    // changes (spacing/tolerance) or the set of angles parts may be tried at.
    const needsReset =
      patch.curveTolerance !== undefined ||
      patch.spacing !== undefined ||
      patch.perimeterGap !== undefined ||
      patch.rotations !== undefined ||
      patch.allowMirroring !== undefined ||
      patch.grainAxis !== undefined ||
      patch.grainTolerance !== undefined ||
      patch.gravityCorner !== undefined;
    this.config = { ...this.config, ...patch };
    if (needsReset) {
      this.ga = null;
      this.sa = null;
      this.nfpCache.clearMemory();
    }
  }

  loadSvg(svgString: string): ParseResult {
    this.parseResult = parseSvg(svgString, {
      tolerance: this.config.curveTolerance,
    });
    return this.parseResult;
  }

  /** Accept pre-parsed polygons (e.g. from the parse worker) without re-parsing. */
  setPolygons(polygons: NestPolygon[]): NestPolygon[] {
    this.parseResult = {
      polygons,
      svgRoot: null as unknown as SVGSVGElement,
      svgString: "",
    };
    return polygons;
  }

  setBin(binId: number) {
    if (!this.parseResult) return;
    const all = this.parseResult.polygons;
    const binPoly = all.find((p) => p.id === binId);
    if (!binPoly) return;

    this.binPolygon = binPoly;
    this.tree = all.filter((p) => p.id !== binId);
    this.ga = null;
    this.sa = null;
  }

  async start(callbacks: NestEngineCallbacks) {
    if (this.running || !this.binPolygon || this.tree.length === 0) return;

    // Identify this run so a loop left mid-await by stop() cannot resume and race
    // the next one: stop() clears `running` synchronously, but the in-flight
    // iteration only notices when it returns, by which time a restart may have set
    // `running` back to true and adopted the stale loop.
    const runId = ++this.runId;
    this.running = true;
    this.startTime = Date.now();

    // A run reports its own best, so clear the previous one. Keeping it would
    // gate every callback behind beating a fully converged earlier result, and
    // the UI would sit empty indefinitely after stop-then-start.
    this.bestResult = null;
    this.iteration = 0;

    // Initialize GPU
    await initGpu();

    // Prepare tree — simplify, clean, offset for spacing, normalize to origin
    const prepared = this.prepareTree();
    this.preparedPartsMap = new Map(prepared.map((p) => [p.id!, p]));
    const binPoly = this.prepareBin();
    if (!binPoly) {
      this.running = false;
      return;
    }

    // Seed GA
    const sorted = seedPopulation(prepared, binPoly, this.config);
    const ga = new GeneticAlgorithm(sorted, binPoly, this.config);
    this.ga = ga;

    while (this.running && this.runId === runId) {
      const individual = ga.next();
      await this.evaluateIndividual(individual, binPoly, callbacks);
      this.iteration++;
    }
  }

  stop() {
    this.running = false;
  }

  private fillingIn = false;
  private fillInRunId = 0;

  /**
   * Starts a continuous fill-in optimisation loop.  Each iteration tries a
   * different ordering of shapes to find the arrangement that places the most
   * copies in the remaining space on the last sheet.  Calls onPlacement
   * whenever it beats the current best fill count, and onProgress otherwise.
   */
  async startFillIn(callbacks: NestEngineCallbacks) {
    if (
      this.fillingIn ||
      !this.bestResult ||
      !this.binPolygon ||
      this.preparedPartsMap.size === 0
    )
      return;

    const runId = ++this.fillInRunId;
    this.fillingIn = true;

    const baselinePlacements = this.bestResult.placements;
    const baselineTotalCount = baselinePlacements.reduce(
      (sum, bin) => sum + bin.length,
      0,
    );

    const binPoly = this.prepareBin();
    if (!binPoly) {
      this.fillingIn = false;
      return;
    }

    // One representative id per unique shape SOURCE (i.e. shape type), sorted
    // by area ascending.  Using source keys matches the worker's deduplication
    // so each round places one copy of each type, not one per clone.
    const sourceMap = new Map<number, NestPolygon>();
    for (const p of this.preparedPartsMap.values()) {
      const key = p.source ?? p.id ?? 0;
      if (!sourceMap.has(key)) sourceMap.set(key, p);
    }
    const uniqueIds = Array.from(sourceMap.keys()).sort((a, b) => {
      return (
        Math.abs(GeometryUtil.polygonArea(sourceMap.get(a)!)) -
        Math.abs(GeometryUtil.polygonArea(sourceMap.get(b)!))
      );
    });

    let bestFillCount = -1;
    let bestPlacements: PartPlacement[][] = baselinePlacements;
    let iteration = 0;

    while (this.fillingIn && this.fillInRunId === runId) {
      const order =
        iteration === 0 ? [...uniqueIds] : shuffleArray([...uniqueIds]);

      const result = await this.placementPool.run<PlacementResult>({
        placelist: Array.from(this.preparedPartsMap.values()),
        rotations: [],
        mirrors: [],
        binPolygon: binPoly,
        nfpCache: this.nfpCache.toEntries(),
        config: { ...this.config, fillInMode: true },
        existingPlacements: baselinePlacements,
        fillInOrder: order,
      });

      const resultTotalCount = result.placements.reduce(
        (sum, bin) => sum + bin.length,
        0,
      );
      const fillerCount = resultTotalCount - baselineTotalCount;

      const stats = this.buildStats({
        placements: result.placements,
        fitness: result.fitness,
      });

      if (fillerCount > bestFillCount) {
        bestFillCount = fillerCount;
        bestPlacements = result.placements;
        callbacks.onPlacement(bestPlacements, stats);
      } else {
        callbacks.onProgress({ ...stats, iterations: iteration });
      }

      iteration++;
    }

    this.fillingIn = false;
  }

  stopFillIn() {
    this.fillingIn = false;
  }

  reset() {
    this.running = false;
    this.runId++;
    this.ga = null;
    this.sa = null;
    this.nfpCache.clearMemory();
    this.bestResult = null;
    this.iteration = 0;
    this.preparedPartsMap = new Map();
    this.partOutlines = new Map();
    this.binOffset = { x: 0, y: 0 };
  }

  /**
   * `config.spacing` is a percentage of the bin's longer side, not a length, so
   * the same setting behaves consistently whatever units the artwork uses.
   * Resolve it against the raw selected bin (not the cleaned/offset one) so the
   * parts and the bin are always grown/shrunk by the same absolute amount.
   */
  private resolveSpacing(): number {
    return this.config.spacing > 0 ? this.config.spacing : 0;
  }

  private prepareTree(): NestPolygon[] {
    const spacing = this.resolveSpacing();
    const result: NestPolygon[] = [];
    this.partOutlines = new Map();
    for (const part of this.tree) {
      let poly = cleanPolygon(part, this.config);
      if (!poly) continue;
      // RDP simplification — reduce vertex count before NFP
      const simplified = simplifyPolygon(
        poly,
        this.config.curveTolerance * 0.5,
      );
      poly = simplified as NestPolygon;
      // Copy the true outline aside before the clearance offset inflates it.
      const trueOutline = poly.map((p) => ({ x: p.x, y: p.y }));
      if (spacing > 0) {
        const offset = offsetPolygon(poly, spacing * 0.5, this.config);
        if (offset.length > 0) poly = offset[0];
      }
      // Normalize each part to start at origin.  The placement algorithm
      // uses the bin at (0,0) and computes IFP offsets relative to that.
      // Keeping parts at their original SVG positions produces the same
      // mathematical result, but normalising here (a) avoids very large
      // Clipper integers for distant polygons, (b) makes the scoring and
      // outer-NFP translation simpler, and (c) is consistent with the
      // original SVGnest approach.
      const bounds = GeometryUtil.getPolygonBounds(poly);
      const ox = bounds?.x ?? 0;
      const oy = bounds?.y ?? 0;
      if (ox !== 0 || oy !== 0) {
        poly = poly.map((p) => ({
          x: p.x - ox,
          y: p.y - oy,
        })) as NestPolygon;
      }
      if (GeometryUtil.polygonArea(poly) > 0) poly.reverse();
      poly.id = part.id;
      poly.source = part.source;
      result.push(poly);

      // Shift the true outline by the same amount, so it stays seated where it
      // belongs inside its inflated envelope. Both then share one frame and a
      // single placement + rotation + flip applies to either.
      const outline = trueOutline.map((p) => ({
        x: p.x - ox,
        y: p.y - oy,
      })) as NestPolygon;
      outline.id = part.id;
      outline.source = part.source;
      this.partOutlines.set(part.id!, outline);
    }
    return result;
  }

  private prepareBin(): NestPolygon | null {
    if (!this.binPolygon) return null;
    const rawBounds = GeometryUtil.getPolygonBounds(this.binPolygon);
    let poly = cleanPolygon(this.binPolygon, this.config);
    if (!poly || poly.length < 3) return null;
    // Shrink the bin by the perimeter gap so parts stay that far from the
    // sheet edge.  Part gap (spacing) is NOT applied here — it only inflates
    // individual parts so they maintain spacing between each other.
    const pg = this.config.perimeterGap > 0 ? this.config.perimeterGap : 0;
    if (pg > 0) {
      const offset = offsetPolygon(poly, -pg, this.config);
      if (offset.length > 0) poly = offset[0];
    }
    const bounds = GeometryUtil.getPolygonBounds(poly);
    this.binOffset = {
      x: (bounds?.x ?? 0) - (rawBounds?.x ?? 0),
      y: (bounds?.y ?? 0) - (rawBounds?.y ?? 0),
    };
    if (bounds) {
      for (const p of poly) {
        p.x -= bounds.x;
        p.y -= bounds.y;
      }
      (poly as any).width = bounds.width;
      (poly as any).height = bounds.height;
    }
    if (GeometryUtil.polygonArea(poly) > 0) poly.reverse();
    poly.id = -1;
    return poly;
  }

  private async evaluateIndividual(
    individual: {
      placement: NestPolygon[];
      rotation: number[];
      mirrored: boolean[];
      fitness?: number;
    },
    binPoly: NestPolygon,
    callbacks: NestEngineCallbacks,
  ) {
    const { placement } = individual;
    // A flip is only honoured while the setting is on, so a stale population
    // carrying flips can never leak mirrored parts into the result.
    const mirrored = this.config.allowMirroring
      ? individual.mirrored
      : placement.map(() => false);

    // Snap rotations onto the grain before they reach the NFP keys or the
    // placement worker, then write them back so the genome matches the layout
    // that gets scored.
    const rotation = enforceGrainAngles(
      placement,
      individual.rotation,
      mirrored,
      this.config,
    );
    individual.rotation = rotation;

    // Collect NFP pairs that need computing
    const needed: { key: NfpKey; A: NestPolygon; B: NestPolygon }[] = [];
    for (let i = 0; i < placement.length; i++) {
      const ifpKey: NfpKey = {
        A: binPoly.id!,
        B: placement[i].id!,
        inside: true,
        Arotation: 0,
        Brotation: rotation[i],
        Amirrored: false,
        Bmirrored: mirrored[i],
      };
      if (!this.nfpCache.has(ifpKey)) {
        needed.push({ key: ifpKey, A: binPoly, B: placement[i] });
      }
      for (let j = 0; j < i; j++) {
        const outerKey: NfpKey = {
          A: placement[j].id!,
          B: placement[i].id!,
          inside: false,
          Arotation: rotation[j],
          Brotation: rotation[i],
          Amirrored: mirrored[j],
          Bmirrored: mirrored[i],
        };
        if (!this.nfpCache.has(outerKey)) {
          needed.push({ key: outerKey, A: placement[j], B: placement[i] });
        }
      }
    }

    // Compute missing NFPs in parallel batches
    if (needed.length > 0) {
      const batchSize = Math.ceil(needed.length / WORKER_COUNT);
      const batches: (typeof needed)[] = [];
      for (let i = 0; i < needed.length; i += batchSize)
        batches.push(needed.slice(i, i + batchSize));

      const results = await Promise.all(
        batches.map((batch) =>
          this.nfpPool.run<{ key: NfpKey; value: NestPolygon[] | null }[]>(
            batch.map(({ key, A, B }) => ({
              pair: { A, B, key },
              config: {
                clipperScale: this.config.clipperScale,
                exploreConcave: this.config.exploreConcave,
                useHoles: this.config.useHoles,
              },
            })),
          ),
        ),
      );

      for (const batch of results) {
        for (const { key, value } of batch) {
          if (value) {
            this.nfpCache.set(key, value);
          } else if (!key.inside) {
            // Outer NFP computation failed (degenerate geometry, Clipper error,
            // etc.).  Fall back to the Minkowski sum of the two bounding boxes
            // so the placement worker always has something to subtract.  A
            // bounding-box NFP is conservative (it forbids slightly more area
            // than necessary) but guarantees no overlap.
            const A = needed.find(
              (n) => serializeKey(n.key) === serializeKey(key),
            )?.A;
            const B = needed.find(
              (n) => serializeKey(n.key) === serializeKey(key),
            )?.B;
            if (A && B) {
              const bboxNfp = bboxMinkowskiDiff(
                GeometryUtil.transformPolygon(A, key.Arotation, key.Amirrored),
                GeometryUtil.transformPolygon(B, key.Brotation, key.Bmirrored),
              );
              if (bboxNfp) this.nfpCache.set(key, bboxNfp);
            }
          }
        }
      }
    }

    // Run placement
    const placementResult = await this.placementPool.run<PlacementResult>({
      placelist: placement,
      rotations: rotation,
      mirrors: mirrored,
      binPolygon: binPoly,
      nfpCache: this.nfpCache.toEntries(),
      config: this.config,
    });

    individual.fitness = placementResult.fitness;

    const isBest =
      !this.bestResult || placementResult.fitness < this.bestResult.fitness;
    if (isBest) this.bestResult = placementResult;
    const best = this.bestResult ?? placementResult;

    // Always describe the best layout, because that is the one the canvas is
    // showing. Reporting the candidate just evaluated instead made the panel
    // contradict the drawing — e.g. "2 sheets used" while a one-sheet layout was
    // on screen with no second bin to open. Only iterations and elapsed advance
    // between improvements.
    const stats = this.buildStats(best);
    if (isBest) callbacks.onPlacement(best.placements, stats);
    else callbacks.onProgress(stats);
  }

  private buildStats(result: PlacementResult): NestStats {
    const binArea = this.binPolygon
      ? Math.abs(GeometryUtil.polygonArea(this.binPolygon))
      : 1;
    let placedArea = 0;
    let partsPlaced = 0;
    for (const bin of result.placements) {
      for (const p of bin) {
        const part = this.tree.find((t) => t.id === p.id);
        if (part) {
          placedArea += Math.abs(GeometryUtil.polygonArea(part));
          partsPlaced++;
        }
      }
    }
    const bins = result.placements.length;
    return {
      iterations: this.iteration,
      // Guard the empty case: with nothing placed this is 0/0, which renders as
      // "NaN%".
      utilization: bins > 0 ? placedArea / (binArea * bins) : 0,
      partsPlaced,
      partsTotal: this.tree.length,
      binsUsed: bins,
      elapsed: Date.now() - this.startTime,
      gpuEnabled: isGpuAvailable(),
      sharedMemEnabled: isSharedMemAvailable(),
    };
  }
}
