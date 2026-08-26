/**
 * Optimizer — Simulated Annealing (SA) + Genetic Algorithm (GA) hybrid.
 *
 * Improvements over original SVGnest:
 * - SA explores solution space more efficiently than plain GA for this problem
 * - Incremental fitness: re-evaluate only parts affected by a mutation
 * - GA crossover still used to generate diverse initial population
 * - "First-fit decreasing" seeding for good initial placement
 */

import type { NestPolygon, NestConfig, Individual } from "src/types";
import { GeometryUtil } from "src/core/geometry";

// ---------------------------------------------------------------------------
// Angle helpers
// ---------------------------------------------------------------------------

export function validAngles(config: NestConfig): number[] {
  const n = Math.max(config.rotations, 1);
  return Array.from({ length: n }, (_, i) => i * (360 / n));
}

function randomAngle(
  part: NestPolygon,
  binBounds: { width: number; height: number },
  angles: number[],
): number {
  const shuffled = [...angles].sort(() => Math.random() - 0.5);
  for (const a of shuffled) {
    const rotated = GeometryUtil.rotatePolygon(part, a);
    const b = GeometryUtil.getPolygonBounds(rotated);
    if (!b) continue;
    if (b.width <= binBounds.width && b.height <= binBounds.height) return a;
  }
  // Fall back to an allowed angle rather than a hard 0: under a grain constraint
  // 0° is usually off-axis, and returning it would silently break the constraint
  // for exactly those parts that are hardest to place.
  return angles.length > 0 ? angles[0] : 0;
}

// ---------------------------------------------------------------------------
// Grain alignment
// ---------------------------------------------------------------------------

/** Resolution of the search for a part's long axis. */
const GRAIN_SCAN_STEP = 1;

/**
 * Spacing of the candidate angles offered inside the tolerance band. NFP work
 * grows as anglesA × anglesB per part pair, so this stays coarse deliberately.
 */
const GRAIN_BAND_STEP = 5;

const norm360 = (a: number) => ((a % 360) + 360) % 360;

/**
 * The angle in [0,180) that stands `shape` up (vertical: tallest and narrowest)
 * or lays it flat (horizontal). Brute-force scan rather than rotating calipers:
 * 180 samples, memoised per shape, is not worth optimising.
 *
 * The ratio is scale-free, so it behaves the same for a part drawn in mm or in
 * inches. Blobby parts score near 1 at every angle and the choice is arbitrary,
 * which is fine — they have no long axis to align.
 */
function grainBaseAngle(
  shape: NestPolygon,
  axis: "horizontal" | "vertical",
): number {
  let bestAngle = 0;
  let bestScore = -Infinity;
  for (let a = 0; a < 180; a += GRAIN_SCAN_STEP) {
    const b = GeometryUtil.getPolygonBounds(
      GeometryUtil.rotatePolygon(shape, a),
    );
    if (!b) continue;
    const eps = 1e-9;
    const score =
      axis === "vertical"
        ? b.height / Math.max(b.width, eps)
        : b.width / Math.max(b.height, eps);
    if (score > bestScore) {
      bestScore = score;
      bestAngle = a;
    }
  }
  return bestAngle;
}

/**
 * Memo for the 180-sample scan, keyed on the part object so it clears itself when
 * a run ends. Without this the scan would rerun for every part on every iteration.
 */
const baseAngleCache = new WeakMap<NestPolygon, Map<string, number>>();

/**
 * Base angle for a part in a given flip state.
 *
 * The flip state matters: `transformPolygon` reflects before it rotates, and a
 * reflection maps the long axis from θ to −θ. A mirrored part therefore needs a
 * different rotation to land on the same axis, so the base must be measured from
 * the shape actually being placed.
 */
function cachedBaseAngle(
  part: NestPolygon,
  axis: "horizontal" | "vertical",
  mirrored: boolean,
): number {
  let perPart = baseAngleCache.get(part);
  if (!perPart) {
    perPart = new Map();
    baseAngleCache.set(part, perPart);
  }
  const key = `${axis}:${mirrored ? 1 : 0}`;
  const hit = perPart.get(key);
  if (hit !== undefined) return hit;

  const shape = mirrored ? GeometryUtil.transformPolygon(part, 0, true) : part;
  const value = grainBaseAngle(shape, axis);
  perPart.set(key, value);
  return value;
}

/**
 * Angles keeping `part` aligned to the grain within `tolerance` degrees.
 *
 * The band is offered twice, 180° apart: turning a part end-over-end leaves its
 * long axis on the same line, so it is free in grain terms but gives the packer
 * another option.
 */
