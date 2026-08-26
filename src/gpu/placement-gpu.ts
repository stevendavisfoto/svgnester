/**
 * WebGPU Placement Scorer
 *
 * Scores thousands of candidate placement positions in parallel on the GPU.
 * For each candidate (x, y), a compute shader checks whether the position
 * is valid (inside IFP, outside all outer NFPs) and computes a gravity score.
 *
 * Falls back gracefully to CPU scoring when WebGPU is unavailable.
 */

import type { Point, NestPolygon } from "src/types";
import { GeometryUtil } from "src/core/geometry";

// ---------------------------------------------------------------------------
// WGSL compute shader
// ---------------------------------------------------------------------------

// The shader receives:
//   - candidates: array of vec2f (x, y)
//   - ifp: polygon vertices (flat vec2f array) + length
//   - nfpUnion: union polygon vertices (flat vec2f array) + lengths
//   - Output: array of f32 scores (Infinity = invalid)

const SHADER_SOURCE = /* wgsl */ `
struct Candidate {
  x: f32,
  y: f32,
};

struct ScoredCandidate {
  x: f32,
  y: f32,
  score: f32,
  valid: u32,
};

@group(0) @binding(0) var<storage, read>       candidates:    array<vec2f>;
@group(0) @binding(1) var<storage, read>       ifpVerts:      array<vec2f>;
@group(0) @binding(2) var<storage, read>       ifpMeta:       array<u32>;   // [offset, length] pairs
@group(0) @binding(3) var<storage, read>       nfpVerts:      array<vec2f>;
@group(0) @binding(4) var<storage, read>       nfpMeta:       array<u32>;   // [offset, length] pairs
@group(0) @binding(5) var<storage, read_write> output:        array<ScoredCandidate>;

fn pointInPolygon(p: vec2f, verts: ptr<storage, array<vec2f>, read>, offset: u32, n: u32) -> i32 {
  // Winding number test
  var winding = 0i;
  for (var i = 0u; i < n; i = i + 1u) {
    let a = (*verts)[offset + i];
    let b = (*verts)[offset + (i + 1u) % n];
    if (a.y <= p.y) {
      if (b.y > p.y) {
        let cross = (b.x - a.x) * (p.y - a.y) - (p.x - a.x) * (b.y - a.y);
        if (cross > 0.0) { winding = winding + 1i; }
      }
    } else {
      if (b.y <= p.y) {
        let cross = (b.x - a.x) * (p.y - a.y) - (p.x - a.x) * (b.y - a.y);
        if (cross < 0.0) { winding = winding - 1i; }
      }
    }
  }
  return winding;
}

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let idx = gid.x;
  if (idx >= arrayLength(&candidates)) { return; }

  let p = candidates[idx];
  var valid = true;

  // Must be inside at least one IFP polygon
  let ifpPolyCount = arrayLength(&ifpMeta) / 2u;
  var inIfp = false;
  for (var pi = 0u; pi < ifpPolyCount; pi = pi + 1u) {
    let offset = ifpMeta[pi * 2u];
    let length = ifpMeta[pi * 2u + 1u];
    if (pointInPolygon(p, &ifpVerts, offset, length) != 0i) {
      inIfp = true;
      break;
    }
  }
  if (!inIfp) { valid = false; }

  // Must NOT be inside any outer NFP polygon
  if (valid) {
    let nfpPolyCount = arrayLength(&nfpMeta) / 2u;
    for (var pi = 0u; pi < nfpPolyCount; pi = pi + 1u) {
      let offset = nfpMeta[pi * 2u];
      let length = nfpMeta[pi * 2u + 1u];
      if (pointInPolygon(p, &nfpVerts, offset, length) != 0i) {
        valid = false;
        break;
      }
    }
  }

  // Gravity score: minimize x (primary) + y (secondary)
  let score = select(1e30f, p.x + p.y * 0.001f, valid);

  output[idx] = ScoredCandidate(p.x, p.y, score, select(0u, 1u, valid));
}
`;

// ---------------------------------------------------------------------------
// GPU context (singleton)
// ---------------------------------------------------------------------------

interface GpuContext {
  device: GPUDevice;
  pipeline: GPUComputePipeline;
}

let gpuContext: GpuContext | null = null;
let gpuAvailable: boolean | null = null;

export async function initGpu(): Promise<boolean> {
  if (gpuAvailable !== null) return gpuAvailable;

  if (!navigator.gpu) {
    gpuAvailable = false;
    return false;
  }

  try {
    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter) {
      gpuAvailable = false;
      return false;
    }

    const device = await adapter.requestDevice();

    const shaderModule = device.createShaderModule({ code: SHADER_SOURCE });
    const pipeline = await device.createComputePipelineAsync({
      layout: "auto",
      compute: { module: shaderModule, entryPoint: "main" },
    });

    gpuContext = { device, pipeline };
    gpuAvailable = true;
    return true;
  } catch {
    gpuAvailable = false;
    return false;
  }
}

export function isGpuAvailable(): boolean {
  return gpuAvailable === true;
}

// ---------------------------------------------------------------------------
// GPU-accelerated scoring
// ---------------------------------------------------------------------------

