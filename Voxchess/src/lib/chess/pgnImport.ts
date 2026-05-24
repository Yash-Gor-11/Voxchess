import { Chess } from "chess.js";
import { AnalysisTree } from "./analysisEngine";
import type { SerializedNode, TreeNode } from "./analysisEngine";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface ParsedGame {
  headers: Record<string, string>;
  moves: string[];
  comments: (string | undefined)[];
  rootComment?: string;
  startFen: string;
  result: string;
  pgn: string;
}

const START_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

// ─────────────────────────────────────────────────────────────────────────────
// Multi-game splitter
// ─────────────────────────────────────────────────────────────────────────────

export function splitPgn(text: string): string[] {
  const normalized = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const segments = normalized.split(/\n{2,}/);
  const games: string[] = [];
  let buf = "";

  for (const seg of segments) {
    const trimmed = seg.trim();
    if (!trimmed) continue;
    if (trimmed.startsWith("[")) {
      if (buf.trim()) games.push(buf.trim());
      buf = trimmed;
    } else {
      buf = buf ? buf + "\n\n" + trimmed : trimmed;
    }
  }
  if (buf.trim()) games.push(buf.trim());
  return games.filter((g) => g.includes("["));
}

// ─────────────────────────────────────────────────────────────────────────────
// Header parsing
// ─────────────────────────────────────────────────────────────────────────────

function parsePgnHeaders(pgn: string): {
  headers: Record<string, string>;
  movetext: string;
} {
  const lines = pgn.split("\n");
  const headers: Record<string, string> = {};
  let movetextStart = lines.length;

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (trimmed.startsWith("[")) {
      const m = trimmed.match(/^\[(\w+)\s+"([^"]*)"\]$/);
      if (m) headers[m[1]] = m[2];
    } else if (trimmed !== "") {
      movetextStart = i;
      break;
    }
  }

  return { headers, movetext: lines.slice(movetextStart).join(" ").trim() };
}

// ─────────────────────────────────────────────────────────────────────────────
// Tokenizer
// ─────────────────────────────────────────────────────────────────────────────

type Token =
  | { type: "move"; value: string }
  | { type: "comment"; value: string }
  | { type: "nag" }
  | { type: "variation_start" }
  | { type: "variation_end" }
  | { type: "result" };

function tokenize(movetext: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;

  while (i < movetext.length) {
    const ch = movetext[i];
    if (/\s/.test(ch)) { i++; continue; }
    if (ch === ";") { while (i < movetext.length && movetext[i] !== "\n") i++; continue; }
    if (ch === "{") {
      let j = i + 1;
      while (j < movetext.length && movetext[j] !== "}") j++;
      tokens.push({ type: "comment", value: movetext.slice(i + 1, j).trim() });
      i = j + 1;
      continue;
    }
    if (ch === "(") { tokens.push({ type: "variation_start" }); i++; continue; }
    if (ch === ")") { tokens.push({ type: "variation_end" }); i++; continue; }
    if (ch === "$") {
      let j = i + 1;
      while (j < movetext.length && /\d/.test(movetext[j])) j++;
      tokens.push({ type: "nag" });
      i = j;
      continue;
    }
    if (ch === "!" || ch === "?") {
      while (i < movetext.length && (movetext[i] === "!" || movetext[i] === "?")) i++;
      tokens.push({ type: "nag" });
      continue;
    }
    if (/\d/.test(ch)) {
      while (i < movetext.length && /[\d.]/.test(movetext[i])) i++;
      continue;
    }
    let j = i;
    while (j < movetext.length && !/[\s{}();!?$]/.test(movetext[j])) j++;
    if (j > i) {
      const val = movetext.slice(i, j);
      if (val === "1-0" || val === "0-1" || val === "1/2-1/2" || val === "*") {
        tokens.push({ type: "result" });
      } else {
        tokens.push({ type: "move", value: val });
      }
      i = j;
    } else {
      i++;
    }
  }
  return tokens;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function generateId(): string {
  return Math.random().toString(36).slice(2, 9);
}

/**
 * Strip Lichess/PGN engine tags like [%eval 0.11] [%clk 0:05:00] from a
 * comment. Returns undefined if nothing meaningful remains.
 */
function cleanComment(raw: string): string | undefined {
  const cleaned = raw.replace(/\[%[^\]]*\]/g, "").trim();
  return cleaned || undefined;
}

function headerResultToDb(result: string): string {
  if (result === "1-0") return "white";
  if (result === "0-1") return "black";
  if (result === "1/2-1/2") return "draw";
  return "ongoing";
}

// ─────────────────────────────────────────────────────────────────────────────
// Flat extractor — used only by parseSinglePgn for main-line validation
// ─────────────────────────────────────────────────────────────────────────────

