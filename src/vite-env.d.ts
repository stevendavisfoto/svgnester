/// <reference types="vite/client" />
/// <reference types="@webgpu/types" />

// Vite worker imports
declare module '*?worker' {
  const workerConstructor: new () => Worker;
  export default workerConstructor;
}