export function grainAngles(
  part: NestPolygon,
  axis: "horizontal" | "vertical",
  tolerance: number,
  mirrored: boolean,
): number[] {
  const base = cachedBaseAngle(part, axis, mirrored);
  const tol = Math.max(0, tolerance);

  const offsets = [0];
  for (let d = GRAIN_BAND_STEP; d <= tol + 1e-9; d += GRAIN_BAND_STEP) {
    offsets.push(d, -d);
  }
  // Include the exact limits so the stated tolerance is always reachable even
  // when it is not a whole number of band steps.
  if (tol > 0 && Math.abs(tol % GRAIN_BAND_STEP) > 1e-9)
    offsets.push(tol, -tol);

  const seen = new Set<string>();
  const out: number[] = [];
  for (const d of offsets) {
    for (const half of [0, 180]) {
      const angle = norm360(base + half + d);
      // Dedupe at the precision the NFP cache key uses, so two angles here can
      // never collapse into one cache entry later.
      const key = angle.toFixed(2);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(angle);
    }
  }
  return out;
}

/** Shortest angular distance between two headings, in degrees. */
function angularDelta(a: number, b: number): number {
  const raw = norm360(a - b);
  return Math.min(raw, 360 - raw);
}

/**
 * Snap every rotation to the nearest grain-legal angle for its part and flip
 * state, returning the repaired list (or the original when grain is off).
 *
 * This runs at evaluation time rather than trusting the optimizer to keep genes
 * consistent. Crossover and the swap mutation move rotations between slots, and a
 * legal band depends on that specific part's long axis and flip state, so a moved
 * gene can easily land off axis. Repairing at the one point where rotations are
 * actually consumed makes the hard constraint unconditional.
 */
export function enforceGrainAngles(
  placement: NestPolygon[],
  rotation: number[],
  mirrored: boolean[],
  config: NestConfig,
): number[] {
  if (config.grainAxis === "off") return rotation;
  const axis = config.grainAxis;
  return placement.map((part, i) => {
    const allowed = grainAngles(
      part,
      axis,
      config.grainTolerance,
      mirrored[i] ?? false,
    );
    if (allowed.length === 0) return rotation[i];
    let best = allowed[0];
    let bestDelta = Infinity;
    for (const angle of allowed) {
      const delta = angularDelta(angle, rotation[i]);
      if (delta < bestDelta) {
        bestDelta = delta;
        best = angle;
      }
    }
    return best;
  });
}

// Reflection preserves bounding-box dimensions, so unlike rotation a flip can
// never change whether a part fits the bin — only how it interlocks with its
// neighbours. No feasibility check is needed here.
function randomMirror(allowMirroring: boolean): boolean {
  return allowMirroring && Math.random() < 0.5;
}

// ---------------------------------------------------------------------------
// Genetic Algorithm
// ---------------------------------------------------------------------------

export class GeneticAlgorithm {
  population: Individual[];
  private config: NestConfig;
  private angles: number[];
  private binBounds: { width: number; height: number };

  constructor(
    adam: NestPolygon[],
    binPolygon: NestPolygon,
    config: NestConfig,
  ) {
    this.config = config;
    this.angles = validAngles(config);
    const bb = GeometryUtil.getPolygonBounds(binPolygon);
    this.binBounds = bb ?? { width: Infinity, height: Infinity };

    const seed: Individual = {
      placement: adam.slice(),
      rotation: adam.map((p) =>
        randomAngle(p, this.binBounds, this.anglesFor(p, false)),
      ),
      // Seed unflipped so the baseline solution matches mirroring-off behaviour;
      // mutation introduces flips from there.
      mirrored: adam.map(() => false),
    };

    this.population = [seed];
    while (this.population.length < config.populationSize) {
      const child = this.mutate(seed);
      // Mutation alone flips only ~mutationRate% of parts, which is too little
      // orientation diversity to find interlocking pairs. Randomise the rest of
      // the initial population outright; the unflipped seed is kept by elitism.
      if (config.allowMirroring) {
        child.mirrored = child.mirrored.map(() => randomMirror(true));
      }
      this.population.push(child);
    }
  }

  /** Grain mode narrows each part to its own band; otherwise the shared list applies. */
  private anglesFor(part: NestPolygon, mirrored: boolean): number[] {
    if (this.config.grainAxis === "off") return this.angles;
    return grainAngles(
      part,
      this.config.grainAxis,
      this.config.grainTolerance,
      mirrored,
    );
  }

