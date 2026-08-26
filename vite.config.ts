import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import wasm from "vite-plugin-wasm";
import path from "path";

// Vite plugin that adds Cross-Origin-Isolation headers required for SharedArrayBuffer
function crossOriginIsolationPlugin() {
  return {
    name: "cross-origin-isolation",
    configureServer(server: any) {
      server.middlewares.use((_req: any, res: any, next: any) => {
        res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
        res.setHeader("Cross-Origin-Embedder-Policy", "require-corp");
        next();
      });
    },
    configurePreviewServer(server: any) {
      server.middlewares.use((_req: any, res: any, next: any) => {
        res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
        res.setHeader("Cross-Origin-Embedder-Policy", "require-corp");
        next();
      });
    },
  };
}

export default defineConfig({
  resolve: {
    alias: {
      src: path.resolve(__dirname, "src"),
    },
  },
  build: {
    target: "esnext",
  },
  plugins: [react(), wasm(), crossOriginIsolationPlugin()],
  worker: {
    format: "es",
    plugins: () => [wasm()],
  },
  optimizeDeps: {
    include: ["clipper-lib"],
  },
});
