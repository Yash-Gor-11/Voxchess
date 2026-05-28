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
      preferredVoices: ["Google UK English Male", "Daniel", "Arthur", "Microsoft George", "en-GB-male"],
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
      preferredVoices: ["Google UK English Male", "Daniel", "Arthur", "Microsoft George"],
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
      preferredVoices: ["Google US English", "Alex", "Tom", "Microsoft Guy", "en-US-male"],
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
      preferredVoices: ["Google UK English Female", "Serena", "Martha", "Microsoft Hazel", "en-GB-female"],
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
      preferredVoices: ["Google US English", "Samantha", "Zira", "Microsoft Zira", "en-US"],
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
export const ELO_VALUES = [300, 500, 700, 900, 1100, 1500, 1800, 2100, 2500, 3000] as const;
export type EloValue = (typeof ELO_VALUES)[number];

export interface EloConfig {
  label: string;
  uciElo?: number;
  movetime?: number;
  skillLevel?: number;
  depth?: number;
  delay?: number;
}

export const ELO_CONFIG: Record<EloValue, EloConfig> = {
  300:  { label: "Beginner",     skillLevel: 0,  depth: 1,  delay: 2000 },
  500:  { label: "Beginner",     skillLevel: 2,  depth: 3,  delay: 1500 },
  700:  { label: "Casual",       skillLevel: 4,  depth: 5,  delay: 1200 },
  900:  { label: "Casual",       skillLevel: 6,  depth: 7,  delay: 900  },
  1100: { label: "Intermediate", skillLevel: 8,  depth: 9,  delay: 700  },
  1500: { label: "Club",         uciElo: 1500,   movetime: 150  },
  1800: { label: "Advanced",     uciElo: 1800,   movetime: 300  },
  2100: { label: "Expert",       uciElo: 2100,   movetime: 600  },
  2500: { label: "Master",       uciElo: 2500,   movetime: 1200 },
  3000: { label: "Grandmaster",  uciElo: 3190,   movetime: 2000 },
};

export function getEloLabel(elo: EloValue): string {
  return ELO_CONFIG[elo].label;
}