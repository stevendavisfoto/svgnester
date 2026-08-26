/**
 * SVG Parser — converts SVG elements to NestPolygon arrays.
 * Supports: path, rect, circle, ellipse, polygon, polyline, line.
 * Bezier curves and arcs are linearized according to curveTolerance.
 */

import type { NestPolygon, Point } from "src/types";
import { GeometryUtil } from "src/core/geometry";

interface ParserConfig {
  tolerance: number;
  toleranceSvg: number;
}

const DEFAULT_CONFIG: ParserConfig = { tolerance: 0.3, toleranceSvg: 0.005 };

// 2×3 affine matrix [a, b, c, d, e, f] representing [[a,c,e],[b,d,f],[0,0,1]]
class Matrix {
  data: number[] = [1, 0, 0, 1, 0, 0]; // identity

  multiply(m: number[]): Matrix {
    const [a1, b1, c1, d1, e1, f1] = this.data;
    const [a2, b2, c2, d2, e2, f2] = m;
    const r = new Matrix();
    r.data = [
      a1 * a2 + c1 * b2,
      b1 * a2 + d1 * b2,
      a1 * c2 + c1 * d2,
      b1 * c2 + d1 * d2,
      a1 * e2 + c1 * f2 + e1,
      b1 * e2 + d1 * f2 + f1,
    ];
    return r;
  }

  calc(x: number, y: number): [number, number] {
    const [a, b, c, d, e, f] = this.data;
    return [a * x + c * y + e, b * x + d * y + f];
  }

  isIdentity(): boolean {
    const [a, b, c, d, e, f] = this.data;
    return a === 1 && b === 0 && c === 0 && d === 1 && e === 0 && f === 0;
  }
}

function parseTransform(str: string): Matrix {
  const m = new Matrix();
  const re =
    /\s*(matrix|translate|scale|rotate|skewX|skewY)\s*\(\s*([^)]+)\s*\)/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(str)) !== null) {
    const cmd = match[1];
    const params = match[2]
      .trim()
      .split(/[\s,]+/)
      .map(Number);
    switch (cmd) {
      case "matrix":
        if (params.length === 6) {
          const n = new Matrix();
          n.data = params;
          return m.multiply(params);
        }
        break;
      case "translate": {
        const tx = params[0] ?? 0,
          ty = params[1] ?? 0;
        const n = new Matrix();
        n.data = [1, 0, 0, 1, tx, ty];
        m.data = m.multiply(n.data).data;
        break;
      }
      case "scale": {
        const sx = params[0] ?? 1,
          sy = params[1] ?? sx;
        const n = new Matrix();
        n.data = [sx, 0, 0, sy, 0, 0];
        m.data = m.multiply(n.data).data;
        break;
      }
      case "rotate": {
        const angle = ((params[0] ?? 0) * Math.PI) / 180;
        const cx = params[1] ?? 0,
          cy = params[2] ?? 0;
        const cos = Math.cos(angle),
          sin = Math.sin(angle);
        const t1 = new Matrix();
        t1.data = [1, 0, 0, 1, -cx, -cy];
        const rot = new Matrix();
        rot.data = [cos, sin, -sin, cos, 0, 0];
        const t2 = new Matrix();
        t2.data = [1, 0, 0, 1, cx, cy];
        m.data = m.multiply(t1.data).multiply(rot.data).multiply(t2.data).data;
        break;
      }
      case "skewX": {
        const tan = Math.tan(((params[0] ?? 0) * Math.PI) / 180);
        const n = new Matrix();
        n.data = [1, 0, tan, 1, 0, 0];
        m.data = m.multiply(n.data).data;
        break;
      }
      case "skewY": {
        const tan = Math.tan(((params[0] ?? 0) * Math.PI) / 180);
        const n = new Matrix();
        n.data = [1, tan, 0, 1, 0, 0];
        m.data = m.multiply(n.data).data;
        break;
      }
    }
  }
  return m;
}

// ---------------------------------------------------------------------------
// Path data parser (d attribute)
// ---------------------------------------------------------------------------

function parsePathData(d: string): Array<{ cmd: string; args: number[] }> {
  const segments: Array<{ cmd: string; args: number[] }> = [];
  const re = /([MLHVCSQTAZmlhvcsqtaz])([^MLHVCSQTAZmlhvcsqtaz]*)/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(d)) !== null) {
    const cmd = match[1];
    const argsStr = match[2].trim();
    const args =
      argsStr.length > 0
        ? argsStr
            .split(/[\s,]+/)
            .map(Number)
            .filter((n) => !isNaN(n))
        : [];
    segments.push({ cmd, args });
  }
  return segments;
}

