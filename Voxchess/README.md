# VoxChess

A voice-first chess platform. Play against AI opponents with distinct personalities, analyse games, import PGNs and positions, and control everything hands-free with voice commands.

---

## Features

- **Play vs Bot** — 25 difficulty levels from 300 to 3000 ELO with human-like error injection at lower levels
- **5 AI Personalities** — each with unique voice, character art, and hundreds of hand-written response lines
- **Pre-generated Voice** — consistent character voices on every device via Microsoft Neural TTS (no API key required)
- **Voice Control** — speak chess moves and navigate the app hands-free (Chrome/Edge)
- **Game Analysis** — engine evaluation, MultiPV lines, eval bar, arrows, highlights, comments, and variations
- **Continue vs Bot** — jump from any analysis position or saved game directly into bot play
- **Import** — PGN paste/file, Lichess game/study URLs, FEN positions
- **Studies** — organise imported games into multi-chapter studies
- **Session Persistence** — games auto-save and resume correctly including character and difficulty settings

---

## Tech Stack

| Area | Technology |
|---|---|
| Framework | React 19, TanStack Start, TanStack Router |
| Build | Vite 7, TypeScript 5 |
| Styling | Tailwind CSS 4, shadcn/ui-style components |
| Icons | lucide-react |
| Chess rules | chess.js |
| Chess board | react-chessboard |
| Engine | Stockfish 18 WASM via @lichess-org/stockfish-web |
| Backend | Supabase (Auth + Postgres) |
| State | Zustand |
| Package manager | Bun |
| Deployment | Cloudflare Workers via Wrangler |

---

## Getting Started

### Prerequisites

