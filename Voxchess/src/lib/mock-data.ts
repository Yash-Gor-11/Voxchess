export const savedGames = [
  {
    id: "1",
    opponent: "Magnus Bot",
    opening: "Sicilian Defence",
    moves: 42,
    date: "2 days ago",
    result: "win" as const,
  },
  {
    id: "2",
    opponent: "GrandmasterAI",
    opening: "Queen's Gambit",
    moves: 31,
    date: "4 days ago",
    result: "loss" as const,
  },
  {
    id: "3",
    opponent: "CasualPlayer99",
    opening: "King's Indian",
    moves: 67,
    date: "1 week ago",
    result: "draw" as const,
  },
  {
    id: "4",
    opponent: "BlitzMaster",
    opening: "Italian Game",
    moves: 28,
    date: "2 weeks ago",
    result: "win" as const,
  },
  {
    id: "5",
    opponent: "Stockfish L5",
    opening: "French Defence",
    moves: 39,
    date: "3 weeks ago",
    result: "loss" as const,
  },
];

export const recentActivity = [
  { id: "a1", text: "Won against Magnus Bot in 42 moves", time: "2h ago", color: "emerald" },
  { id: "a2", text: "Saved analysis of Sicilian Defence", time: "5h ago", color: "blue" },
  { id: "a3", text: "Voice accuracy improved to 91%", time: "1d ago", color: "violet" },
  { id: "a4", text: "Drew with CasualPlayer99", time: "2d ago", color: "amber" },
];

export const dashboardStats = [
  { label: "Games played", value: "142" },
  { label: "Win rate", value: "68%" },
  { label: "Voice accuracy", value: "91%" },
  { label: "Saved games", value: "12" },
];

export const voiceCommandExamples = {
  chess: [
    { phrase: "Knight to f3", san: "Nf3" },
    { phrase: "Pawn to e four", san: "e4" },
    { phrase: "Bishop takes d5", san: "Bxd5" },
    { phrase: "Castle", san: "O-O" },
    { phrase: "Queen to h5", san: "Qh5" },
    { phrase: "Rook to e one", san: "Re1" },
  ],
  nav: [
    { phrase: "Go to dashboard", action: "Navigate to /dashboard" },
    { phrase: "Open saved games", action: "Navigate to /saved-games" },
    { phrase: "New game", action: "Start a new game" },
    { phrase: "Open settings", action: "Navigate to /settings" },
    { phrase: "Sign out", action: "Log out" },
  ],
};

export const tutorialChessMoves = [
  { phrase: "Knight to f3", san: "Nf3", note: "Piece + destination" },
  { phrase: "Pawn e four", san: "e4", note: "Numbers spoken as words" },
  { phrase: "Bishop takes d5", san: "Bxd5", note: "Captures" },
  { phrase: "Castle", san: "O-O", note: "Short castle" },
  { phrase: "Long castle", san: "O-O-O", note: "Queenside" },
  { phrase: "Queen to h five check", san: "Qh5+", note: "With check" },
  { phrase: "Pawn promotes to queen", san: "e8=Q", note: "Promotion" },
];

export const tutorialNavCommands = [
  { phrase: "Go to dashboard", action: "Navigate to /dashboard" },
  { phrase: "Open play", action: "Navigate to /play" },
  { phrase: "Open saved games", action: "Navigate to /saved-games" },
  { phrase: "Settings", action: "Navigate to /settings" },
  { phrase: "Sign out", action: "Log out of your account" },
];

export const tutorialAnalysisCommands = [
  { phrase: "Next move", action: "Step forward in PGN" },
  { phrase: "Previous move", action: "Step backward" },
  { phrase: "Show best line", action: "Toggle engine line" },
  { phrase: "Draw arrow e2 to e4", action: "Annotate" },
];

export const tutorialPvpCommands = [
  { phrase: "Create room", action: "Generate a 6-char code" },
  { phrase: "Join room alpha bravo", action: "Join an existing room" },
  { phrase: "Offer draw", action: "Propose a draw" },
  { phrase: "Resign", action: "Forfeit the game" },
];

export const profileMock = {
  displayName: "Voice Player",
  memberSince: "March 2026",
  rating: 1420,
  stats: { wins: 96, losses: 38, draws: 8 },
  favoriteOpening: "Sicilian Defence",
  avgMoves: 41,
};