function pathToPoints(d: string, transform: Matrix, tol: number): Point[] {
  const segments = parsePathData(d);
  const points: Point[] = [];
  let x = 0,
    y = 0,
    x0 = 0,
    y0 = 0;
  let prevCmd = "";
  let prevCx = 0,
    prevCy = 0;

  const push = (px: number, py: number) => {
    const [tx, ty] = transform.calc(px, py);
    points.push({ x: tx, y: ty });
  };

  for (const { cmd, args } of segments) {
    switch (cmd) {
      case "M":
      case "m": {
        const abs = cmd === "M";
        for (let i = 0; i < args.length; i += 2) {
          x = abs ? args[i] : x + args[i];
          y = abs ? args[i + 1] : y + args[i + 1];
          if (i === 0) {
            x0 = x;
            y0 = y;
          }
          push(x, y);
        }
        break;
      }
      case "L":
      case "l": {
        const abs = cmd === "L";
        for (let i = 0; i < args.length; i += 2) {
          x = abs ? args[i] : x + args[i];
          y = abs ? args[i + 1] : y + args[i + 1];
          push(x, y);
        }
        break;
      }
      case "H":
      case "h":
        for (const a of args) {
          x = cmd === "H" ? a : x + a;
          push(x, y);
        }
        break;
      case "V":
      case "v":
        for (const a of args) {
          y = cmd === "V" ? a : y + a;
          push(x, y);
        }
        break;
      case "C":
      case "c": {
        const abs = cmd === "C";
        for (let i = 0; i < args.length; i += 6) {
          const x1 = abs ? args[i] : x + args[i];
          const y1 = abs ? args[i + 1] : y + args[i + 1];
          const x2 = abs ? args[i + 2] : x + args[i + 2];
          const y2 = abs ? args[i + 3] : y + args[i + 3];
          const ex = abs ? args[i + 4] : x + args[i + 4];
          const ey = abs ? args[i + 5] : y + args[i + 5];
          const pts = GeometryUtil.CubicBezier.linearize(
            { x, y },
            { x: ex, y: ey },
            { x: x1, y: y1 },
            { x: x2, y: y2 },
            tol,
          );
          pts.slice(1).forEach((p) => {
            const [tx, ty] = transform.calc(p.x, p.y);
            points.push({ x: tx, y: ty });
          });
          prevCx = x2;
          prevCy = y2;
          x = ex;
          y = ey;
        }
        break;
      }
      case "S":
      case "s": {
        const abs = cmd === "S";
        for (let i = 0; i < args.length; i += 4) {
          const x1 = /[CS]/.test(prevCmd) ? 2 * x - prevCx : x;
          const y1 = /[CS]/.test(prevCmd) ? 2 * y - prevCy : y;
          const x2 = abs ? args[i] : x + args[i];
          const y2 = abs ? args[i + 1] : y + args[i + 1];
          const ex = abs ? args[i + 2] : x + args[i + 2];
          const ey = abs ? args[i + 3] : y + args[i + 3];
          const pts = GeometryUtil.CubicBezier.linearize(
            { x, y },
            { x: ex, y: ey },
            { x: x1, y: y1 },
            { x: x2, y: y2 },
            tol,
          );
          pts.slice(1).forEach((p) => {
            const [tx, ty] = transform.calc(p.x, p.y);
            points.push({ x: tx, y: ty });
          });
          prevCx = x2;
          prevCy = y2;
          x = ex;
          y = ey;
        }
        break;
      }
      case "Q":
      case "q": {
        const abs = cmd === "Q";
        for (let i = 0; i < args.length; i += 4) {
          const x1 = abs ? args[i] : x + args[i];
          const y1 = abs ? args[i + 1] : y + args[i + 1];
          const ex = abs ? args[i + 2] : x + args[i + 2];
          const ey = abs ? args[i + 3] : y + args[i + 3];
          const pts = GeometryUtil.QuadraticBezier.linearize(
            { x, y },
            { x: ex, y: ey },
            { x: x1, y: y1 },
            tol,
          );
          pts.slice(1).forEach((p) => {
            const [tx, ty] = transform.calc(p.x, p.y);
            points.push({ x: tx, y: ty });
          });
          prevCx = x1;
          prevCy = y1;
          x = ex;
          y = ey;
        }
        break;
      }
      case "T":
      case "t": {
        const abs = cmd === "T";
        for (let i = 0; i < args.length; i += 2) {
          const x1 = /[QT]/.test(prevCmd) ? 2 * x - prevCx : x;
          const y1 = /[QT]/.test(prevCmd) ? 2 * y - prevCy : y;
          const ex = abs ? args[i] : x + args[i];
          const ey = abs ? args[i + 1] : y + args[i + 1];
          const pts = GeometryUtil.QuadraticBezier.linearize(
            { x, y },
            { x: ex, y: ey },
            { x: x1, y: y1 },
            tol,
          );
          pts.slice(1).forEach((p) => {
            const [tx, ty] = transform.calc(p.x, p.y);
            points.push({ x: tx, y: ty });
          });
          prevCx = x1;
          prevCy = y1;
          x = ex;
          y = ey;
        }
        break;
      }
      case "A":
      case "a": {
        const abs = cmd === "A";
        for (let i = 0; i < args.length; i += 7) {
          const rx = args[i],
            ry = args[i + 1],
            angle = args[i + 2];
          const la = args[i + 3],
            sw = args[i + 4];
          const ex = abs ? args[i + 5] : x + args[i + 5];
          const ey = abs ? args[i + 6] : y + args[i + 6];
          const pts = GeometryUtil.Arc.linearize(
            { x, y },
            { x: ex, y: ey },
            rx,
            ry,
            angle,
            la,
            sw,
            tol,
          );
          pts.forEach((p) => {
            const [tx, ty] = transform.calc(p.x, p.y);
            points.push({ x: tx, y: ty });
          });
          x = ex;
          y = ey;
        }
        break;
      }
      case "Z":
      case "z":
        x = x0;
        y = y0;
        break;
    }
    prevCmd = cmd.toUpperCase();
  }

  return points;
}