- [Bun](https://bun.sh) — package manager and runtime
- [Python 3.8+](https://python.org) — for voice generation only
- A [Supabase](https://supabase.com) project with Auth and Postgres enabled

### Install

```bash
git clone https://github.com/Yash-Gor-11/Voxchess.git
cd Voxchess
bun install
```

### Environment Variables

Create a `.env.local` file in the project root:

```env
VITE_SUPABASE_URL=your_supabase_project_url
VITE_SUPABASE_PUBLISHABLE_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key
```

### Generate Character Voices

Voice audio files are not committed to the repository. They are generated locally from the response lines defined in `src/lib/chess/personalities.ts`.

**Install edge-tts:**

```bash
pip install edge-tts
```

**Generate all voices in one command:**

```bash
bun run generate:voices
```

This runs two steps automatically:

1. `scripts/export-lines.ts` — extracts every unique response line from all 5 characters and writes `scripts/lines.json`
2. `scripts/generate-voices.py` — generates MP3 files into `public/characters/{character}/audio/`

`+` means a new file was generated. `.` means the file already exists and was skipped. The script is safe to re-run at any time — it only generates files that are missing.

**Voices used:**

| Character | Voice | Style |
|---|---|---|
| General Frost | `en-GB-RyanNeural` | Deep, authoritative British male |
| Dr. Sterling | `en-US-ChristopherNeural` | Measured, intellectual American male |
| Captain Finn | `en-US-GuyNeural` | Casual, energetic American male |
| Lady Malachar | `en-GB-SoniaNeural` | Mysterious, deliberate British female |
| Biscuit | `en-US-JennyNeural` | Bright, excitable American female |

All voices use Microsoft Neural TTS via edge-tts — completely free, no account or API key required.

> **Note:** If you add new response lines to `personalities.ts`, re-run `bun run generate:voices`. The export step will pick up the new lines and the generation step will only create the missing files.

### Run

```bash
bun run dev
```

Open [http://localhost:8080](http://localhost:8080).

> **First build note:** Stockfish NNUE weight files (~110 MB total) are downloaded automatically during `bun run dev` or `bun run build` if they are not already present in `/public`. A network connection is required the first time.

---

## Scripts

```bash
bun run dev               # Start development server
bun run build             # Production build
bun run preview           # Preview production build locally
bun run lint              # ESLint
bun run format            # Prettier
bun run generate:voices   # Export response lines and generate MP3s
```

---

## Voice Commands

VoxChess has two voice modes activated by keyboard shortcuts.

| Key | Mode | Context |
|---|---|---|
| `N` | Navigation | Anywhere outside text inputs |
| `Space` | Chess moves / Analysis navigation | Play page, Analysis page |
| `←` / `→` | Step through moves | Play review, Analysis |

**Navigation phrases:**
dashboard, play, games, settings, profile, sign out, new game, tutorial, about

**Chess move phrases:**
"knight to f3", "bishop takes d5", "queen to h five", "castle", "queen side castle", "e4"

**Analysis navigation phrases:**
first, last, back, next, main line, go to move 12

> Voice requires Chrome or Edge. All other features work without voice.

---

## Project Structure

```
src/
  components/
    chess/          Chess-specific UI: overlays, eval bar, dialogs, promotion picker
    layout/         App shell, sidebar, header, nav, footer, theme provider
    ui/             46 local shadcn/ui-style primitive components
    voice/          Voice buttons and transcript display
  hooks/
    useChessGame.ts       chess.js wrapper — game state, move, undo, loadPgn, exportPgn
    useStockfish.ts       Stockfish lifecycle, evaluation, human error model
    useChessVoice.ts      Speech-to-chess-move hook
    useNavVoice.ts        Speech-to-navigation hook
    useAuth.ts            Supabase auth session hook
  lib/
    chess/
      personalities.ts    Opponent characters, response banks, ELO configs
      stockfish.ts        Stockfish WASM singleton wrapper
      analysisEngine.ts   Analysis tree, variations, comments, arrows, highlights
      pgnImport.ts        PGN splitting, parsing, tree construction
      pvUtils.ts          Engine PV UCI-to-SAN conversion
    supabase/
      games.ts            Save, load, update, delete games, studies, chapters
      annotations.ts      Save and load analysis tree annotations
    voice/
      hashText.ts         Deterministic djb2 hash for audio file lookup
      selectVoice.ts      Speech synthesis voice selector with English filter
      chessVoiceHandler.ts  Natural language to SAN parser
      navVoiceHandler.ts    Navigation phrase parser
      speechRecognition.ts  Web Speech API wrapper
  routes/             File-based TanStack routes (see Routing section)
  stores/
    voiceStore.ts     Global voice mode, status, transcript, callbacks
    settingsStore.ts  Board theme and size preferences
    gameStore.ts      Small generic chess FEN/history store
  integrations/
    supabase/
      types.ts        Generated database types (run supabase gen types to update)
      client.ts       Browser/SSR Supabase client

scripts/
  export-lines.ts     Extracts all response lines from personalities.ts → lines.json
  generate-voices.py  Generates MP3s via edge-tts from lines.json

public/
  characters/
    frost/            Character images (idle, thinking, talking, win, lose, draw)
    sterling/         + audio/ folder (generated, gitignored)
    finn/
    malachar/
    biscuit/
  sf_18.js            Stockfish 18 engine (copied from node_modules at build time)
  sf_18.wasm          Stockfish 18 WASM binary
  *.nnue              NNUE weight files (downloaded at build time if missing)

supabase/
  migrations/         SQL migration files
```

---

## Routing

| Route | Purpose |
|---|---|
| `/` | Marketing landing page |
| `/about` | Product mission and vision |
| `/tutorial` | Voice command guide |
| `/auth/login` | Email/password and Google login |
| `/auth/signup` | Account creation |
| `/dashboard` | Activity summary and recent games |
| `/play` | Play vs computer |
| `/play/pvp` | Multiplayer (stub) |
| `/games` | Library landing |
| `/games/my-games` | Played platform games |
| `/games/imported` | Imported PGNs and saved positions |
| `/games/studies` | Study list |
| `/games/studies/$studyId` | Study chapters |
| `/import` | PGN, FEN, and URL import |
| `/analysis/$gameId` | Analysis board and annotations |
| `/profile` | Profile and stats |
| `/settings` | Display name, board theme |

---

## Play Session Architecture

The play page supports three session modes derived from URL parameters:

| URL | Mode | Behaviour |
|---|---|---|
| `/play?gameId=abc` | `resume-game` | Skips setup screen, loads game immediately including character and difficulty |
| `/play?fen=...` | `continue-position` | Shows setup screen with a custom position note, starts from the given FEN |
| `/play` | `new-game` | Shows setup screen, restores saved session from localStorage if present |

URL parameters always take priority over localStorage. LocalStorage is used only for crash recovery in `new-game` mode.

---

## Stockfish Engine

The engine uses a module-level singleton. `StockfishFactory()` is called exactly once per page load regardless of how many times React mounts or unmounts the hook. This is required because Emscripten cannot safely run two instances from the same cached WASM module.

**Key design decisions:**
- NNUE files are loaded inside the singleton, not per component mount
- `destroy()` detaches callbacks only — it does not call `sf.uci("quit")`. Calling quit permanently kills the shared worker and makes it unrecoverable until a full page reload.
- Cross-origin isolation headers (`COOP: same-origin`, `COEP: require-corp`) are set in `src/server.ts` and are required for `SharedArrayBuffer` support

---

## Database Schema

| Table | Key fields | Purpose |
|---|---|---|
| `users` | id, display_name, rating, preferences | Auth and profile |
| `games` | id, pgn, start_fen, result, type, metadata, source_type, source_game_id, source_node_id | All game records |
| `studies` | id, user_id, name | Study collections |
| `annotations` | game_id, user_id, ply_index, note | Analysis trees stored as JSON |
| `rooms` | id, white_id, black_id, status | Multiplayer (not yet implemented) |

**Game types:**
- `platform` — games played on VoxChess
- `imported` — imported PGNs or saved FEN positions
- `study_chapter` — chapters belonging to a study

**Provenance fields on `games`:**
- `start_fen` — canonical starting position (`null` = standard chess start)
- `source_type` — `null`, `analysis`, or `imported_fen`
- `source_game_id` — foreign key to the analysis game this was continued from
- `source_node_id` — specific node in the analysis tree this was continued from

---

## Deployment

Configured for Cloudflare Workers via Wrangler:

```bash
bun run build
wrangler deploy
```

Set the required environment variables in the Cloudflare dashboard or `wrangler.jsonc`.

The `wrangler.jsonc` configuration:
- `name`: `tanstack-start-app`
- `compatibility_date`: `2025-09-24`
- `compatibility_flags`: `nodejs_compat`
- `main`: `src/server.ts`

---

## Development Notes

- The project uses Bun as the package manager. Do not use npm or yarn.
- Supabase generated types live in `src/integrations/supabase/types.ts`. After schema changes run `supabase gen types typescript --project-id <id> > src/integrations/supabase/types.ts` to regenerate.
- `scripts/export-lines.ts` imports from `../src/lib/voice/hashText`. The file on disk is `hashText.ts` (camelCase). On case-sensitive Linux/Mac environments the import must match exactly.
- No test script is currently defined. Run `bun run lint` before opening pull requests.
- The package name in `package.json` is still `tanstack_start_ts`. This does not affect functionality.

---

## Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feat/your-feature`
3. Run `bun run lint` before committing
4. Open a pull request with a clear description of the change

---

## License

MIT
