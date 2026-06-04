// scripts/export-lines.ts
// Reads PERSONALITIES from source and writes every unique response line
// to scripts/lines.json so the Python generator knows what to create.
// Run with: npx tsx scripts/export-lines.ts

import { PERSONALITIES } from "../src/lib/chess/personalities";
import { hashText } from "../src/lib/voice/hashText";
import fs from "fs";
import path from "path";

const lines: Array<{ characterId: string; hash: string; text: string }> = [];

for (const personality of PERSONALITIES) {
  const unique = [...new Set(Object.values(personality.responses).flat())];
  for (const text of unique) {
    lines.push({ characterId: personality.id, hash: hashText(text), text });
  }
}

const outPath = path.join("scripts", "lines.json");
fs.writeFileSync(outPath, JSON.stringify(lines, null, 2));
console.log(`Exported ${lines.length} lines to ${outPath}`);