// ---------------------------------------------------------------------------
// Main element → polygon conversion
// ---------------------------------------------------------------------------

function elementToPolygon(
  el: Element,
  transform: Matrix,
  tol: number,
): NestPolygon | null {
  const localTransformStr = el.getAttribute("transform") ?? "";
  const local = localTransformStr
    ? parseTransform(localTransformStr)
    : new Matrix();
  const combined = transform.isIdentity()
    ? local
    : transform.multiply(local.data);

  const tag = el.tagName.toLowerCase().replace(/^.*:/, "");
  let points: Point[] = [];

  if (tag === "path") {
    const d = el.getAttribute("d") ?? "";
    if (!d) return null;
    points = pathToPoints(d, combined, tol);
  } else if (tag === "rect") {
    const x = parseFloat(el.getAttribute("x") ?? "0");
    const y = parseFloat(el.getAttribute("y") ?? "0");
    const w = parseFloat(el.getAttribute("width") ?? "0");
    const h = parseFloat(el.getAttribute("height") ?? "0");
    if (w <= 0 || h <= 0) return null;
    [
      [x, y],
      [x + w, y],
      [x + w, y + h],
      [x, y + h],
    ].forEach(([px, py]) => {
      const [tx, ty] = combined.calc(px, py);
      points.push({ x: tx, y: ty });
    });
  } else if (tag === "circle") {
    const cx = parseFloat(el.getAttribute("cx") ?? "0");
    const cy = parseFloat(el.getAttribute("cy") ?? "0");
    const r = parseFloat(el.getAttribute("r") ?? "0");
    if (r <= 0) return null;
    const steps = Math.max(24, Math.ceil((2 * Math.PI * r) / tol));
    for (let i = 0; i < steps; i++) {
      const angle = (2 * Math.PI * i) / steps;
      const [tx, ty] = combined.calc(
        cx + r * Math.cos(angle),
        cy + r * Math.sin(angle),
      );
      points.push({ x: tx, y: ty });
    }
  } else if (tag === "ellipse") {
    const cx = parseFloat(el.getAttribute("cx") ?? "0");
    const cy = parseFloat(el.getAttribute("cy") ?? "0");
    const rx = parseFloat(el.getAttribute("rx") ?? "0");
    const ry = parseFloat(el.getAttribute("ry") ?? "0");
    if (rx <= 0 || ry <= 0) return null;
    const steps = Math.max(
      24,
      Math.ceil((2 * Math.PI * Math.max(rx, ry)) / tol),
    );
    for (let i = 0; i < steps; i++) {
      const angle = (2 * Math.PI * i) / steps;
      const [tx, ty] = combined.calc(
        cx + rx * Math.cos(angle),
        cy + ry * Math.sin(angle),
      );
      points.push({ x: tx, y: ty });
    }
  } else if (tag === "polygon" || tag === "polyline") {
    const pts = (el.getAttribute("points") ?? "")
      .trim()
      .split(/[\s,]+/)
      .map(Number);
    for (let i = 0; i < pts.length - 1; i += 2) {
      const [tx, ty] = combined.calc(pts[i], pts[i + 1]);
      points.push({ x: tx, y: ty });
    }
  } else if (tag === "line") {
    const x1 = parseFloat(el.getAttribute("x1") ?? "0");
    const y1 = parseFloat(el.getAttribute("y1") ?? "0");
    const x2 = parseFloat(el.getAttribute("x2") ?? "0");
    const y2 = parseFloat(el.getAttribute("y2") ?? "0");
    const [tx1, ty1] = combined.calc(x1, y1);
    const [tx2, ty2] = combined.calc(x2, y2);
    points = [
      { x: tx1, y: ty1 },
      { x: tx2, y: ty2 },
    ];
  }

  if (points.length < 3) return null;
  return points as NestPolygon;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface ParseResult {
  /** All top-level polygons (parts). Children are nested holes. */
  polygons: NestPolygon[];
  /** The raw SVG root element — used for building the result SVG */
  svgRoot: SVGSVGElement;
  /** The original SVG string, for export */
  svgString: string;
}

/**
 * A serialized representation of a single SVG element — no DOM nodes, safe to
 * postMessage to a Web Worker.
 */
export interface SerializedElement {
  tag: string;
  /** All attribute name→value pairs from the element. */
  attrs: Record<string, string>;
  /** Accumulated parent transform as a 6-number affine matrix [a,b,c,d,e,f]. */
  parentTransform: number[];
}

const ALLOWED_TAGS = new Set([
  "path",
  "rect",
  "circle",
  "ellipse",
  "polygon",
  "polyline",
  "line",
]);

/** Hard cap on the number of paths parsed to prevent the main thread from freezing. */
const MAX_ELEMENTS = 500;
/** Hard cap on vertices per polygon — paths with more are downsampled. */
const MAX_VERTICES = 2000;

function downsample(pts: Point[], max: number): Point[] {
  if (pts.length <= max) return pts;
  const step = pts.length / max;
  const out: Point[] = [];
  for (let i = 0; i < max; i++) out.push(pts[Math.round(i * step)]);
  return out;
}

function collectSerializedElements(
  root: Element,
  result: SerializedElement[],
  transform: Matrix,
) {
  for (const child of Array.from(root.children)) {
    const tag = child.tagName.toLowerCase().replace(/^.*:/, "");
    if (tag === "g" || tag === "svg") {
      const ts = child.getAttribute("transform") ?? "";
      const m = ts ? parseTransform(ts) : new Matrix();
      const combined = transform.isIdentity() ? m : transform.multiply(m.data);
      collectSerializedElements(child, result, combined);
    } else if (ALLOWED_TAGS.has(tag)) {
      const attrs: Record<string, string> = {};
      for (const attr of Array.from(child.attributes)) {
        attrs[attr.name] = attr.value;
      }
      result.push({ tag, attrs, parentTransform: transform.data });
    }
  }
}

/**
 * Phase 1 (main thread only): parse the SVG DOM and extract all serializable
 * element data. This is fast — no bezier tessellation happens here.
 */
export function extractElements(svgString: string): SerializedElement[] {
  const parser = new DOMParser();
  const doc = parser.parseFromString(svgString, "image/svg+xml");
  const svgRoot = doc.querySelector("svg");
  if (!svgRoot) throw new Error("No <svg> element found");
  const result: SerializedElement[] = [];
  collectSerializedElements(svgRoot, result, new Matrix());
  if (result.length > MAX_ELEMENTS) {
    console.warn(
      `SVG has ${result.length} elements — only the first ${MAX_ELEMENTS} will be processed.`,
    );
    return result.slice(0, MAX_ELEMENTS);
  }
  return result;
}

/**
 * Phase 2 (worker-safe): tessellate serialized elements into NestPolygons.
 * No DOM APIs needed — pure computation.
 */
export function tessellateElements(
  elements: SerializedElement[],
  tolerance: number,
  onProgress?: (pct: number) => void,
): NestPolygon[] {
  const polygons: NestPolygon[] = [];
  let id = 0;

  for (let i = 0; i < elements.length; i++) {
    if (onProgress) onProgress(Math.round((i / elements.length) * 90));
    const { tag, attrs, parentTransform } = elements[i];
    const parentMatrix = new Matrix();
    parentMatrix.data = parentTransform;

    // Reconstruct a minimal proxy that elementToPolygon can read via getAttribute.
    const el = {
      getAttribute: (name: string) => attrs[name] ?? null,
      tagName: tag,
    } as unknown as Element;

    let points = elementToPolygon(el, parentMatrix, tolerance);
    if (!points || points.length < 3) continue;
    if (
      Math.abs(GeometryUtil.polygonArea(points as NestPolygon)) <
      tolerance * tolerance
    )
      continue;
    if (points.length > MAX_VERTICES)
      points = downsample(points, MAX_VERTICES) as unknown as NestPolygon;
    const poly = points as NestPolygon;
    poly.id = id++;
    poly.source = i;
    polygons.push(poly);
  }

  if (onProgress) onProgress(95);
  toTree(polygons);
  if (onProgress) onProgress(100);
  return polygons;
}

/** Full synchronous parse — used as a fallback and in existing engine.loadSvg path. */
export function parseSvg(
  svgString: string,
  config: Partial<ParserConfig> = {},
): ParseResult {
  const { tolerance } = { ...DEFAULT_CONFIG, ...config };
  const elements = extractElements(svgString);
  const polygons = tessellateElements(elements, tolerance);

  // Re-parse the DOM root (cheap) just to satisfy the ParseResult type.
  const doc = new DOMParser().parseFromString(svgString, "image/svg+xml");
  const svgRoot = doc.querySelector("svg") as SVGSVGElement;

  return { polygons, svgRoot, svgString };
}

function toTree(list: NestPolygon[], idStart = 0): number {
  let id = idStart;

  // Pre-compute bounding boxes once so the inner loop can skip pairs cheaply.
  const bounds = list.map((p) => GeometryUtil.getPolygonBounds(p));

  for (let i = 0; i < list.length; i++) {
    const p = list[i];
    p.id = id++;
    p.children = [];
    let isChild = false;
    const pb = bounds[i];
    for (let j = 0; j < list.length; j++) {
      if (j === i) continue;
      const other = list[j];
      const ob = bounds[j];
      // Bounding-box precheck: p[0] must lie inside other's bbox before running
      // the full (expensive) pointInPolygon ray-cast.
      if (pb && ob) {
        const pt = p[0];
        if (
          pt.x < ob.x ||
          pt.x > ob.x + ob.width ||
          pt.y < ob.y ||
          pt.y > ob.y + ob.height
        )
          continue;
      }
      if (GeometryUtil.pointInPolygon(p[0], other) === true) {
        if (!other.children) other.children = [];
        other.children.push(p);
        p.parent = other;
        isChild = true;
        break;
      }
    }
    if (isChild) {
      // will be pruned from top level below
    }
  }
  // prune children from top level
  for (let i = list.length - 1; i >= 0; i--) {
    if (list[i].parent) list.splice(i, 1);
  }
  for (const p of list) {
    if (p.children && p.children.length > 0) {
      id = toTree(p.children, id);
    }
  }
  return id;
}

export function polygonToPathD(
  polygon: NestPolygon,
  offsetX = 0,
  offsetY = 0,
  rotation = 0,
  mirrored = false,
): string {
  if (polygon.length === 0) return "";
  const rad = rotation * (Math.PI / 180);
  const cos = Math.cos(rad),
    sin = Math.sin(rad);
  // Mirror-then-rotate, matching GeometryUtil.transformPolygon. Winding is not
  // restored because a closed path draws identically either way.
  const sx = mirrored ? -1 : 1;
  const transform = (p: Point) => ({
    x: p.x * sx * cos - p.y * sin + offsetX,
    y: p.x * sx * sin + p.y * cos + offsetY,
  });
  const pts = polygon.map(transform);
  return (
    `M ${pts[0].x} ${pts[0].y} ` +
    pts
      .slice(1)
      .map((p) => `L ${p.x} ${p.y}`)
      .join(" ") +
    " Z"
  );
}
