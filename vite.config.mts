import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: "dist",
    emptyOutDir: true
  },
  server: {
    port: 5173,
    strictPort: false
  },
  test: {
    environment: "jsdom",
    setupFiles: "./src/renderer/test/setup.ts"
  }
});
