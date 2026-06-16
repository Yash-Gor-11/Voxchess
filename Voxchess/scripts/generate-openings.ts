#!/usr/bin/env bun
/**
 * Build-time script: reads all.tsv and emits src/lib/openings.generated.ts
 * Usage: bun run generate:openings
 *        bun run generate:openings path/to/all.tsv  (override source)
 * Add to package.json scripts:
 *   "generate:openings": "bun scripts/generate-openings.ts"
 */

import { readFileSync, writeFileSync } from "fs";
import { join } from "path";

// Improvement 1: CLI arg overrides default; data file lives next to the script,
// not inside src/ which is for application code only.
const TSV_PATH = process.argv[2] ?? join(process.cwd(), "scripts", "all.tsv");
const OUT_PATH = join(process.cwd(), "src", "lib","chess", "openings.generated.ts");

const raw = readFileSync(TSV_PATH, "utf-8");
const lines = raw.split("\n");

// TSV columns: eco  name  pgn  uci  epd
// We only need eco (0), name (1), epd (4).
const entries: Array<{ epd: string; eco: string; name: string }> = [];

for (let i = 1; i < lines.length; i++) {
  const line = lines[i].trim();
  if (!line) continue;

  const parts = line.split("\t");
  if (parts.length < 5) continue;

  const eco = parts[0]?.trim();
  const name = parts[1]?.trim();
  const epd = parts[4]?.trim();

  if (!eco || !name || !epd) continue;

  entries.push({ epd, eco, name });
}

// Deduplicate by EPD.
// Improvement 5: LAST entry wins — later rows in the TSV are deeper/more
// specific variations, so we get "Sicilian Defense: Najdorf Variation" rather
// than just "Sicilian Defense" for the same position.
const map = new Map<string, { eco: string; name: string }>();
for (const { epd, eco, name } of entries) {
  map.set(epd, { eco, name });
}

// Emit TypeScript.
// Typed as Record<string, readonly [string, string]> so index lookup needs no
// cast at the call site, while `as const` still prevents accidental mutation.
const chunks: string[] = [
  "// AUTO-GENERATED — DO NOT EDIT.",
  "// Source: scripts/all.tsv",
  "// Regenerate: bun run generate:openings",
  "",
  "// Keys are EPD strings (FEN minus halfmove + fullmove counters).",
  "// Values are [eco, name] tuples — kept as tuples to minimise bundle size.",
  "export const OPENINGS: Record<string, readonly [string, string]> = {",
];

// Sort by EPD so regenerating with an updated TSV produces clean git diffs.
const sorted = [...map.entries()].sort(([a], [b]) => a.localeCompare(b));

for (const [epd, { eco, name }] of sorted) {
  // JSON.stringify handles any unusual characters / backslashes safely.
  chunks.push(
    `  ${JSON.stringify(epd)}: [${JSON.stringify(eco)}, ${JSON.stringify(name)}],`,
  );
}

chunks.push("} as const;");
chunks.push("");

writeFileSync(OUT_PATH, chunks.join("\n"), "utf-8");
console.log(`✓ Generated ${map.size} openings → ${OUT_PATH}`);