import { Chessboard } from "react-chessboard";

interface Props {
  fen: string;
  onPieceDrop: (source: string, target: string) => boolean;
}

export function BoardWrapper({ fen, onPieceDrop }: Props) {
  return (
    <div className="relative w-full max-w-[560px] mx-auto aspect-square">
      <Chessboard
        options={{
          position: fen,
          onPieceDrop: ({ sourceSquare, targetSquare }) => {
            if (!targetSquare) return false;
            return onPieceDrop(sourceSquare, targetSquare);
          },
          boardStyle: { borderRadius: 8, overflow: "hidden" },
          darkSquareStyle: { backgroundColor: "var(--board-dark)" },
          lightSquareStyle: { backgroundColor: "var(--board-light)" },
        }}
      />
    </div>
  );
}