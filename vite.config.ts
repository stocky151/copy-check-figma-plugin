import { resolve } from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { viteSingleFile } from "vite-plugin-singlefile";

export default defineConfig({
  root: resolve(import.meta.dirname, "src/ui"),
  plugins: [react(), viteSingleFile()],
  build: {
    emptyOutDir: true,
    outDir: resolve(import.meta.dirname, "dist"),
    target: "es2020",
    rollupOptions: {
      input: resolve(import.meta.dirname, "src/ui/index.html"),
    },
  },
});
