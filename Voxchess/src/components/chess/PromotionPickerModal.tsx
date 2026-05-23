const PIECES = [
  { key: "q", label: "Queen",  white: "♕", black: "♛" },
  { key: "r", label: "Rook",   white: "♖", black: "♜" },
  { key: "b", label: "Bishop", white: "♗", black: "♝" },
  { key: "n", label: "Knight", white: "♘", black: "♞" },
] as const;

interface Props {
  color: "w" | "b";
  onPick: (piece: "q" | "r" | "b" | "n") => void;
  onCancel: () => void;
}

export function PromotionPickerModal({ color, onPick, onCancel }: Props) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-card border border-border rounded-xl shadow-xl p-5 flex flex-col gap-4">
        <div className="text-sm font-medium text-center">Choose promotion piece</div>
        <div className="flex gap-3">
          {PIECES.map((p) => (
            <button
              key={p.key}
              onClick={() => onPick(p.key)}
              className="flex flex-col items-center gap-1 w-16 py-3 rounded-lg border-2 border-border hover:border-[var(--accent-blue)] hover:bg-[var(--accent-blue)]/10 transition-all"
            >
              <span className="text-4xl leading-none">
                {color === "w" ? p.white : p.black}
              </span>
              <span className="text-[10px] text-muted-foreground">{p.label}</span>
            </button>
          ))}
        </div>
        <button
          className="text-xs text-muted-foreground hover:text-foreground transition-colors text-center"
          onClick={onCancel}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}