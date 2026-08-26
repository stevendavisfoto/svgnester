// ---------------------------------------------------------------------------
// Core geometric primitives
// ---------------------------------------------------------------------------

export interface Point {
  x: number;
  y: number;
}

export interface Bounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** A flat list of {x,y} points representing a closed polygon. May carry extra metadata. */
export interface NestPolygon extends Array<Point> {
  id?: number;
  source?: number;
  rotation?: number;
  offsetx?: number;
  offsety?: number;
  width?: number;
  height?: number;
  children?: NestPolygon[];
  parent?: NestPolygon;
  hole?: boolean;
}

// ---------------------------------------------------------------------------
// NFP (No-Fit Polygon) types
// ---------------------------------------------------------------------------

export interface NfpKey {
  A: number;
  B: number;
  inside: boolean;
  Arotation: number;
  Brotation: number;
  /**
   * Mirroring produces a genuinely different outline (unless the part happens to
   * be symmetric), so it is part of the cache identity — a flipped part must not
   * reuse the unflipped part's NFP.
   */
  Amirrored: boolean;
  Bmirrored: boolean;
}

export type NfpMap = Map<string, NestPolygon[]>;

// ---------------------------------------------------------------------------
// Optimizer / GA / SA types
// ---------------------------------------------------------------------------

/**
 * Which sheet axis every part's long dimension should line up with, for stock
 * that has a grain. `off` searches all rotations freely.
 */
export type GrainAxis = "off" | "horizontal" | "vertical";
/** Which corner of the sheet parts are packed toward. */
export type GravityCorner = "TL" | "TR" | "BL" | "BR";

export interface NestConfig {
  clipperScale: number;
  curveTolerance: number;
  /** Gap between parts in SVG units (half is added around each part). */
  spacing: number;
  /** Minimum inset from the sheet edge in SVG units — shrinks the usable bin area. */
  perimeterGap: number;
  rotations: number;
  populationSize: number;
  mutationRate: number;
  useHoles: boolean;
  exploreConcave: boolean;
  /** Allow parts to be flipped over (reflected) when that packs better. */
  allowMirroring: boolean;
  /**
   * Grain alignment for every part. When not `off` this fully determines the
   * orientations searched, and `rotations` is ignored.
   */
  grainAxis: GrainAxis;
  /** Degrees a part may deviate from the grain axis. Only used when grain is on. */
  grainTolerance: number;
  /** Corner of the sheet that parts are packed toward. */
  gravityCorner: GravityCorner;
  /**
   * After nesting completes each layout, greedily fill any remaining space on
   * the last sheet with copies of the parts, trying smallest area first.
   * Useful for maximising material usage with offcuts.
   */
  fillInMode: boolean;
}

export const DEFAULT_CONFIG: NestConfig = {
  clipperScale: 10_000_000,
  curveTolerance: 0.3,
  spacing: 0,
  perimeterGap: 0,
  rotations: 4,
  populationSize: 20,
  mutationRate: 7,
  useHoles: false,
  exploreConcave: false,
  allowMirroring: false,
  grainAxis: "off",
  grainTolerance: 10,
  gravityCorner: "BL",
  fillInMode: false,
};

export interface Individual {
  placement: NestPolygon[];
  rotation: number[];
  /** Per-part flip flag, parallel to `placement`. All false when mirroring is off. */
  mirrored: boolean[];
  fitness?: number;
}

// ---------------------------------------------------------------------------
// Placement result
// ---------------------------------------------------------------------------

export interface PartPlacement {
  id: number;
  x: number;
  y: number;
  rotation: number;
  mirrored: boolean;
}

export interface PlacementResult {
  placements: PartPlacement[][];
  fitness: number;
}

// ---------------------------------------------------------------------------
// Worker message types
// ---------------------------------------------------------------------------

export interface NfpWorkerInput {
  pair: { A: NestPolygon; B: NestPolygon; key: NfpKey };
  config: Pick<NestConfig, "clipperScale" | "exploreConcave" | "useHoles">;
}

export interface NfpWorkerOutput {
  key: NfpKey;
  value: NestPolygon[] | null;
}

export interface PlacementWorkerInput {
  placelist: NestPolygon[];
  rotations: number[];
  mirrors: boolean[];
  binPolygon: NestPolygon;
  nfpCache: [string, NestPolygon[]][];
  config: NestConfig;
  /**
   * When provided, skip the main placement loop and use these bins as the
   * starting state — only the fill-in pass runs.  Used by the one-shot
   * "Fill In Last Sheet" action.
   */
  existingPlacements?: PartPlacement[][];
  /**
   * Ordered list of shape ids to try during the fill-in pass.  When omitted
   * the worker defaults to area-ascending order.  Passing different orderings
   * across iterations lets the engine search for arrangements that fit more
   * copies.
   */
  fillInOrder?: number[];
}

// ---------------------------------------------------------------------------
// Stats surfaced to the UI
// ---------------------------------------------------------------------------

export interface NestStats {
  iterations: number;
  utilization: number;
  partsPlaced: number;
  partsTotal: number;
  binsUsed: number;
  elapsed: number;
  gpuEnabled: boolean;
  sharedMemEnabled: boolean;
}