function extractMovesAndComments(movetext: string): {
  moves: string[];
  comments: (string | undefined)[];
  rootComment?: string;
} {
  const allTokens = tokenize(movetext);
  const flat: Token[] = [];
  let depth = 0;
  for (const tok of allTokens) {
    if (tok.type === "variation_start") { depth++; continue; }
    if (tok.type === "variation_end") { depth--; continue; }
    if (depth === 0) flat.push(tok);
  }

  const moves: string[] = [];
  const comments: (string | undefined)[] = [];
  let rootComment: string | undefined;
  let afterMove = false;

  for (const tok of flat) {
    if (tok.type === "nag" || tok.type === "result") continue;
    if (tok.type === "comment") {
      const val = cleanComment((tok as { type: "comment"; value: string }).value);
      if (val !== undefined) {
        if (!afterMove) {
          rootComment = rootComment ? rootComment + " " + val : val;
        } else {
          const prev = comments[comments.length - 1];
          comments[comments.length - 1] = prev ? prev + " " + val : val;
        }
      }
    } else if (tok.type === "move") {
      moves.push((tok as { type: "move"; value: string }).value);
      comments.push(undefined);
      afterMove = true;
    }
  }

  return { moves, comments, rootComment };
}

// ─────────────────────────────────────────────────────────────────────────────
// Recursive tree builder — handles sidelines + comments
// ─────────────────────────────────────────────────────────────────────────────

interface ParseState {
  tokens: Token[];
  pos: number;
}

/**
 * Walk a token stream and populate an AnalysisTree with moves, variations,
 * and cleaned comments. Branches recursively for each ( ... ) variation.
 */
function processLine(
  state: ParseState,
  chess: Chess,
  parentNode: TreeNode,
  isMainLine: boolean,
  ply: number,
): void {
  let currentNode = parentNode;
  let currentPly = ply;

  while (state.pos < state.tokens.length) {
    const tok = state.tokens[state.pos];

    if (tok.type === "result") {
      state.pos++;
      break;
    }

    if (tok.type === "variation_end") {
      state.pos++;
      break;
    }

    if (tok.type === "variation_start") {
      state.pos++;
      // A variation is an alternative to the last move made,
      // so it branches from currentNode's parent.
      if (currentNode.parent) {
        const varChess = new Chess(currentNode.parent.fen);
        processLine(
          state,
          varChess,
          currentNode.parent,
          false,
          currentNode.parent.plyIndex + 1,
        );
      } else {
        // Can't branch from root — skip
        let depth = 1;
        while (state.pos < state.tokens.length && depth > 0) {
          if (state.tokens[state.pos].type === "variation_start") depth++;
          if (state.tokens[state.pos].type === "variation_end") depth--;
          state.pos++;
        }
      }
      continue;
    }

    if (tok.type === "comment") {
      state.pos++;
      const val = cleanComment((tok as { type: "comment"; value: string }).value);
      if (val) {
        currentNode.comment = currentNode.comment
          ? currentNode.comment + " " + val
          : val;
      }
      continue;
    }

    if (tok.type === "nag") {
      state.pos++;
      continue;
    }

    if (tok.type === "move") {
      state.pos++;
      const san = (tok as { type: "move"; value: string }).value;
      let result;
      try {
        result = chess.move(san);
      } catch {
        continue;
      }
      if (!result) continue;

      const uci = result.from + result.to + (result.promotion ?? "");

      // Reuse an existing child node if this move was already added
      // (e.g. main line was processed first and a variation re-enters it)
      let childNode = currentNode.children.find((c) => c.move === uci);

      if (!childNode) {
        childNode = {
          id: generateId(),
          fen: chess.fen(),
          move: uci,
          san: result.san,
          parent: currentNode,
          children: [],
          arrows: [],
          highlights: [],
          isMainLine,
          plyIndex: currentPly,
        };
        currentNode.children.push(childNode);
      }

      currentNode = childNode;
      currentPly++;
      continue;
    }

    state.pos++;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

export function parseSinglePgn(pgn: string): ParsedGame | null {
  try {
    const { headers, movetext } = parsePgnHeaders(pgn);
    const startFen = headers.FEN ?? START_FEN;
    const { moves: rawMoves, comments: rawComments, rootComment } =
      extractMovesAndComments(movetext);

    const chess = new Chess(startFen);
    const moves: string[] = [];
    const comments: (string | undefined)[] = [];

    for (let i = 0; i < rawMoves.length; i++) {
      try {
        const res = chess.move(rawMoves[i]);
        if (!res) break;
        moves.push(rawMoves[i]);
        comments.push(rawComments[i]);
      } catch {
        break;
      }
    }

    return {
      headers,
      moves,
      comments,
      rootComment,
      startFen,
      result: headerResultToDb(headers.Result ?? "*"),
      pgn,
    };
  } catch {
    return null;
  }
}

export function parsePgnText(text: string): ParsedGame[] {
  return splitPgn(text)
    .map(parseSinglePgn)
    .filter((g): g is ParsedGame => g !== null);
}

/**
 * Build a full AnalysisTree from a game's PGN including all sidelines and
 * cleaned comments, then serialize it for storage.
 */
export function buildTreeWithComments(game: ParsedGame): SerializedNode {
  const { movetext } = parsePgnHeaders(game.pgn);
  const tokens = tokenize(movetext);
  const tree = new AnalysisTree(game.startFen);

  processLine(
    { tokens, pos: 0 },
    new Chess(game.startFen),
    tree.root,
    true,
    1,
  );

  return tree.serialize();
}