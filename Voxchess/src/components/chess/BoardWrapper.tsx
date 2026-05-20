import { Chessboard } from "react-chessboard";
import { useSettingsStore, BOARD_THEMES } from "@/stores/settingsStore";

interface Props {
  fen: string;
  onPieceDrop: (source: string, target: string) => boolean;
}

export function BoardWrapper({ fen, onPieceDrop }: Props) {
  const { boardThemeIndex, boardSize } = useSettingsStore();
  const theme = BOARD_THEMES[boardThemeIndex] ?? BOARD_THEMES[0];

  return (
    <div className="relative mx-auto aspect-square" style={{ width: boardSize }}>
      <Chessboard
        options={{
          position: fen,
          onPieceDrop: ({ sourceSquare, targetSquare }) => {
            if (!targetSquare) return false;
            return onPieceDrop(sourceSquare, targetSquare);
          },
          boardStyle: { borderRadius: 8, overflow: "hidden" },
          darkSquareStyle: { backgroundColor: theme.dark },
          lightSquareStyle: { backgroundColor: theme.light },
        }}
      />
    </div>
  );
}
