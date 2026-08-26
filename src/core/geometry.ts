/**
 * Core polygon geometry utilities.
 * Faithful TypeScript port of SVGnest's geometryutil.js with typed signatures,
 * strict null elimination, and minor algorithmic clean-ups.
 */

import type { Point, NestPolygon, Bounds } from "src/types";

const TOL = 1e-9;

// ---------------------------------------------------------------------------
// Basic helpers
// ---------------------------------------------------------------------------

export function almostEqual(a: number, b: number, tolerance = TOL): boolean {
  return Math.abs(a - b) < tolerance;
}

export function withinDistance(
  p1: Point,
  p2: Point,
  distance: number,
): boolean {
  const dx = p1.x - p2.x;
  const dy = p1.y - p2.y;
  return dx * dx + dy * dy < distance * distance;
}

function deg2rad(angle: number): number {
  return angle * (Math.PI / 180);
}
function rad2deg(angle: number): number {
  return angle * (180 / Math.PI);
}

function normalizeVector(v: Point): Point {
  const len2 = v.x * v.x + v.y * v.y;
  if (almostEqual(len2, 1)) return v;
  const inv = 1 / Math.sqrt(len2);
  return { x: v.x * inv, y: v.y * inv };
}

function onSegment(A: Point, B: Point, p: Point): boolean {
  if (almostEqual(A.x, B.x) && almostEqual(p.x, A.x)) {
    if (
      !almostEqual(p.y, B.y) &&
      !almostEqual(p.y, A.y) &&
      p.y < Math.max(B.y, A.y) &&
      p.y > Math.min(B.y, A.y)
    )
      return true;
    return false;
  }
  if (almostEqual(A.y, B.y) && almostEqual(p.y, A.y)) {
    if (
      !almostEqual(p.x, B.x) &&
      !almostEqual(p.x, A.x) &&
      p.x < Math.max(B.x, A.x) &&
      p.x > Math.min(B.x, A.x)
    )
      return true;
    return false;
  }
  if (
    (p.x < A.x && p.x < B.x) ||
    (p.x > A.x && p.x > B.x) ||
    (p.y < A.y && p.y < B.y) ||
    (p.y > A.y && p.y > B.y)
  )
    return false;
  if (
    (almostEqual(p.x, A.x) && almostEqual(p.y, A.y)) ||
    (almostEqual(p.x, B.x) && almostEqual(p.y, B.y))
  )
    return false;
  const cross = (p.y - A.y) * (B.x - A.x) - (p.x - A.x) * (B.y - A.y);
  if (Math.abs(cross) > TOL) return false;
  const dot = (p.x - A.x) * (B.x - A.x) + (p.y - A.y) * (B.y - A.y);
  if (dot <= 0) return false;
  const len2 = (B.x - A.x) ** 2 + (B.y - A.y) ** 2;
  if (dot >= len2) return false;
  return true;
}

function lineIntersect(
  A: Point,
  B: Point,
  E: Point,
  F: Point,
  infinite = false,
): Point | null {
  const a1 = B.y - A.y,
    b1 = A.x - B.x,
    c1 = B.x * A.y - A.x * B.y;
  const a2 = F.y - E.y,
    b2 = E.x - F.x,
    c2 = F.x * E.y - E.x * F.y;
  const denom = a1 * b2 - a2 * b1;
  const x = (b1 * c2 - b2 * c1) / denom;
  const y = (a2 * c1 - a1 * c2) / denom;
  if (!isFinite(x) || !isFinite(y)) return null;
  if (!infinite) {
    if (
      Math.abs(A.x - B.x) > TOL &&
      (A.x < B.x ? x < A.x || x > B.x : x > A.x || x < B.x)
    )
      return null;
    if (
      Math.abs(A.y - B.y) > TOL &&
      (A.y < B.y ? y < A.y || y > B.y : y > A.y || y < B.y)
    )
      return null;
    if (
      Math.abs(E.x - F.x) > TOL &&
      (E.x < F.x ? x < E.x || x > F.x : x > E.x || x < F.x)
    )
      return null;
    if (
      Math.abs(E.y - F.y) > TOL &&
      (E.y < F.y ? y < E.y || y > F.y : y > E.y || y < F.y)
    )
      return null;
  }
  return { x, y };
}

// ---------------------------------------------------------------------------
// Polygon fundamentals
// ---------------------------------------------------------------------------

export function polygonArea(polygon: Point[]): number {
  let area = 0;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    area += (polygon[j].x + polygon[i].x) * (polygon[j].y - polygon[i].y);
  }
  return 0.5 * area;
}

