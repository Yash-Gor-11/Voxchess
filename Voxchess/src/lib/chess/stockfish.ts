// src/lib/chess/stockfish.ts
// Changes from previous version:
// - evaluate() now accepts depth and skillLevel params
// - setoption Skill Level sent before each position

export interface StockfishEval {
  score: number;
  mate: number | null;
  bestMoves: Array<{ move: string; pv: string; score: number; mate: number | null }>;
  depth: number;
}

type EvalCallback = (e: StockfishEval) => void;

export class StockfishEngine {
  private worker: Worker | null = null;
  private onEval: EvalCallback | null = null;
  private isReady = false;
  private queue: string[] = [];
  private currentFen = "";
  private bestMoves: Array<{ move: string; pv: string; score: number; scoreType: string; scoreVal: number }> = [];

  private scoreByMultiPV: Record<number, { type: string; val: number }> = {};
  private latestDepth = 0;
  private evalTimeout: ReturnType<typeof setTimeout> | null = null;
  private activeSide = 1;

  init(onEval: EvalCallback, onError?: () => void) {
    this.onEval = onEval;
    if (typeof window === "undefined") return;

    try {
      this.worker = new Worker("/stockfish.wasm.js", { type: "classic" });

      this.worker.onmessage = (e) => this.handleMessage(e.data);
      this.worker.onerror = (e) => {
        console.error("Stockfish worker error:", e);
        onError?.();
      };

      this.send("uci");
      this.send("setoption name MultiPV value 3");
      this.send("isready");
    } catch (err) {
      console.error("Failed to start Stockfish worker:", err);
      onError?.();
    }
  }

  private send(cmd: string) {
    if (!this.worker) return;
    const initCmds = ["uci", "setoption name MultiPV value 3", "isready"];
    if (!this.isReady && !initCmds.includes(cmd)) {
      this.queue.push(cmd);
      return;
    }
    this.worker.postMessage(cmd);
  }

  private handleMessage(line: string) {
    if (line === "readyok") {
      this.isReady = true;
      this.queue.forEach((cmd) => this.worker?.postMessage(cmd));
      this.queue = [];
      return;
    }

    if (!line.startsWith("info") || !line.includes("score") || !line.includes(" pv ")) return;

    const depthMatch = line.match(/depth (\d+)/);
    const scoreMatch = line.match(/score (cp|mate) (-?\d+)/);
    const pvMatch = line.match(/ pv (.+)/);
    const multipvMatch = line.match(/multipv (\d+)/);
    if (!scoreMatch || !pvMatch) return;

    const depth = depthMatch ? parseInt(depthMatch[1]) : 0;
    const multipv = multipvMatch ? parseInt(multipvMatch[1]) : 1;
    const scoreType = scoreMatch[1];
    const scoreVal = parseInt(scoreMatch[2]);
    const pvString = pvMatch[1];
    const move = pvString.split(" ")[0];

    if (depth < 4) return; // Lower threshold for lower depth settings

    const score = scoreType === "mate" ? (scoreVal > 0 ? 10000 : -10000) : scoreVal;

    this.bestMoves[multipv - 1] = { move, pv: pvString, score, scoreType, scoreVal };
    this.scoreByMultiPV[multipv] = { type: scoreType, val: scoreVal };
    this.latestDepth = depth;

    if (this.evalTimeout) clearTimeout(this.evalTimeout);
    this.evalTimeout = setTimeout(() => {
      if (!this.bestMoves[0]) return;

      const pv1Score = this.scoreByMultiPV[1];
      const normalizedScore = (this.bestMoves[0].score ?? 0) * this.activeSide;
      const normalizedMate = pv1Score?.type === "mate" ? pv1Score.val * this.activeSide : null;

      const bestMoves = this.bestMoves
        .map((m) => {
          if (!m) return null;
          const normalizedMoveScore = m.score * this.activeSide;
          const moveMate = m.scoreType === "mate" ? m.scoreVal * this.activeSide : null;
          return {
            move: m.move,
            pv: m.pv,
            score: normalizedMoveScore,
            mate: moveMate,
          };
        })
        .filter((m): m is { move: string; pv: string; score: number; mate: number | null } => m !== null);

      this.onEval?.({
        score: normalizedScore,
        mate: normalizedMate,
        bestMoves,
        depth: this.latestDepth,
      });
    }, 200);
  }

  evaluate(fen: string, depth = 18, skillLevel = 20) {
    if (fen === this.currentFen) return;
    this.currentFen = fen;
    this.bestMoves = [];
    this.scoreByMultiPV = {};
    this.activeSide = fen.split(" ")[1] === "b" ? -1 : 1;
    this.send("stop");
    this.send(`setoption name Skill Level value ${skillLevel}`);
    this.send(`position fen ${fen}`);
    this.send(`go depth ${depth}`);
  }

  stop() {
    this.send("stop");
  }

  destroy() {
    if (this.evalTimeout) clearTimeout(this.evalTimeout);
    this.send("stop");
    this.worker?.terminate();
    this.worker = null;
    this.isReady = false;
  }
}