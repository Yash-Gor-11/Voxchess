import type { EloConfig } from "@/lib/chess/personalities";

export interface StockfishEval {
  score: number;
  mate: number | null;
  bestMoves: Array<{ move: string; pv: string; score: number; mate: number | null }>;
  depth: number;
}

type EvalCallback = (e: StockfishEval) => void;
type StockfishFactory = () => Promise<StockfishWeb> | StockfishWeb;

interface StockfishWeb {
  uci(command: string): void;
  setNnueBuffer(data: Uint8Array, index?: number): void;
  getRecommendedNnue(index?: number): string;
  listen: (data: string) => void;
  onError: (msg: string) => void;
}

const STOCKFISH_MODULE_PATH = "sf_18.js";
const FALLBACK_NNUE_FILES = ["nn-c288c895ea92.nnue", "nn-37f18f62d772.nnue"] as const;

export class StockfishEngine {
  private sf: StockfishWeb | null = null;
  private onEval: EvalCallback | null = null;
  private isReady = false;
  private queue: string[] = [];
  private currentFen = "";
  private bestMoves: Array<{ move: string; pv: string; score: number; scoreType: string; scoreVal: number }> = [];
  private scoreByMultiPV: Record<number, { type: string; val: number }> = {};
  private latestDepth = 0;
  private evalTimeout: ReturnType<typeof setTimeout> | null = null;
  private activeSide = 1;
  private minInfoDepth = 1;
  private destroyed = false;

  async init(onEval: EvalCallback, onError?: () => void) {
    this.onEval = onEval;
    this.destroyed = false;
    if (typeof window === "undefined") return;

    try {
      const moduleUrl = new URL(STOCKFISH_MODULE_PATH, `${window.location.origin}/`).href;
      const { default: StockfishFactory } = (await import(/* @vite-ignore */ moduleUrl)) as {
        default: StockfishFactory;
      };
      const sf: StockfishWeb = await StockfishFactory();
      if (this.destroyed) {
        sf.uci("quit");
        return;
      }

      this.sf = sf;

      sf.onError = (msg) => {
        console.error("Stockfish error:", msg);
        onError?.();
      };

      sf.listen = (line: string) => this.handleMessage(line);

      const [bigNnue, smallNnue] = await Promise.all([this.loadNnue(sf, 0), this.loadNnue(sf, 1)]);
      if (this.destroyed) {
        sf.uci("quit");
        return;
      }

      sf.setNnueBuffer(bigNnue, 0);
      sf.setNnueBuffer(smallNnue, 1);

      this.send("uci");
      this.send("setoption name MultiPV value 3");
      this.send("isready");
    } catch (err) {
      console.error("Failed to start Stockfish:", err);
      onError?.();
    }
  }

  private async loadNnue(sf: StockfishWeb, index: 0 | 1): Promise<Uint8Array> {
    const filename = sf.getRecommendedNnue(index) || FALLBACK_NNUE_FILES[index];
    const response = await fetch(`/${filename}`);
    if (!response.ok) {
      throw new Error(`Failed to load Stockfish NNUE file ${filename}: ${response.status} ${response.statusText}`);
    }
    return new Uint8Array(await response.arrayBuffer());
  }

  private send(cmd: string) {
    const initCmds = ["uci", "setoption name MultiPV value 3", "isready"];
    if (!this.sf) {
      if (!initCmds.includes(cmd)) this.queue.push(cmd);
      return;
    }
    if (!this.isReady && !initCmds.includes(cmd)) {
      this.queue.push(cmd);
      return;
    }
    this.sf.uci(cmd);
  }

  private handleMessage(line: string) {
    if (line.startsWith("bestmove ")) {
      this.handleBestMove(line);
      return;
    }

    if (line === "readyok") {
      this.isReady = true;
      this.queue.forEach((cmd) => this.sf?.uci(cmd));
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

    if (depth < this.minInfoDepth) return;

    const score = scoreType === "mate" ? (scoreVal > 0 ? 10000 : -10000) : scoreVal;

    this.bestMoves[multipv - 1] = { move, pv: pvString, score, scoreType, scoreVal };
    this.scoreByMultiPV[multipv] = { type: scoreType, val: scoreVal };
    this.latestDepth = depth;

    this.scheduleEval();
  }

  private handleBestMove(line: string) {
    const move = line.split(/\s+/)[1];
    if (!move || move === "(none)") return;

    if (!this.bestMoves[0]) {
      this.bestMoves[0] = { move, pv: move, score: 0, scoreType: "cp", scoreVal: 0 };
    }

    this.scheduleEval(0);
  }

  private scheduleEval(delay = 200) {
    if (this.evalTimeout) clearTimeout(this.evalTimeout);
    this.evalTimeout = setTimeout(() => {
      this.publishEval();
    }, delay);
  }

  private publishEval() {
    if (!this.bestMoves[0]) return;

    const pv1Score = this.scoreByMultiPV[1];
    const normalizedScore = (this.bestMoves[0].score ?? 0) * this.activeSide;
    const normalizedMate = pv1Score?.type === "mate" ? pv1Score.val * this.activeSide : null;

    const bestMoves = this.bestMoves
      .map((m) => {
        if (!m) return null;
        return {
          move: m.move,
          pv: m.pv,
          score: m.score * this.activeSide,
          mate: m.scoreType === "mate" ? m.scoreVal * this.activeSide : null,
        };
      })
      .filter((m): m is { move: string; pv: string; score: number; mate: number | null } => m !== null);

    this.onEval?.({ score: normalizedScore, mate: normalizedMate, bestMoves, depth: this.latestDepth });
  }

  evaluate(fen: string, config: EloConfig = { label: "Analysis", skillLevel: 20, depth: 20 }) {
    if (fen === this.currentFen) return;
    this.currentFen = fen;
    this.queue = [];
    this.bestMoves = [];
    this.scoreByMultiPV = {};
    this.latestDepth = 0;
    this.activeSide = fen.split(" ")[1] === "b" ? -1 : 1;
    if (this.evalTimeout) {
      clearTimeout(this.evalTimeout);
      this.evalTimeout = null;
    }
    this.send("stop");

    if (config.uciElo !== undefined) {
      this.send("setoption name UCI_LimitStrength value true");
      this.send(`setoption name UCI_Elo value ${config.uciElo}`);
      this.minInfoDepth = 1;
      this.send(`position fen ${fen}`);
      this.send(`go movetime ${config.movetime ?? 1000}`);
    } else {
      this.send("setoption name UCI_LimitStrength value false");
      this.send(`setoption name Skill Level value ${config.skillLevel ?? 20}`);
      this.minInfoDepth = Math.min(config.depth ?? 20, 4);
      this.send(`position fen ${fen}`);
      this.send(`go depth ${config.depth ?? 20}`);
    }
  }

  stop() {
    this.send("stop");
  }

  destroy() {
    this.destroyed = true;
    if (this.evalTimeout) {
      clearTimeout(this.evalTimeout);
      this.evalTimeout = null;
    }
    this.sf?.uci("stop");
    this.sf?.uci("quit");
    this.sf = null;
    this.isReady = false;
    this.queue = [];
  }
}
