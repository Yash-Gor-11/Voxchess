import { Chess } from "chess.js";
import { generateId, type TreeNode } from "@/lib/chess/analysisEngine";

export function mergeContinuation(
  sourceNode: TreeNode,
  moves: string[],
): void {
  if (moves.length === 0) return;

  let current = sourceNode;

  for (const san of moves) {
    const chess = new Chess(current.fen);

    let result;
    try {
      result = chess.move(san);
    } catch {
      break;
    }
    if (!result) break;

    const moveKey = result.from + result.to + (result.promotion ?? "");
    const existing = current.children.find((c) => c.move === moveKey);

    if (existing) {
      current = existing;
      continue;
    }

    const newNode: TreeNode = {
      id: generateId(),
      fen: chess.fen(),
      move: moveKey,
      san: result.san,
      parent: current,
      children: [],
      arrows: [],
      highlights: [],
      isMainLine: false,
      plyIndex: current.plyIndex + 1,
    };

    current.children.push(newNode);
    current = newNode;
  }
}