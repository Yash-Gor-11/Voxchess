// src/lib/chess/positionCharacter.ts
//
// Single source of truth for the PositionCharacter tag. Both
// PositionCharacterization.ts (which produces it) and adjustWeights.ts
// (which consumes it) import from here rather than each declaring their
// own copy — a type used across a module boundary belongs in neither
// module, to avoid exactly the kind of drift where one file's copy gets
// a fifth state added and the other doesn't.

export type PositionCharacter = "normal" | "ambiguous" | "tactical" | "both";