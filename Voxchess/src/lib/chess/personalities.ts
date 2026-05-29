// src/lib/chess/personalities.ts

export type PersonalityId = "frost" | "sterling" | "finn" | "malachar" | "biscuit";
export type AvatarState = "idle" | "thinking" | "talking" | "win" | "lose" | "draw";

export interface Personality {
  id: PersonalityId;
  name: string;
  species: string;
  emoji: string; // fallback when image missing
  accentColor: string;
  images: Record<AvatarState, string>;
  voice: {
    pitch: number;
    rate: number;
    volume?: number;
    // Substrings to match against SpeechSynthesisVoice.name, tried in order
    preferredVoices: string[];
  };
  responses: {
    moveQuips: string[];
    hintPiece: string[];   // first hint press — piece only
    hintMove: string[];    // second hint press — full move
    drawAccept: string[];
    drawRefuse: string[];
    win: string[];         // computer wins (player loses)
    lose: string[];        // computer loses (player wins)
    check: string[];
  };
}

export const PERSONALITIES: Personality[] = [
  {
    id: "frost",
    name: "General Frost",
    species: "Penguin",
    emoji: "🐧",
    accentColor: "#1e40af",
    images: {
      idle: "/characters/frost/idle.png",
      thinking: "/characters/frost/thinking.png",
      talking: "/characters/frost/talking.png",
      win: "/characters/frost/win.png",
      lose: "/characters/frost/lose.png",
      draw: "/characters/frost/draw.png",
    },
    voice: {
      pitch: 0.55,
      rate: 0.88,
      volume: 1.0,
      preferredVoices: [
  "Google UK English Male",   // Chrome / Android
  "Microsoft George",         // Windows (UK male, if installed)
  "Daniel",                   // macOS / iOS (UK male)
  "Arthur",                   // macOS UK male variant
  "Alex",                     // macOS US male
  "Tom",                      // macOS US male
  "Microsoft Mark",           // Windows US male
  "Microsoft David",          // Windows US male fallback
  "Fred",                     // macOS robotic fallback
],

    },
    responses: {
      moveQuips: [
        "Textbook execution, soldier.",
        "Exactly as the operation demanded.",
        "The enemy's flank crumbles.",
        "Strategic superiority maintained.",
        "Proceeding as planned.",
        "The perimeter holds.",
      ],
      hintPiece: [
        "Listen up, recruit. That piece needs to move. That's all you're getting.",
        "Classified intel: focus on that unit. Don't make me repeat myself.",
        "That piece. Move it. Dismissed.",
      ],
      hintMove: [
        "Execute the maneuver to the designated coordinates. Do not deviate.",
        "That's the target square. This information does not leave this board.",
        "Move it there. That's a direct order.",
      ],
      drawAccept: [
        "A temporary armistice. We regroup.",
        "Acceptable terms. For now.",
        "A draw. This will go in no report I file.",
        "Acceptable terms. Officially. Unofficially, I am furious.",
        "The mission is... incomplete.",
      ],
      drawRefuse: [
        "Soldiers don't negotiate. We finish the mission.",
        "A draw is not in the operational vocabulary.",
        "Stand down? Never.",
        "We do not retreat. We do not draw. We advance.",
      ],
      win: [
        "Mission accomplished. As expected.",
        "The operation was a success. Outstanding.",
        "Objective secured. Another flawless campaign.",
        "Exactly as the briefing outlined.",
      ],
      lose: [
        "This is... part of the plan. All part of the plan.",
        "A tactical retreat. We regroup and return stronger.",
        "I let you win to study your strategy. Yes. That's it.",
        "This debrief never happened.",
      ],
      check: [
        "Your king is compromised, soldier.",
        "Check. Adjust your defenses.",
        "The noose tightens.",
      ],
    },
  },

  {
    id: "sterling",
    name: "Dr. Sterling",
    species: "Raccoon",
    emoji: "🦝",
    accentColor: "#78350f",
    images: {
      idle: "/characters/sterling/idle.png",
      thinking: "/characters/sterling/thinking.png",
      talking: "/characters/sterling/talking.png",
      win: "/characters/sterling/win.png",
      lose: "/characters/sterling/lose.png",
      draw: "/characters/sterling/draw.png",
    },
    voice: {
      pitch: 0.9,
      rate: 0.84,
      volume: 0.9,
      preferredVoices: [
  "Daniel",                   // macOS / iOS UK male
  "Google UK English Male",   // Chrome / Android
  "Microsoft George",         // Windows UK male
  "Arthur",                   // macOS UK variant
  "Alex",                     // macOS US male
  "Microsoft Mark",           // Windows US male
  "Tom",                      // macOS US male
  "Microsoft David",          // Windows US fallback
],
    },
    responses: {
      moveQuips: [
        "Precisely as I predicted.",
        "Statistically inevitable.",
        "Your resistance is noted. And futile.",
        "Fascinating. You almost understand chess.",
        "I see you've chosen the suboptimal line. Again.",
        "Adequate. For someone of your level.",
      ],
      hintPiece: [
        "I suppose I can lower myself to explain. That piece. You're welcome.",
        "You wouldn't understand the full analysis, but focus on that unit.",
        "The piece in question is rather obvious. To me, at least.",
      ],
      hintMove: [
        "Move it there. I trust even you can execute that.",
        "The optimal move. Obviously. You're welcome.",
        "That square. It was always that square. Goodbye.",
      ],
      drawAccept: [
        "A draw implies we are equals. We are not. But fine.",
        "I accept. Under protest. The data is inconclusive.",
        "A draw. The board is clearly defective.",
        "This outcome is not in my models. I will be recalibrating overnight.",
        "We are not equals. And yet. Here we are.",
      ],
      drawRefuse: [
        "A draw implies we are equals. We are not.",
        "The very suggestion is offensive to my methodology.",
        "I don't do draws. I do wins.",
        "My calculations do not include a draw outcome.",
      ],
      win: [
        "I pity your kind.",
        "This was never in doubt. For me.",
        "Statistically, this was inevitable. I have the data.",
        "You played adequately. For a human.",
        "As I said from move one. Not that you listened.",
      ],
      lose: [
        "The board is clearly defective.",
        "Something is wrong with this position. It cannot be me.",
        "I demand a rematch. Different board. My calculations were sabotaged.",
        "This outcome is statistically impossible. I'm running diagnostics.",
        "An anomaly. I'll have it explained by morning.",
      ],
      check: [
        "Your king's exposure is... disappointing.",
        "Check. As I calculated three moves ago.",
        "Even you can see the problem now, I assume.",
      ],
    },
  },

  {
    id: "finn",
    name: "Captain Finn",
    species: "Fox",
    emoji: "🦊",
    accentColor: "#c2410c",
    images: {
      idle: "/characters/finn/idle.png",
      thinking: "/characters/finn/thinking.png",
      talking: "/characters/finn/talking.png",
      win: "/characters/finn/win.png",
      lose: "/characters/finn/lose.png",
      draw: "/characters/finn/draw.png",
    },
    voice: {
      pitch: 1.15,
      rate: 1.18,
      volume: 1.0,
      preferredVoices: [
  "Alex",                     // macOS US male (default, natural)
  "Tom",                      // macOS US male
  "Microsoft Mark",           // Windows US male
  "Microsoft David",          // Windows US male
  "Google UK English Male",   // Chrome fallback (still male)
  "Daniel",                   // macOS fallback (still male)
  "Fred",                     // macOS robotic, still male
],
    },
    responses: {
      moveQuips: [
        "Oh, interesting. Keep trying.",
        "Sure, that's a move.",
        "Bold choice. Won't help, but bold.",
        "I've seen worse. Not many, but some.",
        "Points for creativity. Zero for effectiveness.",
        "Hm. I'll allow it.",
      ],
      hintPiece: [
        "Fine. That piece. You're welcome. Now stop asking.",
        "I wasn't going to say anything, but... that one.",
        "Since you're asking — and I really wish you weren't — that piece.",
      ],
      hintMove: [
        "Move it there. Obviously. Please tell me you can see why.",
        "That's where it goes. Try to keep up.",
        "Right there. It's fine, you were going to figure it out eventually.",
      ],
      drawAccept: [
        "Yeah alright. Even I can admit when a thing's even.",
        "Fine. Draw. This never happened.",
        "A draw. Sure. Fine. Whatever.",
        "Half a win is still half a loss. Think about that.",
        "I had you. You know I had you.",
      ],
      drawRefuse: [
        "A draw? Please.",
        "Hard pass. I don't share trophies.",
        "Did you really just ask me that? Genuinely?",
        "Not a chance. We see this through.",
      ],
      win: [
        "Obviously.",
        "Was there ever any doubt? No. No there wasn't.",
        "I'd say good game, but I prefer honesty.",
        "Called it from the opening. Just saying.",
      ],
      lose: [
        "I was letting you win.",
        "Consider this a gift.",
        "Enjoy it. This is a one-time thing.",
        "I got bored. That's my story.",
      ],
      check: [
        "Check. Try to look less surprised.",
        "Your king's in trouble. As predicted.",
        "Check. You might want to do something about that.",
      ],
    },
  },

  {
    id: "malachar",
    name: "Lady Malachar",
    species: "Black Cat",
    emoji: "🐱",
    accentColor: "#7e22ce",
    images: {
      idle: "/characters/malachar/idle.png",
      thinking: "/characters/malachar/thinking.png",
      talking: "/characters/malachar/talking.png",
      win: "/characters/malachar/win.png",
      lose: "/characters/malachar/lose.png",
      draw: "/characters/malachar/draw.png",
    },
    voice: {
      pitch: 0.65,
      rate: 0.76,
      volume: 0.85,
      preferredVoices: [
  "Google UK English Female", // Chrome / Android
  "Serena",                   // macOS UK female
  "Martha",                   // macOS UK female
  "Microsoft Hazel",          // Windows UK female
  "Microsoft Susan",          // Windows UK female variant
  "Karen",                    // macOS Australian female
  "Moira",                    // macOS Irish female
  "Victoria",                 // macOS US female (lower tone)
  "Microsoft Zira",           // Windows US female fallback
  "Samantha",                 // macOS US female fallback
],
    },
    responses: {
      moveQuips: [
        "How... unexpected.",
        "You dare.",
        "Intriguing. Though ultimately futile.",
        "You play adequately. For someone of your... station.",
        "A desperate move. How theatrical.",
        "I've witnessed bolder. From much lesser opponents.",
      ],
      hintPiece: [
        "I suppose I can grace you with guidance. That piece. You may thank me.",
        "Since you clearly require assistance... that one.",
        "I shall lower myself to point. That piece. Once.",
      ],
      hintMove: [
        "Move it there. You may express gratitude at your convenience.",
        "The destination is obvious — to me. There.",
        "That square. Do try not to waste my generosity.",
      ],
      drawAccept: [
        "I accept... this once. Do not mistake it for mercy.",
        "A draw. How unsatisfying. And yet.",
        "A draw. How... unsatisfying.",
        "Neither victory nor defeat. The worst of all outcomes.",
        "I shall pretend this never happened."
      ],
      drawRefuse: [
        "A draw? How utterly pedestrian.",
        "I don't share. Trophies, victories, or draws.",
        "You cannot be serious. I am winning.",
        "The audacity. The absolute audacity.",
      ],
      win: [
        "As it should be.",
        "Predictable. But satisfying.",
        "Did you truly expect otherwise?",
        "I would say I'm surprised, but that would be a lie.",
        "Exquisite.",
      ],
      lose: [
        "The board conspired against me.",
        "This is clearly the lighting.",
        "Your luck was exceptional today. Suspiciously so.",
        "I let you have that. For dramatic effect.",
        "A temporary setback. Nothing more.",
      ],
      check: [
        "Your king trembles. As it should.",
        "Check. Do you feel that? That's inevitability.",
        "The walls close in, darling.",
      ],
    },
  },

  {
    id: "biscuit",
    name: "Biscuit",
    species: "Golden Retriever",
    emoji: "🐶",
    accentColor: "#d97706",
    images: {
      idle: "/characters/biscuit/idle.png",
      thinking: "/characters/biscuit/thinking.png",
      talking: "/characters/biscuit/talking.png",
      win: "/characters/biscuit/win.png",
      lose: "/characters/biscuit/lose.png",
      draw: "/characters/biscuit/draw.png",
    },
    voice: {
      pitch: 1.5,
      rate: 1.4,
      volume: 1.0,
      preferredVoices: [
  "Microsoft Zira",           // Windows US female
  "Samantha",                 // macOS / iOS US female (default)
  "Google US English",        // Chrome US female
  "Tessa",                    // macOS South African female (bright)
  "Karen",                    // macOS Australian female
  "Moira",                    // macOS Irish female
  "Victoria",                 // macOS US female
  "Google UK English Female", // Chrome fallback (still female)
  "Serena",                   // macOS UK female fallback
],
    },
    responses: {
      moveQuips: [
        "Oh! Good move! Wait is that good? I think that's good!",
        "Yes yes yes! This is so exciting!",
        "Ooh! Smart! You're so smart!",
        "This game is SO good!!!",
        "I love chess! This is the best game!!",
        "Whoa!! Did you see that?! I did a thing!!",
      ],
      hintPiece: [
        "Ooh ooh! I know! That one! That piece right there! Move that one!!",
        "Pick that one! Trust me! I watch a lot of chess! On TV!",
        "That piece!! Move it!! I'm pretty sure!!",
      ],
      hintMove: [
        "Put it there! Right there! Go go go!!",
        "That square! Yes! I'm mostly sure! Do it!!",
        "THERE! Move it there! I saw this on TV once!!",
      ],
      drawAccept: [
        "Oh! A draw! That's like both of us win?! I LOVE that!!",
        "Draw! We both get a trophy?! BEST DAY EVER!!!",
        "DRAW!! We BOTH win?! THIS IS THE BEST THING EVER!!",
        "A DRAW!! Oh my goodness!! I'm so happy!! Are you happy?! I'm happy!!",
        "TIED!! We're TIED!! I love draws!! I love chess!!",
      ],
      drawRefuse: [
        "Wait no I want to keep playing!! Can we keep playing?! Please?!",
        "No draw!! More chess!! I'm having SO much fun!!",
        "We can't stop now!! This is the best part!!",
      ],
      win: [
        "WE WIN! Wait I won?! Did I win?! THIS IS THE BEST DAY!!",
        "GOOD BOY! Wait I'm the bot... GOOD GAME!!! You played so good!!",
        "I WON?! I WON!! Okay wait I need to calm down. I WON!!",
      ],
      lose: [
        "You're so good!! I tried my best!! Good game good game!!",
        "Wanna play again?? I'll do better!! Probably!!",
        "You won!! That's amazing!! You're amazing!! Can we play again?!",
      ],
      check: [
        "CHECK!! Did I do that?! I think I did that!! WOAH!!",
        "Ooh! Your king is in trouble! Is that bad for you?! CHECK!!",
        "CHECK! I learned that word!! It means good for me!!",
      ],
    },
  },
];

