# scripts/generate-voices.py
# Generates MP3 audio for every character response line using edge-tts.
# edge-tts uses Microsoft Edge's neural TTS service — completely free, no account needed.
#
# Requirements:
#   pip install edge-tts
#
# Run AFTER export-lines.ts has been run:
#   python scripts/generate-voices.py

import asyncio
import edge_tts
import json
import os

# Microsoft Neural voices assigned per character.
# rate/pitch are baked into the audio files so every device sounds identical.
CHARACTER_VOICES = {
    "frost":    {"voice": "en-GB-RyanNeural",        "rate": "-12%", "pitch": "-30Hz"},
    "sterling": {"voice": "en-US-ChristopherNeural", "rate": "-16%", "pitch": "-5Hz"},
    "finn":     {"voice": "en-US-GuyNeural",         "rate": "+18%", "pitch": "+8Hz"},
    "malachar": {"voice": "en-GB-SoniaNeural",       "rate": "-24%", "pitch": "-20Hz"},
    "biscuit":  {"voice": "en-US-JennyNeural",       "rate": "+40%", "pitch": "+25Hz"},
}

async def generate_line(text, voice, rate, pitch, out_path):
    communicate = edge_tts.Communicate(text, voice, rate=rate, pitch=pitch)
    await communicate.save(out_path)

async def main():
    lines_path = os.path.join("scripts", "lines.json")
    if not os.path.exists(lines_path):
        print("ERROR: scripts/lines.json not found.")
        print("Run this first:  npx tsx scripts/export-lines.ts")
        return

    with open(lines_path, encoding="utf-8") as f:
        lines = json.load(f)

    # Group by character
    by_character = {}
    for line in lines:
        cid = line["characterId"]
        by_character.setdefault(cid, []).append(line)

    generated = skipped = failed = 0

    for character_id, char_lines in by_character.items():
        config = CHARACTER_VOICES.get(character_id)
        if not config:
            print(f"WARNING: no voice config for {character_id}, skipping.")
            continue

        out_dir = os.path.join("public", "characters", character_id, "audio")
        os.makedirs(out_dir, exist_ok=True)

        print(f"\n[{character_id}]  {len(char_lines)} lines  —  {config['voice']}")

        for line in char_lines:
            out_path = os.path.join(out_dir, f"{line['hash']}.mp3")

            if os.path.exists(out_path):
                print(".", end="", flush=True)
                skipped += 1
                continue

            try:
                await generate_line(
                    line["text"],
                    config["voice"],
                    config["rate"],
                    config["pitch"],
                    out_path,
                )
                print("+", end="", flush=True)
                generated += 1
            except Exception as e:
                print(f"\n  FAILED [{line['hash']}]: {line['text'][:55]}")
                print(f"  {e}")
                failed += 1

            # Small delay — edge-tts is free but be a good citizen
            await asyncio.sleep(0.15)

        print()

    print(f"\nDone.   generated: {generated}   skipped: {skipped}   failed: {failed}")

asyncio.run(main())