export interface StockfishEval {
  score: number;
  mate: number | null;
  bestMoves: Array<{ move: string; score: number }>;
  depth: number;
}

type EvalCallback = (e: StockfishEval) => void;

export class StockfishEngine {
  private sf: any = null;
  private onEval: EvalCallback | null = null;
  private isReady = false;
  private queue: string[] = [];
  private currentFen = "";
  private bestMoves: Array<{ move: string; score: number }> = [];
  private latestDepth = 0;
  private latestScoreType = "cp";
  private latestScoreVal = 0;
  private evalTimeout: ReturnType<typeof setTimeout> | null = null;

  init(onEval: EvalCallback) {
    this.onEval = onEval;

    // Use Stockfish via CDN as a simple script
    if (typeof window === "undefined") return;

    const script = document.createElement("script");
    script.src = "https://cdn.jsdelivr.net/npm/stockfish@16/src/stockfish-nnue-16-single.js";
    script.onload = () => {
      this.sf = (window as any).Stockfish();
      this.sf.addMessageListener((line: string) => this.handleMessage(line));
      this.send("uci");
      this.send("setoption name MultiPV value 3");
      this.send("isready");
    };
    document.head.appendChild(script);
  }

  private send(cmd: string) {
    if (!this.sf) { this.queue.push(cmd); return; }
    if (!this.isReady && !["uci","isready","setoption name MultiPV value 3"].includes(cmd)) {
      this.queue.push(cmd);
      return;
    }
    this.sf.postMessage(cmd);
  }

  private handleMessage(line: string) {
    if (line === "readyok") {
      this.isReady = true;
      this.queue.forEach((cmd) => this.sf?.postMessage(cmd));
      this.queue = [];
      return;
    }

    if (!line.startsWith("info") || !line.includes("score") || !line.includes(" pv ")) return;

    const depthMatch   = line.match(/depth (\d+)/);
    const scoreMatch   = line.match(/score (cp|mate) (-?\d+)/);
    const pvMatch      = line.match(/ pv (\S+)/);
    const multipvMatch = line.match(/multipv (\d+)/);

    if (!scoreMatch || !pvMatch) return;

    const depth     = depthMatch   ? parseInt(depthMatch[1])  : 0;
    const multipv   = multipvMatch ? parseInt(multipvMatch[1]) : 1;
    const scoreType = scoreMatch[1];
    const scoreVal  = parseInt(scoreMatch[2]);
    const move      = pvMatch[1];

    if (depth < 8) return;

    const score = scoreType === "mate"
      ? (scoreVal > 0 ? 10000 : -10000)
      : scoreVal;

    this.bestMoves[multipv - 1] = { move, score };
    this.latestDepth    = depth;
    this.latestScoreType = scoreType;
    this.latestScoreVal  = scoreVal;

    if (this.evalTimeout) clearTimeout(this.evalTimeout);
    this.evalTimeout = setTimeout(() => {
      if (this.bestMoves.length === 0) return;
      this.onEval?.({
        score: this.bestMoves[0]?.score ?? 0,
        mate: this.latestScoreType === "mate" ? this.latestScoreVal : null,
        bestMoves: this.bestMoves.filter(Boolean),
        depth: this.latestDepth,
      });
    }, 300);
  }

  evaluate(fen: string) {
    if (fen === this.currentFen) return;
    this.currentFen = fen;
    this.bestMoves  = [];
    this.send("stop");
    this.send(`position fen ${fen}`);
    this.send("go depth 18");
  }

  stop() { this.send("stop"); }

  destroy() {
    if (this.evalTimeout) clearTimeout(this.evalTimeout);
    this.send("stop");
    this.sf = null;
    this.isReady = false;
  }
}