  mutate(ind: Individual): Individual {
    const clone: Individual = {
      placement: [...ind.placement],
      rotation: [...ind.rotation],
      mirrored: [...ind.mirrored],
    };
    const rate = 0.01 * this.config.mutationRate;
    for (let i = 0; i < clone.placement.length; i++) {
      if (Math.random() < rate) {
        const j = i + 1 < clone.placement.length ? i + 1 : i;
        [clone.placement[i], clone.placement[j]] = [
          clone.placement[j],
          clone.placement[i],
        ];
      }
      if (Math.random() < rate) {
        clone.rotation[i] = randomAngle(
          clone.placement[i],
          this.binBounds,
          this.anglesFor(clone.placement[i], clone.mirrored[i]),
        );
      }
      if (this.config.allowMirroring && Math.random() < rate) {
        clone.mirrored[i] = !clone.mirrored[i];
        // Flipping changes which rotation lands on the grain, so re-draw one from
        // the new flip state's band instead of keeping an angle that is now off axis.
        clone.rotation[i] = randomAngle(
          clone.placement[i],
          this.binBounds,
          this.anglesFor(clone.placement[i], clone.mirrored[i]),
        );
      }
    }
    return clone;
  }

  mate(male: Individual, female: Individual): [Individual, Individual] {
    const len = male.placement.length;
    const cut = Math.round(
      Math.min(Math.max(Math.random(), 0.1), 0.9) * (len - 1),
    );

    const g1 = male.placement.slice(0, cut);
    const r1 = male.rotation.slice(0, cut);
    const m1 = male.mirrored.slice(0, cut);
    const g2 = female.placement.slice(0, cut);
    const r2 = female.rotation.slice(0, cut);
    const m2 = female.mirrored.slice(0, cut);

    const hasId = (gene: NestPolygon[], id: number) =>
      gene.some((p) => p.id === id);

    for (let i = 0; i < female.placement.length; i++) {
      if (!hasId(g1, female.placement[i].id!)) {
        g1.push(female.placement[i]);
        r1.push(female.rotation[i]);
        m1.push(female.mirrored[i]);
      }
    }
    for (let i = 0; i < male.placement.length; i++) {
      if (!hasId(g2, male.placement[i].id!)) {
        g2.push(male.placement[i]);
        r2.push(male.rotation[i]);
        m2.push(male.mirrored[i]);
      }
    }

    return [
      { placement: g1, rotation: r1, mirrored: m1 },
      { placement: g2, rotation: r2, mirrored: m2 },
    ];
  }

  generation(): void {
    this.population.sort(
      (a, b) => (a.fitness ?? Infinity) - (b.fitness ?? Infinity),
    );
    const newPop: Individual[] = [this.population[0]]; // elitism

    while (newPop.length < this.population.length) {
      const male = this.weightedPick();
      const female = this.weightedPick(male);
      const [c1, c2] = this.mate(male, female);
      newPop.push(this.mutate(c1));
      if (newPop.length < this.population.length) newPop.push(this.mutate(c2));
    }
    this.population = newPop;
  }

  private weightedPick(exclude?: Individual): Individual {
    const pop = exclude
      ? this.population.filter((i) => i !== exclude)
      : this.population;
    const r = Math.random();
    let lower = 0;
    const w = 1 / pop.length;
    let upper = w;
    for (let i = 0; i < pop.length; i++) {
      if (r > lower && r < upper) return pop[i];
      lower = upper;
      upper += 2 * w * ((pop.length - i) / pop.length);
    }
    return pop[0];
  }

  /** Next unevaluated individual (or post-generation best) */
  next(): Individual {
    for (const ind of this.population) {
      if (ind.fitness === undefined) return ind;
    }
    this.generation();
    return this.population[1];
  }
}

// ---------------------------------------------------------------------------
// Simulated Annealing optimizer
// Wraps the GA: after initial population evaluation, SA explores nearby
// solutions using the current best as a starting point.
// ---------------------------------------------------------------------------

export class SimulatedAnnealing {
  private current: Individual;
  private best: Individual;
  private temp: number;
  private readonly coolingRate: number;
  private readonly minTemp: number;
  private config: NestConfig;
  private angles: number[];
  private binBounds: { width: number; height: number };
  private iteration = 0;

  constructor(
    seed: Individual,
    binPolygon: NestPolygon,
    config: NestConfig,
    initialTemp = 100,
    coolingRate = 0.995,
    minTemp = 0.5,
  ) {
    this.current = {
      ...seed,
      placement: [...seed.placement],
      rotation: [...seed.rotation],
      mirrored: [...seed.mirrored],
    };
    this.best = this.current;
    this.temp = initialTemp;
    this.coolingRate = coolingRate;
    this.minTemp = minTemp;
    this.config = config;
    this.angles = validAngles(config);
    const bb = GeometryUtil.getPolygonBounds(binPolygon);
    this.binBounds = bb ?? { width: Infinity, height: Infinity };
  }