function flattenPolygons(polygons: NestPolygon[]): {
  verts: Float32Array;
  meta: Uint32Array;
} {
  const allVerts: number[] = [];
  const metaArr: number[] = [];
  for (const poly of polygons) {
    const offset = allVerts.length / 2;
    for (const p of poly) {
      allVerts.push(p.x, p.y);
    }
    metaArr.push(offset, poly.length);
  }
  return {
    verts: new Float32Array(allVerts.length > 0 ? allVerts : [0, 0]),
    meta: new Uint32Array(metaArr.length > 0 ? metaArr : [0, 0]),
  };
}

export interface ScoreResult {
  x: number;
  y: number;
  score: number;
  valid: boolean;
}

export async function scoreCandidatesGpu(
  candidates: Point[],
  ifpPolygons: NestPolygon[],
  nfpUnionPolygons: NestPolygon[],
): Promise<ScoreResult[]> {
  if (!gpuContext || candidates.length === 0) {
    return scoreCandidatesCpu(candidates, ifpPolygons, nfpUnionPolygons);
  }

  const { device, pipeline } = gpuContext;

  // Build buffers
  const candData = new Float32Array(candidates.flatMap((c) => [c.x, c.y]));
  const ifpFlat = flattenPolygons(ifpPolygons);
  const nfpFlat = flattenPolygons(nfpUnionPolygons);
  const outputByteSize = candidates.length * 4 * 4; // 4 f32/u32 per candidate

  const makeBuf = (
    data: Float32Array | Uint32Array,
    usage: GPUBufferUsageFlags,
  ) => {
    const buf = device.createBuffer({
      size: Math.max(data.byteLength, 4),
      usage,
      mappedAtCreation: true,
    });
    const dst = new Uint8Array(buf.getMappedRange());
    dst.set(
      new Uint8Array(
        data.buffer as ArrayBuffer,
        data.byteOffset,
        data.byteLength,
      ),
    );
    buf.unmap();
    return buf;
  };

  const candBuf = makeBuf(candData, GPUBufferUsage.STORAGE);
  const ifpVertBuf = makeBuf(ifpFlat.verts, GPUBufferUsage.STORAGE);
  const ifpMetaBuf = makeBuf(ifpFlat.meta, GPUBufferUsage.STORAGE);
  const nfpVertBuf = makeBuf(nfpFlat.verts, GPUBufferUsage.STORAGE);
  const nfpMetaBuf = makeBuf(nfpFlat.meta, GPUBufferUsage.STORAGE);
  const outputBuf = device.createBuffer({
    size: outputByteSize,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
  });
  const readBuf = device.createBuffer({
    size: outputByteSize,
    usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
  });

  const bindGroup = device.createBindGroup({
    layout: pipeline.getBindGroupLayout(0),
    entries: [
      { binding: 0, resource: { buffer: candBuf } },
      { binding: 1, resource: { buffer: ifpVertBuf } },
      { binding: 2, resource: { buffer: ifpMetaBuf } },
      { binding: 3, resource: { buffer: nfpVertBuf } },
      { binding: 4, resource: { buffer: nfpMetaBuf } },
      { binding: 5, resource: { buffer: outputBuf } },
    ],
  });

  const cmd = device.createCommandEncoder();
  const pass = cmd.beginComputePass();
  pass.setPipeline(pipeline);
  pass.setBindGroup(0, bindGroup);
  pass.dispatchWorkgroups(Math.ceil(candidates.length / 64));
  pass.end();
  cmd.copyBufferToBuffer(outputBuf, 0, readBuf, 0, outputByteSize);
  device.queue.submit([cmd.finish()]);

  await readBuf.mapAsync(GPUMapMode.READ);
  const data = new Float32Array(readBuf.getMappedRange().slice(0));
  readBuf.unmap();

  // Clean up
  [
    candBuf,
    ifpVertBuf,
    ifpMetaBuf,
    nfpVertBuf,
    nfpMetaBuf,
    outputBuf,
    readBuf,
  ].forEach((b) => b.destroy());

  return Array.from({ length: candidates.length }, (_, i) => ({
    x: data[i * 4],
    y: data[i * 4 + 1],
    score: data[i * 4 + 2],
    valid: data[i * 4 + 3] === 1,
  }));
}

// ---------------------------------------------------------------------------
// CPU fallback (same algorithm, runs synchronously)
// ---------------------------------------------------------------------------

export function scoreCandidatesCpu(
  candidates: Point[],
  ifpPolygons: NestPolygon[],
  nfpUnionPolygons: NestPolygon[],
): ScoreResult[] {
  return candidates.map((c) => {
    const inIfp = ifpPolygons.some(
      (poly) => GeometryUtil.pointInPolygon(c, poly) !== false,
    );
    if (!inIfp) return { x: c.x, y: c.y, score: Infinity, valid: false };

    const inNfp = nfpUnionPolygons.some(
      (poly) => GeometryUtil.pointInPolygon(c, poly) === true,
    );
    if (inNfp) return { x: c.x, y: c.y, score: Infinity, valid: false };

    return { x: c.x, y: c.y, score: c.x + c.y * 0.001, valid: true };
  });
}
