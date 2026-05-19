import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import { copyFileSync, mkdirSync } from "fs";
import { resolve } from "path";

export default defineConfig({
  tanstackStart: {
    server: { entry: "server" },
  },
  vite: {
    optimizeDeps: {
      exclude: ["stockfish.js"],
    },
    assetsInclude: ["**/*.wasm"],
    plugins: [
      {
        name: "copy-stockfish-wasm",
        buildStart() {
          try {
            mkdirSync("public", { recursive: true });
            copyFileSync(
              resolve("node_modules/stockfish.js/stockfish.wasm.js"),
              resolve("public/stockfish.wasm.js")
            );
            copyFileSync(
              resolve("node_modules/stockfish.js/stockfish.wasm"),
              resolve("public/stockfish.wasm")
            );
          } catch (e) {
            console.warn("Could not copy stockfish files:", e);
          }
        },
      },
    ],
  },
});