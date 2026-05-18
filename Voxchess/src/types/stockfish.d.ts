declare module 'stockfish' {
  function stockfish(): {
    postMessage: (cmd: string) => void;
    onmessage: ((e: MessageEvent) => void) | null;
    terminate: () => void;
  };
  export default stockfish;
}