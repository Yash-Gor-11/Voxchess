import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import { copyFileSync, existsSync, mkdirSync, statSync } from "fs";
import { writeFile } from "fs/promises";
import { resolve } from "path";

async function downloadFile(url: string, dest: string): Promise<void> {
  if (existsSync(dest) && statSync(dest).size > 0) return;

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download ${url}: ${response.status} ${response.statusText}`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.byteLength === 0) {
    throw new Error(`Downloaded empty Stockfish asset from ${url}`);
  }

  await writeFile(dest, buffer);
}

export default defineConfig({
  tanstackStart: {
    server: { entry: "server" },
  },
  vite: {
    optimizeDeps: {
      exclude: ["@lichess-org/stockfish-web"],
    },
    assetsInclude: ["**/*.wasm", "**/*.nnue"],
    plugins: [
      {
        name: "copy-stockfish-nnue",
        async buildStart() {
          try {
            mkdirSync("public", { recursive: true });
            const sfDir = resolve("node_modules/@lichess-org/stockfish-web");
            copyFileSync(resolve(sfDir, "sf_18.js"),   resolve("public/sf_18.js"));
            copyFileSync(resolve(sfDir, "sf_18.wasm"), resolve("public/sf_18.wasm"));

            // Download NNUE weights if not already present
            await downloadFile(
              "https://tests.stockfishchess.org/api/nn/nn-c288c895ea92.nnue",
              resolve("public/nn-c288c895ea92.nnue")
            );
            await downloadFile(
              "https://tests.stockfishchess.org/api/nn/nn-37f18f62d772.nnue",
              resolve("public/nn-37f18f62d772.nnue")
            );
            console.log("Stockfish NNUE files ready");
          } catch (e) {
            console.warn("Could not prepare stockfish files:", e);
          }
        },
      },
    ],
  },
});