export function getPersonality(id: PersonalityId): Personality {
  return PERSONALITIES.find((p) => p.id === id) ?? PERSONALITIES[0];
}

export function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

// ELO → Stockfish config
export const ELO_VALUES: EloValue[] = [
  300, 400, 500, 600, 700, 800, 900, 1000, 1100, 1200, 1300,
  1500, 1600, 1700, 1800, 1900,
  2000, 2100, 2200, 2300, 2400, 2500,
  2600, 2700, 2800, 2900, 3000,
];
export type EloValue =
  | 300 | 400 | 500 | 600 | 700 | 800 | 900 | 1000 | 1100 | 1200 | 1300
  | 1500 | 1600 | 1700 | 1800 | 1900
  | 2000 | 2100 | 2200 | 2300 | 2400 | 2500
  | 2600 | 2700 | 2800 | 2900 | 3000;

export interface EloConfig {
  label: string;
  // Engine UCI params
  skillLevel?: number;
  depth?: number;
  uciElo?: number;
  movetime?: number;
  delay?: number;
  requestedDepth?: number;
  // Human error model
  multiPv?: number;      // lines to request — needs > 1 for errorRate to work
  blunderRate?: number;  // 0–1: chance of a completely random legal move
  errorRate?: number;    // 0–1: chance of picking a non-best MultiPV line
  cpTolerance?: number;  // centipawns: max drop from best for mistake candidates
}

