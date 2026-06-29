import { defineConfig } from "vite";

export default defineConfig({
  base: "/hotspot-animator/",
  optimizeDeps: {
    exclude: ["wasm-webp"]
  },
  assetsInclude: ["**/*.wasm"]
});
