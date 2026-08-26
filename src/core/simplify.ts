/**
 * Ramer-Douglas-Peucker polygon simplification.
 * Reduces vertex count before NFP computation — fewer vertices = O(n*m) speedup.
 */

import type { Point } from 'src/types';

function perpendicularDistance(p: Point, start: Point, end: Point): number {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) {
    const ex = p.x - start.x;
    const ey = p.y - start.y;
    return Math.sqrt(ex * ex + ey * ey);
  }
  const t = Math.max(0, Math.min(1, ((p.x - start.x) * dx + (p.y - start.y) * dy) / lenSq));
  const projX = start.x + t * dx;
  const projY = start.y + t * dy;
  const ex = p.x - projX;
  const ey = p.y - projY;
  return Math.sqrt(ex * ex + ey * ey);
}

function rdp(points: Point[], epsilon: number, result: Point[]): void {
  if (points.length < 3) {
    for (const p of points) result.push(p);
    return;
  }
  let maxDist = 0;
  let maxIdx = 0;
  const start = points[0];
  const end = points[points.length - 1];

  for (let i = 1; i < points.length - 1; i++) {
    const d = perpendicularDistance(points[i], start, end);
    if (d > maxDist) { maxDist = d; maxIdx = i; }
  }

  if (maxDist > epsilon) {
    const left: Point[] = [];
    rdp(points.slice(0, maxIdx + 1), epsilon, left);
    const right: Point[] = [];
    rdp(points.slice(maxIdx), epsilon, right);
    // merge: left ends where right begins
    result.push(...left.slice(0, -1), ...right);
  } else {
    result.push(start, end);
  }
}

/**
 * Simplify a polygon using RDP. `epsilon` is in the same coordinate space
 * as the polygon (SVG units). Larger values = more aggressive simplification.
 */
export function simplifyPolygon(points: Point[], epsilon: number): Point[] {
  if (points.length < 4 || epsilon <= 0) return points;
  const result: Point[] = [];
  // treat as open polyline for RDP, then close
  const open = [...points, points[0]];
  rdp(open, epsilon, result);
  if (result.length > 1 && result[result.length - 1] === result[0]) result.pop();
  return result.length >= 3 ? result : points;
}