  /** Grain mode narrows each part to its own band; otherwise the shared list applies. */
  private anglesFor(part: NestPolygon, mirrored: boolean): number[] {
    if (this.config.grainAxis === "off") return this.angles;
    return grainAngles(
      part,
      this.config.grainAxis,
      this.config.grainTolerance,
      mirrored,
    );
  }

  /** Return the next candidate individual for evaluation */
  nextCandidate(): Individual {
    if (this.temp > this.minTemp) {
      const neighbor = this.generateNeighbor(this.current);
      this.iteration++;
      return neighbor;
    }
    // Cooled — restart from best with small perturbation
    this.temp = 50;
    return this.generateNeighbor(this.best);
  }

  /** Accept or reject a result based on the SA criterion */
  accept(candidate: Individual, fitness: number): void {
    const currentFitness = this.current.fitness ?? Infinity;
    const delta = fitness - currentFitness;

    if (delta < 0) {
      // Better solution — always accept
      this.current = { ...candidate, fitness };
      if (!this.best.fitness || fitness < this.best.fitness) {
        this.best = { ...candidate, fitness };
      }
    } else if (Math.random() < Math.exp(-delta / this.temp)) {
      // Worse solution — accept with probability
      this.current = { ...candidate, fitness };
    }

    this.temp *= this.coolingRate;
  }

  get bestSolution(): Individual {
    return this.best;
  }
  get temperature(): number {
    return this.temp;
  }

  private generateNeighbor(ind: Individual): Individual {
    const neighbor: Individual = {
      placement: [...ind.placement],
      rotation: [...ind.rotation],
      mirrored: [...ind.mirrored],
    };
    const n = neighbor.placement.length;
    const op = Math.random();

    if (this.config.allowMirroring && op < 0.15) {
      // Flip a random part over
      const i = Math.floor(Math.random() * n);
      neighbor.mirrored[i] = !neighbor.mirrored[i];
      // Flipping changes which rotation lands on the grain, so re-draw one from
      // the new flip state's band instead of keeping an angle that is now off axis.
      neighbor.rotation[i] = randomAngle(
        neighbor.placement[i],
        this.binBounds,
        this.anglesFor(neighbor.placement[i], neighbor.mirrored[i]),
      );
    } else if (op < 0.4 && n > 1) {
      // Swap two random parts
      const i = Math.floor(Math.random() * n);
      const j = Math.floor(Math.random() * n);
      [neighbor.placement[i], neighbor.placement[j]] = [
        neighbor.placement[j],
        neighbor.placement[i],
      ];
      [neighbor.rotation[i], neighbor.rotation[j]] = [
        neighbor.rotation[j],
        neighbor.rotation[i],
      ];
      [neighbor.mirrored[i], neighbor.mirrored[j]] = [
        neighbor.mirrored[j],
        neighbor.mirrored[i],
      ];
    } else if (op < 0.7) {
      // Rotate a random part
      const i = Math.floor(Math.random() * n);
      neighbor.rotation[i] = randomAngle(
        neighbor.placement[i],
        this.binBounds,
        this.anglesFor(neighbor.placement[i], neighbor.mirrored[i]),
      );
    } else if (n > 2) {
      // 3-opt move: reverse a sub-sequence
      const i = Math.floor(Math.random() * (n - 1));
      const j = i + 1 + Math.floor(Math.random() * (n - i - 1));
      neighbor.placement.splice(
        i,
        j - i + 1,
        ...neighbor.placement.slice(i, j + 1).reverse(),
      );
      neighbor.rotation.splice(
        i,
        j - i + 1,
        ...neighbor.rotation.slice(i, j + 1).reverse(),
      );
      neighbor.mirrored.splice(
        i,
        j - i + 1,
        ...neighbor.mirrored.slice(i, j + 1).reverse(),
      );
    }

    return neighbor;
  }
}

// ---------------------------------------------------------------------------
// Fitness function (lightweight, without actually running placement)
// Used by the SA to score partial solutions without a full worker round-trip.
// ---------------------------------------------------------------------------

export function seedPopulation(
  parts: NestPolygon[],
  binPolygon: NestPolygon,
  config: NestConfig,
): NestPolygon[] {
  // First-fit-decreasing: sort by area descending
  return parts
    .slice()
    .sort(
      (a, b) =>
        Math.abs(GeometryUtil.polygonArea(b)) -
        Math.abs(GeometryUtil.polygonArea(a)),
    );
}
