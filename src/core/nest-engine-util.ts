/** Thin re-export layer so nest-engine.ts doesn't import from the GPU module directly (avoids circular dep issues) */
export { initGpu, isGpuAvailable } from 'src/gpu/placement-gpu';
export { isSharedMemAvailable } from 'src/core/nfp-cache';