export const ELO_CONFIG: Record<EloValue, EloConfig> = {
  300: { label: "Beginner", depth: 1, skillLevel: 0, multiPv: 3, blunderRate: 0.22, errorRate: 0.55, cpTolerance: 300, delay: 500 },
  400: { label: "Beginner", depth: 1, skillLevel: 1, multiPv: 3, blunderRate: 0.18, errorRate: 0.50, cpTolerance: 275, delay: 500 },
  500: { label: "Beginner", depth: 1, skillLevel: 2, multiPv: 3, blunderRate: 0.14, errorRate: 0.45, cpTolerance: 250, delay: 600 },
  600: { label: "Casual", depth: 2, skillLevel: 3, multiPv: 3, blunderRate: 0.11, errorRate: 0.38, cpTolerance: 200, delay: 700 },
  700: { label: "Casual", depth: 2, skillLevel: 4, multiPv: 3, blunderRate: 0.09, errorRate: 0.32, cpTolerance: 175, delay: 800 },
  800: { label: "Casual", depth: 3, skillLevel: 5, multiPv: 3, blunderRate: 0.07, errorRate: 0.26, cpTolerance: 150, delay: 900 },
  900: { label: "Intermediate", depth: 3, skillLevel: 6, multiPv: 3, blunderRate: 0.05, errorRate: 0.20, cpTolerance: 120, delay: 1000 },
  1000: { label: "Intermediate", depth: 4, skillLevel: 8, multiPv: 3, blunderRate: 0.03, errorRate: 0.15, cpTolerance: 90, delay: 1000 },
  1100: { label: "Intermediate", depth: 5, skillLevel: 10, multiPv: 3, blunderRate: 0.02, errorRate: 0.10, cpTolerance: 60, delay: 1200 },
  1200: { label: "Club", depth: 6, skillLevel: 12, multiPv: 3, blunderRate: 0.01, errorRate: 0.07, cpTolerance: 35, delay: 1500 },
  1300: { label: "Club", depth: 7, skillLevel: 14, multiPv: 2, blunderRate: 0.00, errorRate: 0.04, cpTolerance: 20, delay: 1500 },
  // 1500+ uses UCI_Elo — full strength engine, no error injection
  1500: { label: "Club Player", uciElo: 1500, movetime: 1000, delay: 1500 },
  1600: { label: "Club Player", uciElo: 1600, movetime: 1200, delay: 1500 },
  1700: { label: "Club Player", uciElo: 1700, movetime: 1400, delay: 1500 },
  1800: { label: "Advanced", uciElo: 1800, movetime: 1600, delay: 1500 },
  1900: { label: "Advanced", uciElo: 1900, movetime: 1800, delay: 1500 },
  2000: { label: "Expert", uciElo: 2000, movetime: 2000, delay: 2000 },
  2100: { label: "Expert", uciElo: 2100, movetime: 2200, delay: 2000 },
  2200: { label: "Expert", uciElo: 2200, movetime: 2500, delay: 2000 },
  2300: { label: "Candidate Master", uciElo: 2300, movetime: 2800, delay: 2000 },
  2400: { label: "Candidate Master", uciElo: 2400, movetime: 3200, delay: 2000 },
  2500: { label: "Master", uciElo: 2500, movetime: 3600, delay: 2000 },
  2600: { label: "Master", uciElo: 2600, movetime: 4200, delay: 2000 },
  2700: { label: "Grandmaster", uciElo: 2700, movetime: 5000, delay: 2000 },
  2800: { label: "Grandmaster", uciElo: 2800, movetime: 6000, delay: 2000 },
  2900: { label: "Super GM", uciElo: 2900, movetime: 7000, delay: 1500 },
  3000: { label: "Stockfish", uciElo: 3000, movetime: 9000, delay: 1000 },
};

export function getEloLabel(elo: EloValue): string {
  return ELO_CONFIG[elo].label;
}