export function getPolygonBounds(polygon: Point[]): Bounds | null {
  if (!polygon || polygon.length < 3) return null;
  let xmin = polygon[0].x,
    xmax = polygon[0].x;
  let ymin = polygon[0].y,
    ymax = polygon[0].y;
  for (let i = 1; i < polygon.length; i++) {
    if (polygon[i].x > xmax) xmax = polygon[i].x;
    else if (polygon[i].x < xmin) xmin = polygon[i].x;
    if (polygon[i].y > ymax) ymax = polygon[i].y;
    else if (polygon[i].y < ymin) ymin = polygon[i].y;
  }
  return { x: xmin, y: ymin, width: xmax - xmin, height: ymax - ymin };
}

/**
 * Reflect about the vertical axis, then rotate. Every part orientation the
 * nester considers is one of these transforms, so NFP generation, placement
 * scoring and rendering all go through this single function — if they disagree
 * by even a sign, parts silently overlap.
 *
 * Reflection alone covers all mirror axes, since mirroring about any other axis
 * equals this reflection plus a rotation, and rotation is already searched.
 */
export function transformPolygon(
  polygon: NestPolygon,
  angle: number,
  mirrored = false,
): NestPolygon {
  const rad = deg2rad(angle);
  const cos = Math.cos(rad),
    sin = Math.sin(rad);
  const sx = mirrored ? -1 : 1;
  const points = polygon.map((p) => {
    const x = p.x * sx;
    return {
      x: x * cos - p.y * sin,
      y: x * sin + p.y * cos,
    };
  });
  // Reflection negates the signed area, i.e. flips the winding direction. The
  // NFP routines assume a consistent orientation, so undo that here.
  const result: NestPolygon = (
    mirrored ? points.reverse() : points
  ) as NestPolygon;
  const bounds = getPolygonBounds(result);
  if (bounds) {
    result.width = bounds.width;
    result.height = bounds.height;
  }
  return result;
}

export function rotatePolygon(
  polygon: NestPolygon,
  angle: number,
): NestPolygon {
  return transformPolygon(polygon, angle, false);
}

/** Returns true/false/null (null = exactly on boundary) */
export function pointInPolygon(
  point: Point,
  polygon: NestPolygon,
): boolean | null {
  if (!polygon || polygon.length < 3) return null;
  const ox = polygon.offsetx ?? 0;
  const oy = polygon.offsety ?? 0;
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].x + ox,
      yi = polygon[i].y + oy;
    const xj = polygon[j].x + ox,
      yj = polygon[j].y + oy;
    if (almostEqual(xi, point.x) && almostEqual(yi, point.y)) return null;
    if (onSegment({ x: xi, y: yi }, { x: xj, y: yj }, point)) return null;
    if (almostEqual(xi, xj) && almostEqual(yi, yj)) continue;
    if (
      yi > point.y !== yj > point.y &&
      point.x < ((xj - xi) * (point.y - yi)) / (yj - yi) + xi
    ) {
      inside = !inside;
    }
  }
  return inside;
}

