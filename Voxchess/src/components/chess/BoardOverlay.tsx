import { useRef, useEffect, useState } from "react";

interface Arrow {
  from: string;
  to: string;
}

interface Props {
  arrows: Arrow[];
  highlights: string[];
  boardRef: React.RefObject<HTMLDivElement | null>;
  orientation?: "white" | "black";
}

function squareToCoords(
  square: string,
  boardSize: number,
  orientation: "white" | "black",
): { x: number; y: number } {
  const file = square.charCodeAt(0) - 97; // a=0, h=7
  const rank = parseInt(square[1]) - 1; // 1=0, 8=7

  const col = orientation === "white" ? file : 7 - file;
  const row = orientation === "white" ? 7 - rank : rank;

  const squareSize = boardSize / 8;
  return {
    x: col * squareSize + squareSize / 2,
    y: row * squareSize + squareSize / 2,
  };
}

function squareToRect(
  square: string,
  boardSize: number,
  orientation: "white" | "black",
): { x: number; y: number; size: number } {
  const file = square.charCodeAt(0) - 97;
  const rank = parseInt(square[1]) - 1;

  const col = orientation === "white" ? file : 7 - file;
  const row = orientation === "white" ? 7 - rank : rank;

  const squareSize = boardSize / 8;
  return {
    x: col * squareSize,
    y: row * squareSize,
    size: squareSize,
  };
}

export function BoardOverlay({ arrows, highlights, boardRef, orientation = "white" }: Props) {
  const [boardSize, setBoardSize] = useState(0);

  useEffect(() => {
    if (!boardRef.current) return;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) setBoardSize(entry.contentRect.width);
    });
    observer.observe(boardRef.current);
    setBoardSize(boardRef.current.offsetWidth);
    return () => observer.disconnect();
  }, [boardRef]);

  if (boardSize === 0) return null;

  const squareSize = boardSize / 8;
  const arrowColor = "rgba(255, 170, 0, 0.8)";
  const highlightColor = "rgba(255, 170, 0, 0.35)";

  return (
    <svg
      width={boardSize}
      height={boardSize}
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        pointerEvents: "none",
        zIndex: 10,
      }}
    >
      <defs>
        <marker id="arrowhead" markerWidth="4" markerHeight="4" refX="2" refY="2" orient="auto">
          <polygon points="0 0, 4 2, 0 4" fill={arrowColor} />
        </marker>
      </defs>

      {/* Highlights */}
      {highlights.map((square) => {
        const { x, y, size } = squareToRect(square, boardSize, orientation);
        return (
          <rect
            key={`highlight-${square}`}
            x={x}
            y={y}
            width={size}
            height={size}
            fill={highlightColor}
          />
        );
      })}

      {/* Arrows */}
      {arrows.map((arrow, i) => {
        if (arrow.from === arrow.to) return null;
        const from = squareToCoords(arrow.from, boardSize, orientation);
        const to = squareToCoords(arrow.to, boardSize, orientation);

        // Shorten arrow so it doesn't overlap arrowhead
        const dx = to.x - from.x;
        const dy = to.y - from.y;
        const len = Math.sqrt(dx * dx + dy * dy);
        const shortenBy = squareSize * 0.3;
        const endX = to.x - (dx / len) * shortenBy;
        const endY = to.y - (dy / len) * shortenBy;

        return (
          <line
            key={`arrow-${i}`}
            x1={from.x}
            y1={from.y}
            x2={endX}
            y2={endY}
            stroke={arrowColor}
            strokeWidth={squareSize * 0.15}
            strokeLinecap="round"
            markerEnd="url(#arrowhead)"
          />
        );
      })}
    </svg>
  );
}
