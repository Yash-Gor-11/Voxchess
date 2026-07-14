// src/lib/voice/config/ConfigPersistence.ts
//
// Defines the CONTRACT a real storage mechanism (localStorage, Supabase,
// IndexedDB, whatever VoxChess's settings system uses) implements — no
// concrete implementation ships here. That's a deliberate Phase 9A scope
// boundary: the engine-facing configuration system doesn't need to know
// or care what actually stores the bytes, only that something can load
// and save a string. Wiring an actual adapter is integration-sprint work.

import type { VoiceConfig } from "../types";
import { deserializeVoiceConfig, serializeVoiceConfig, type DeserializeResult } from "./serialization";

export interface ConfigPersistenceAdapter {
  /** Returns the raw persisted string, or null if nothing has been saved yet. */
  load(): Promise<string | null>;
  save(serialized: string): Promise<void>;
}

/**
 * Combines a ConfigPersistenceAdapter with deserialization, so callers
 * don't have to wire load() + deserializeVoiceConfig() together
 * themselves every time.
 */
export async function loadVoiceConfig(adapter: ConfigPersistenceAdapter): Promise<DeserializeResult> {
  const raw = await adapter.load();
  return deserializeVoiceConfig(raw);
}

export async function saveVoiceConfig(adapter: ConfigPersistenceAdapter, config: VoiceConfig): Promise<void> {
  await adapter.save(serializeVoiceConfig(config));
}