export function isRectangle(polygon: Point[], tolerance = 0.001): boolean {
  const bounds = getPolygonBounds(polygon);
  if (!bounds) return false;
  for (const p of polygon) {
    if (
      !almostEqual(p.x, bounds.x, tolerance) &&
      !almostEqual(p.x, bounds.x + bounds.width, tolerance)
    )
      return false;
    if (
      !almostEqual(p.y, bounds.y, tolerance) &&
      !almostEqual(p.y, bounds.y + bounds.height, tolerance)
    )
      return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
// Bezier & Arc linearization (de Casteljau / SVG arc center conversion)
// ---------------------------------------------------------------------------

export const QuadraticBezier = {
  isFlat(p1: Point, p2: Point, c1: Point, tol: number): boolean {
    const t = 4 * tol * tol;
    const ux = (2 * c1.x - p1.x - p2.x) ** 2;
    const uy = (2 * c1.y - p1.y - p2.y) ** 2;
    return ux + uy <= t;
  },
  linearize(p1: Point, p2: Point, c1: Point, tol: number): Point[] {
    const finished: Point[] = [p1];
    const todo: { p1: Point; p2: Point; c1: Point }[] = [{ p1, p2, c1 }];
    while (todo.length > 0) {
      const seg = todo[0];
      if (this.isFlat(seg.p1, seg.p2, seg.c1, tol)) {
        finished.push({ x: seg.p2.x, y: seg.p2.y });
        todo.shift();
      } else {
        const [s1, s2] = this.subdivide(seg.p1, seg.p2, seg.c1, 0.5);
        todo.splice(0, 1, s1, s2);
      }
    }
    return finished;
  },
  subdivide(p1: Point, p2: Point, c1: Point, t: number) {
    const mid1 = { x: p1.x + (c1.x - p1.x) * t, y: p1.y + (c1.y - p1.y) * t };
    const mid2 = { x: c1.x + (p2.x - c1.x) * t, y: c1.y + (p2.y - c1.y) * t };
    const mid3 = {
      x: mid1.x + (mid2.x - mid1.x) * t,
      y: mid1.y + (mid2.y - mid1.y) * t,
    };
    return [
      { p1, p2: mid3, c1: mid1 },
      { p1: mid3, p2, c1: mid2 },
    ];
  },
};

export const CubicBezier = {
  isFlat(p1: Point, p2: Point, c1: Point, c2: Point, tol: number): boolean {
    const t = 16 * tol * tol;
    let ux = Math.max(
      (3 * c1.x - 2 * p1.x - p2.x) ** 2,
      (3 * c2.x - 2 * p2.x - p1.x) ** 2,
    );
    let uy = Math.max(
      (3 * c1.y - 2 * p1.y - p2.y) ** 2,
      (3 * c2.y - 2 * p2.y - p1.y) ** 2,
    );
    return ux + uy <= t;
  },
  linearize(
    p1: Point,
    p2: Point,
    c1: Point,
    c2: Point,
    tol: number,
    maxPts = 500,
  ): Point[] {
    const finished: Point[] = [p1];
    const todo: { p1: Point; p2: Point; c1: Point; c2: Point }[] = [
      { p1, p2, c1, c2 },
    ];
    while (todo.length > 0) {
      // Hard cap: when we've already produced enough points, flush all
      // remaining segments as straight-line endpoints to guarantee completion.
      if (finished.length >= maxPts) {
        for (const seg of todo) finished.push(seg.p2);
        break;
      }
      const seg = todo[0];
      if (this.isFlat(seg.p1, seg.p2, seg.c1, seg.c2, tol)) {
        finished.push({ x: seg.p2.x, y: seg.p2.y });
        todo.shift();
      } else {
        const [s1, s2] = this.subdivide(seg.p1, seg.p2, seg.c1, seg.c2, 0.5);
        todo.splice(0, 1, s1, s2);
      }
    }
    return finished;
  },
  subdivide(p1: Point, p2: Point, c1: Point, c2: Point, t: number) {
    const mid1 = { x: p1.x + (c1.x - p1.x) * t, y: p1.y + (c1.y - p1.y) * t };
    const mid2 = { x: c2.x + (p2.x - c2.x) * t, y: c2.y + (p2.y - c2.y) * t };
    const mid3 = { x: c1.x + (c2.x - c1.x) * t, y: c1.y + (c2.y - c1.y) * t };
    const mida = {
      x: mid1.x + (mid3.x - mid1.x) * t,
      y: mid1.y + (mid3.y - mid1.y) * t,
    };
    const midb = {
      x: mid3.x + (mid2.x - mid3.x) * t,
      y: mid3.y + (mid2.y - mid3.y) * t,
    };
    const midx = {
      x: mida.x + (midb.x - mida.x) * t,
      y: mida.y + (midb.y - mida.y) * t,
    };
    return [
      { p1, p2: midx, c1: mid1, c2: mida },
      { p1: midx, p2, c1: midb, c2: mid2 },
    ];
  },
};

interface ArcCenter {
  center: Point;
  rx: number;
  ry: number;
  theta: number;
  extent: number;
  angle: number;
}

export const Arc = {
  linearize(
    p1: Point,
    p2: Point,
    rx: number,
    ry: number,
    angle: number,
    largearc: number,
    sweep: number,
    tol: number,
    maxPts = 500,
  ): Point[] {
    const finished: Point[] = [p2];
    const arc = this.svgToCenter(p1, p2, rx, ry, angle, largearc, sweep);
    const todo: ArcCenter[] = [arc];
    while (todo.length > 0) {
      if (finished.length >= maxPts) {
        for (const a of todo) {
          const full = this.centerToSvg(
            a.center,
            a.rx,
            a.ry,
            a.theta,
            a.extent,
            a.angle,
          );
          finished.unshift(full.p2);
        }
        break;
      }
      const a = todo[0];
      const full = this.centerToSvg(
        a.center,
        a.rx,
        a.ry,
        a.theta,
        a.extent,
        a.angle,
      );
      const sub = this.centerToSvg(
        a.center,
        a.rx,
        a.ry,
        a.theta,
        0.5 * a.extent,
        a.angle,
      );
      const arcmid = sub.p2;
      const mid = {
        x: 0.5 * (full.p1.x + full.p2.x),
        y: 0.5 * (full.p1.y + full.p2.y),
      };
      if (withinDistance(mid, arcmid, tol)) {
        finished.unshift(full.p2);
        todo.shift();
      } else {
        todo.splice(
          0,
          1,
          { ...a, extent: 0.5 * a.extent },
          { ...a, theta: a.theta + 0.5 * a.extent, extent: 0.5 * a.extent },
        );
      }
    }
    return finished;
  },
  centerToSvg(
    center: Point,
    rx: number,
    ry: number,
    theta1: number,
    extent: number,
    angleDegrees: number,
  ) {
    const theta2 = theta1 + extent;
    const t1 = deg2rad(theta1),
      t2 = deg2rad(theta2),
      ang = deg2rad(angleDegrees);
    const cos = Math.cos(ang),
      sin = Math.sin(ang);
    return {
      p1: {
        x: center.x + cos * rx * Math.cos(t1) - sin * ry * Math.sin(t1),
        y: center.y + sin * rx * Math.cos(t1) + cos * ry * Math.sin(t1),
      },
      p2: {
        x: center.x + cos * rx * Math.cos(t2) - sin * ry * Math.sin(t2),
        y: center.y + sin * rx * Math.cos(t2) + cos * ry * Math.sin(t2),
      },
      rx,
      ry,
      angle: angleDegrees,
      largearc: extent > 180 ? 1 : 0,
      sweep: extent > 0 ? 1 : 0,
    };
  },
  svgToCenter(
    p1: Point,
    p2: Point,
    rx: number,
    ry: number,
    angleDegrees: number,
    largearc: number,
    sweep: number,
  ): ArcCenter {
    const mid = { x: 0.5 * (p1.x + p2.x), y: 0.5 * (p1.y + p2.y) };
    const diff = { x: 0.5 * (p2.x - p1.x), y: 0.5 * (p2.y - p1.y) };
    const angle = deg2rad(angleDegrees % 360);
    const cos = Math.cos(angle),
      sin = Math.sin(angle);
    const x1 = cos * diff.x + sin * diff.y;
    const y1 = -sin * diff.x + cos * diff.y;
    rx = Math.abs(rx);
    ry = Math.abs(ry);
    const Prx = rx * rx,
      Pry = ry * ry,
      Px1 = x1 * x1,
      Py1 = y1 * y1;
    const radiiCheck = Px1 / Prx + Py1 / Pry;
    let rrx = rx,
      rry = ry,
      rPrx = Prx,
      rPry = Pry;
    if (radiiCheck > 1) {
      const s = Math.sqrt(radiiCheck);
      rrx = s * rx;
      rry = s * ry;
      rPrx = rrx * rrx;
      rPry = rry * rry;
    }
    const sign = largearc !== sweep ? -1 : 1;
    const sq = Math.max(
      0,
      (rPrx * rPry - rPrx * Py1 - rPry * Px1) / (rPrx * Py1 + rPry * Px1),
    );
    const coef = sign * Math.sqrt(sq);
    const cx1 = coef * ((rrx * y1) / rry);
    const cy1 = coef * -((rry * x1) / rrx);
    const cx = mid.x + (cos * cx1 - sin * cy1);
    const cy = mid.y + (sin * cx1 + cos * cy1);
    const ux = (x1 - cx1) / rrx,
      uy = (y1 - cy1) / rry;
    const vx = (-x1 - cx1) / rrx,
      vy = (-y1 - cy1) / rry;
    const n1 = Math.sqrt(ux * ux + uy * uy);
    let theta = (uy < 0 ? -1 : 1) * Math.acos(ux / n1);
    const n2 = Math.sqrt((ux * ux + uy * uy) * (vx * vx + vy * vy));
    let delta =
      (ux * vy - uy * vx < 0 ? -1 : 1) * Math.acos((ux * vx + uy * vy) / n2);
    if (sweep === 1 && delta > 0) delta -= 2 * Math.PI;
    else if (sweep === 0 && delta < 0) delta += 2 * Math.PI;
    return {
      center: { x: cx, y: cy },
      rx: rrx,
      ry: rry,
      theta: rad2deg(theta) % 360,
      extent: rad2deg(delta) % 360,
      angle: angleDegrees,
    };
  },
};

// ---------------------------------------------------------------------------
// NFP helpers — distance-along-direction calculations
// ---------------------------------------------------------------------------

function pointDistance(
  p: Point,
  s1: Point,
  s2: Point,
  normal: Point,
  infinite = false,
): number | null {
  const dir = { x: normal.y, y: -normal.x };
  const pdot = p.x * dir.x + p.y * dir.y;
  const s1dot = s1.x * dir.x + s1.y * dir.y;
  const s2dot = s2.x * dir.x + s2.y * dir.y;
  const pdotnorm = p.x * normal.x + p.y * normal.y;
  const s1dotnorm = s1.x * normal.x + s1.y * normal.y;
  const s2dotnorm = s2.x * normal.x + s2.y * normal.y;
  if (!infinite) {
    if (
      ((pdot < s1dot || almostEqual(pdot, s1dot)) &&
        (pdot < s2dot || almostEqual(pdot, s2dot))) ||
      ((pdot > s1dot || almostEqual(pdot, s1dot)) &&
        (pdot > s2dot || almostEqual(pdot, s2dot)))
    )
      return null;
    if (
      almostEqual(pdot, s1dot) &&
      almostEqual(pdot, s2dot) &&
      pdotnorm > s1dotnorm &&
      pdotnorm > s2dotnorm
    )
      return Math.min(pdotnorm - s1dotnorm, pdotnorm - s2dotnorm);
    if (
      almostEqual(pdot, s1dot) &&
      almostEqual(pdot, s2dot) &&
      pdotnorm < s1dotnorm &&
      pdotnorm < s2dotnorm
    )
      return -Math.min(s1dotnorm - pdotnorm, s2dotnorm - pdotnorm);
  }
  return (
    pdotnorm -
    s1dotnorm +
    ((s1dotnorm - s2dotnorm) * (s1dot - pdot)) / (s1dot - s2dot)
  );
}

function segmentDistance(
  A: Point,
  B: Point,
  E: Point,
  F: Point,
  direction: Point,
): number | null {
  const normal = { x: direction.y, y: -direction.x };
  const reverse = { x: -direction.x, y: -direction.y };

  const dotA = A.x * normal.x + A.y * normal.y;
  const dotB = B.x * normal.x + B.y * normal.y;
  const dotE = E.x * normal.x + E.y * normal.y;
  const dotF = F.x * normal.x + F.y * normal.y;

  const crossA = A.x * direction.x + A.y * direction.y;
  const crossB = B.x * direction.x + B.y * direction.y;
  const crossE = E.x * direction.x + E.y * direction.y;
  const crossF = F.x * direction.x + F.y * direction.y;

  const ABmin = Math.min(dotA, dotB);
  const ABmax = Math.max(dotA, dotB);
  const EFmin = Math.min(dotE, dotF);
  const EFmax = Math.max(dotE, dotF);

  if (ABmax < EFmin || ABmin > EFmax) return null;

  const overlapMin = Math.max(ABmin, EFmin);
  const overlapMax = Math.min(ABmax, EFmax);
  const rangeMax = Math.max(ABmax, EFmax);
  const rangeMin = Math.min(ABmin, EFmin);
  let overlap = 1;
  if (!((ABmax > EFmax && ABmin < EFmin) || (EFmax > ABmax && EFmin < ABmin))) {
    overlap = (overlapMax - overlapMin) / (rangeMax - rangeMin);
  }

  const crossABE = (E.y - A.y) * (B.x - A.x) - (E.x - A.x) * (B.y - A.y);
  const crossABF = (F.y - A.y) * (B.x - A.x) - (F.x - A.x) * (B.y - A.y);

  if (almostEqual(crossABE, 0) && almostEqual(crossABF, 0)) {
    const ABnorm = normalizeVector({ x: B.y - A.y, y: A.x - B.x });
    const EFnorm = normalizeVector({ x: F.y - E.y, y: E.x - F.x });
    if (
      Math.abs(ABnorm.y * EFnorm.x - ABnorm.x * EFnorm.y) < TOL &&
      ABnorm.y * EFnorm.y + ABnorm.x * EFnorm.x < 0
    ) {
      const normdot = ABnorm.y * direction.y + ABnorm.x * direction.x;
      if (almostEqual(normdot, 0, TOL)) return null;
      if (normdot < 0) return 0;
    }
    return null;
  }

  const distances: number[] = [];

  if (almostEqual(dotA, dotE)) distances.push(crossA - crossE);
  else if (almostEqual(dotA, dotF)) distances.push(crossA - crossF);
  else if (dotA > EFmin && dotA < EFmax) {
    let d = pointDistance(A, E, F, reverse);
    if (d !== null && almostEqual(d, 0)) {
      const dB = pointDistance(B, E, F, reverse, true);
      if (dB === null || dB < 0 || almostEqual(dB * overlap, 0)) d = null;
    }
    if (d !== null) distances.push(d);
  }
  if (almostEqual(dotB, dotE)) distances.push(crossB - crossE);
  else if (almostEqual(dotB, dotF)) distances.push(crossB - crossF);
  else if (dotB > EFmin && dotB < EFmax) {
    let d = pointDistance(B, E, F, reverse);
    if (d !== null && almostEqual(d, 0)) {
      const dA = pointDistance(A, E, F, reverse, true);
      if (dA === null || dA < 0 || almostEqual(dA * overlap, 0)) d = null;
    }
    if (d !== null) distances.push(d);
  }
  if (dotE > ABmin && dotE < ABmax) {
    let d = pointDistance(E, A, B, direction);
    if (d !== null && almostEqual(d, 0)) {
      const dF = pointDistance(F, A, B, direction, true);
      if (dF === null || dF < 0 || almostEqual(dF * overlap, 0)) d = null;
    }
    if (d !== null) distances.push(d);
  }
  if (dotF > ABmin && dotF < ABmax) {
    let d = pointDistance(F, A, B, direction);
    if (d !== null && almostEqual(d, 0)) {
      const dE = pointDistance(E, A, B, direction, true);
      if (dE === null || dE < 0 || almostEqual(dE * overlap, 0)) d = null;
    }
    if (d !== null) distances.push(d);
  }

  if (distances.length === 0) return null;
  let min = distances[0];
  for (const d of distances) if (d < min) min = d;
  return min;
}

export function polygonProjectionDistance(
  A: NestPolygon,
  B: NestPolygon,
  direction: Point,
): number | null {
  const Aox = A.offsetx ?? 0,
    Aoy = A.offsety ?? 0;
  const Box = B.offsetx ?? 0,
    Boy = B.offsety ?? 0;
  const edgeA = [...A, A[0]];
  const edgeB = [...B];
  let distance: number | null = null;

  for (let i = 0; i < edgeB.length; i++) {
    let minprojection: number | null = null;
    for (let j = 0; j < edgeA.length - 1; j++) {
      const p = { x: edgeB[i].x + Box, y: edgeB[i].y + Boy };
      const s1 = { x: edgeA[j].x + Aox, y: edgeA[j].y + Aoy };
      const s2 = { x: edgeA[j + 1].x + Aox, y: edgeA[j + 1].y + Aoy };
      if (
        Math.abs((s2.y - s1.y) * direction.x - (s2.x - s1.x) * direction.y) <
        TOL
      )
        continue;
      const d = pointDistance(p, s1, s2, direction);
      if (d !== null && (minprojection === null || d < minprojection))
        minprojection = d;
    }
    if (
      minprojection !== null &&
      (distance === null || minprojection > distance)
    )
      distance = minprojection;
  }
  return distance;
}

export function polygonSlideDistance(
  A: NestPolygon,
  B: NestPolygon,
  direction: Point,
  ignoreNegative: boolean,
): number | null {
  const Aox = A.offsetx ?? 0,
    Aoy = A.offsety ?? 0;
  const Box = B.offsetx ?? 0,
    Boy = B.offsety ?? 0;
  const edgeA = [...A, A[0]];
  const edgeB = [...B, B[0]];
  let distance: number | null = null;
  const dir = normalizeVector(direction);

  for (let i = 0; i < edgeB.length - 1; i++) {
    for (let j = 0; j < edgeA.length - 1; j++) {
      const a1 = { x: edgeA[j].x + Aox, y: edgeA[j].y + Aoy };
      const a2 = { x: edgeA[j + 1].x + Aox, y: edgeA[j + 1].y + Aoy };
      const b1 = { x: edgeB[i].x + Box, y: edgeB[i].y + Boy };
      const b2 = { x: edgeB[i + 1].x + Box, y: edgeB[i + 1].y + Boy };
      const d = segmentDistance(a1, a2, b1, b2, dir);
      if (d !== null && !isNaN(d) && (distance === null || d < distance)) {
        if (!ignoreNegative || d >= 0 || almostEqual(d, 0)) distance = d;
      }
    }
  }
  return distance;
}

// ---------------------------------------------------------------------------
// searchStartPoint — finds where to start the orbital NFP traversal
// ---------------------------------------------------------------------------

function searchStartPoint(
  A: NestPolygon,
  B: NestPolygon,
  inside: boolean,
  NFP?: Point[][],
): Point | null {
  const Acopy = [...A, A[0]];
  const Bcopy = [...B, B[0]];

  for (let i = 0; i < Acopy.length - 1; i++) {
    const mid = {
      x: 0.5 * (Acopy[i].x + Acopy[i + 1].x),
      y: 0.5 * (Acopy[i].y + Acopy[i + 1].y),
    };
    const inA = pointInPolygon(mid, A);

    for (let j = 0; j < B.length; j++) {
      const Boffset: NestPolygon = Object.assign(B.slice(), {
        offsetx: Acopy[i].x - B[j].x,
        offsety: Acopy[i].y - B[j].y,
      });
      const Binside = pointInPolygon(
        { x: mid.x - Boffset.offsetx!, y: mid.y - Boffset.offsety! },
        B,
      );

      let startPoint: Point | null = null;
      if ((inside && Binside) || (!inside && !Binside)) {
        startPoint = { x: Boffset.offsetx!, y: Boffset.offsety! };
      }

      if (startPoint) {
        if (NFP && NFP.length > 0) {
          let inNfp = false;
          for (const nfpPoly of NFP) {
            const pin = pointInPolygon(startPoint, nfpPoly as NestPolygon);
            if (
              pin ||
              onSegment(
                nfpPoly[0] as Point,
                nfpPoly[nfpPoly.length - 1] as Point,
                startPoint,
              )
            ) {
              inNfp = true;
              break;
            }
          }
          if (inNfp) continue;
        }
        if (!GeometryUtil.intersect(A, Boffset)) return startPoint;
      }
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// NFP — No-Fit Polygon (orbital approach)
// ---------------------------------------------------------------------------

export function noFitPolygonRectangle(
  A: NestPolygon,
  B: NestPolygon,
): NestPolygon[] | null {
  const boundsA = getPolygonBounds(A);
  const boundsB = getPolygonBounds(B);
  if (!boundsA || !boundsB) return null;

  // B simply cannot fit inside A at this rotation.  Without this guard the
  // arithmetic below yields an *inverted* rectangle (max < min), which Clipper
  // then treats as a real region and the part gets "placed" outside the bin.
  if (boundsB.width > boundsA.width || boundsB.height > boundsA.height) {
    return null;
  }

  // The IFP is the rectangle of valid reference-point positions for B to fit
  // entirely inside A. Four vertices only — no collinear extras that confuse
  // Clipper boolean operations.
  const minX = boundsA.x - boundsB.x;
  const minY = boundsA.y - boundsB.y;
  const maxX = boundsA.x + boundsA.width - boundsB.x - boundsB.width;
  const maxY = boundsA.y + boundsA.height - boundsB.y - boundsB.height;

  return [
    [
      { x: minX, y: minY },
      { x: maxX, y: minY },
      { x: maxX, y: maxY },
      { x: minX, y: maxY },
    ] as NestPolygon,
  ];
}

export function noFitPolygon(
  A: NestPolygon,
  B: NestPolygon,
  inside: boolean,
  searchEdges: boolean,
): NestPolygon[] | null {
  if (!A || A.length < 3 || !B || B.length < 3) return null;

  A = A.slice() as NestPolygon;
  B = B.slice() as NestPolygon;

  let minA = A[0].y,
    minAIndex = 0;
  let maxB = B[0].y,
    maxBIndex = 0;

  for (let i = 1; i < A.length; i++)
    if (A[i].y < minA) {
      minA = A[i].y;
      minAIndex = i;
    }
  for (let i = 1; i < B.length; i++)
    if (B[i].y > maxB) {
      maxB = B[i].y;
      maxBIndex = i;
    }

  let startPoint: Point | null;
  if (!inside) {
    startPoint = {
      x: A[minAIndex].x - B[maxBIndex].x,
      y: A[minAIndex].y - B[maxBIndex].y,
    };
  } else {
    startPoint = searchStartPoint(A, B, true);
  }

  const NFPlist: NestPolygon[] = [];

  while (startPoint !== null) {
    B.offsetx = startPoint.x;
    B.offsety = startPoint.y;

    let prevvector: Point | null = null;
    const NFP: NestPolygon = [] as unknown as NestPolygon;

    let reference: Point = {
      x: B[0].x + startPoint.x,
      y: B[0].y + startPoint.y,
    };
    const start: Point = { x: reference.x, y: reference.y };
    let counter = 0;

    while (counter < 10 * (A.length + B.length)) {
      const touching: { A: number; B: number; type: number }[] = [];
      const Aedges = [...A, A[0]];
      const Bedges = [...B, B[0]];

      for (let i = 0; i < Aedges.length - 1; i++) {
        for (let j = 0; j < Bedges.length - 1; j++) {
          const a1 = Aedges[i],
            a2 = Aedges[i + 1];
          const b1 = {
            x: Bedges[j].x + (B.offsetx ?? 0),
            y: Bedges[j].y + (B.offsety ?? 0),
          };
          const b2 = {
            x: Bedges[j + 1].x + (B.offsetx ?? 0),
            y: Bedges[j + 1].y + (B.offsety ?? 0),
          };
          if (
            (almostEqual(a1.x, b1.x) && almostEqual(a1.y, b1.y)) ||
            (almostEqual(a1.x, b2.x) && almostEqual(a1.y, b2.y)) ||
            (almostEqual(a2.x, b1.x) && almostEqual(a2.y, b1.y)) ||
            (almostEqual(a2.x, b2.x) && almostEqual(a2.y, b2.y))
          ) {
            touching.push({ A: i, B: j, type: 0 });
          } else if (onSegment(a1, a2, b1)) {
            touching.push({ A: i, B: j, type: 1 });
          } else if (onSegment(b1, b2, a1)) {
            touching.push({ A: i, B: j, type: 2 });
          }
        }
      }

      const vectors: Point[] = [];
      for (let i = 0; i < Aedges.length - 1; i++) {
        const edgeA: Point = {
          x: Aedges[i + 1].x - Aedges[i].x,
          y: Aedges[i + 1].y - Aedges[i].y,
        };
        const touchingA = touching.filter((t) => t.A === i);

        if (touchingA.length === 0) {
          let d = polygonSlideDistance(A, B, edgeA, true);
          const edgeB = {
            x: Aedges[i].x - Aedges[i + 1].x,
            y: Aedges[i].y - Aedges[i + 1].y,
          };
          let d2 = polygonProjectionDistance(A, B, edgeB);
          d =
            d === null && d2 === null
              ? null
              : d === null
                ? d2
                : d2 === null
                  ? d
                  : Math.min(d, d2);
          if (d !== null && !almostEqual(d, 0))
            vectors.push({ x: edgeA.x * d, y: edgeA.y * d });
        } else {
          for (const touch of touchingA) {
            const edgeB = {
              x: B[touch.B].x - B[(touch.B + 1) % B.length].x,
              y: B[touch.B].y - B[(touch.B + 1) % B.length].y,
            };
            let vd1: number | null = null,
              vd2: number | null = null;
            if (touch.type === 0 || touch.type === 1) {
              vd1 = polygonSlideDistance(A, B, edgeA, true);
              vd2 = polygonSlideDistance(A, B, edgeB, true);
            }
            const trimA =
              vd1 !== null ? { x: edgeA.x * vd1, y: edgeA.y * vd1 } : null;
            const trimB =
              vd2 !== null ? { x: edgeB.x * vd2, y: edgeB.y * vd2 } : null;
            if (trimA) vectors.push(trimA);
            if (trimB) vectors.push(trimB);
          }
        }
      }

      if (vectors.length === 0) break;

      // pick the vector with the smallest magnitude that is not zero and doesn't reverse
      let translate: Point | null = null;
      let maxLen = 0;
      for (const v of vectors) {
        const vlen = v.x * v.x + v.y * v.y;
        if (vlen > maxLen) {
          maxLen = vlen;
          translate = v;
        }
      }

      if (
        !translate ||
        (almostEqual(translate.x, 0) && almostEqual(translate.y, 0))
      )
        break;

      if (prevvector) {
        const dot = prevvector.x * translate.x + prevvector.y * translate.y;
        if (dot < 0) break;
      }

      prevvector = translate;
      NFP.push({ x: reference.x, y: reference.y });
      reference = {
        x: reference.x + translate.x,
        y: reference.y + translate.y,
      };
      B.offsetx = (B.offsetx ?? 0) + translate.x;
      B.offsety = (B.offsety ?? 0) + translate.y;

      if (
        almostEqual(reference.x, start.x) &&
        almostEqual(reference.y, start.y)
      )
        break;
      counter++;
    }

    if (NFP.length > 0) NFPlist.push(NFP);

    if (!searchEdges) break;
    startPoint = searchStartPoint(A, B, inside, NFPlist);
  }

  return NFPlist.length > 0 ? NFPlist : null;
}

// ---------------------------------------------------------------------------
// intersect — used to validate NFP startpoints
// ---------------------------------------------------------------------------

export const GeometryUtil = {
  almostEqual,
  withinDistance,
  polygonArea,
  getPolygonBounds,
  rotatePolygon,
  transformPolygon,
  pointInPolygon,
  isRectangle,
  noFitPolygon,
  noFitPolygonRectangle,
  polygonSlideDistance,
  polygonProjectionDistance,
  QuadraticBezier,
  CubicBezier,
  Arc,

  intersect(A: NestPolygon, B: NestPolygon): boolean {
    const Aox = A.offsetx ?? 0,
      Aoy = A.offsety ?? 0;
    const Box = B.offsetx ?? 0,
      Boy = B.offsety ?? 0;
    const edgeA = [...A, A[0]];
    const edgeB = [...B, B[0]];

    for (let i = 0; i < edgeA.length - 1; i++) {
      for (let j = 0; j < edgeB.length - 1; j++) {
        const a1 = { x: edgeA[i].x + Aox, y: edgeA[i].y + Aoy };
        const a2 = { x: edgeA[i + 1].x + Aox, y: edgeA[i + 1].y + Aoy };
        const b1 = { x: edgeB[j].x + Box, y: edgeB[j].y + Boy };
        const b2 = { x: edgeB[j + 1].x + Box, y: edgeB[j + 1].y + Boy };

        const pindex = j === 0 ? edgeB.length - 2 : j - 1;
        const nindex = j + 1 === edgeB.length - 1 ? 1 : j + 2;
        const b0 = { x: edgeB[pindex].x + Box, y: edgeB[pindex].y + Boy };
        const b3 = { x: edgeB[nindex].x + Box, y: edgeB[nindex].y + Boy };

        if (
          onSegment(a1, a2, b1) ||
          (almostEqual(a1.x, b1.x) && almostEqual(a1.y, b1.y))
        ) {
          const b0in = pointInPolygon(b0, A);
          const b2in = pointInPolygon(b2, A);
          if (
            (b0in === true && b2in === false) ||
            (b0in === false && b2in === true)
          )
            return true;
          continue;
        }
        if (
          onSegment(a1, a2, b2) ||
          (almostEqual(a2.x, b2.x) && almostEqual(a2.y, b2.y))
        ) {
          const b1in = pointInPolygon(b1, A);
          const b3in = pointInPolygon(b3, A);
          if (
            (b1in === true && b3in === false) ||
            (b1in === false && b3in === true)
          )
            return true;
          continue;
        }

        const p = lineIntersect(b1, b2, a1, a2);
        if (p !== null) return true;
      }
    }
    return false;
  },
};
