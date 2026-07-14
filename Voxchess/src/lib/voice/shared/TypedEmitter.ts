// src/lib/voice/shared/TypedEmitter.ts
//
// Minimal internal typed emitter (v3 §5.2: "no external event-bus
// library; a minimal internal implementation is sufficient"). Originally
// kept private inside VoiceSession.ts (Phase 4) since only one module
// needed it. Now that confirmation/ConfirmationManager.ts (Phase 5) needs
// the identical shape, the duplication became real rather than premature
// — this is the point where extraction is justified, not before.
//
// Lives in shared/ (a new leaf-level folder, not inside any layered
// subfolder) rather than controller/ specifically, because
// ConfirmationManager (confirmation/) must not depend on controller/ per
// v3 §5.0's dependency direction (confirmation sits BELOW controller in
// the stack). A leaf utility both layers can import without violating
// that direction is the only placement that works.

export class TypedEmitter<Events extends Record<string, unknown>> {
  private listeners: { [K in keyof Events]?: Set<(payload: Events[K]) => void> } = {};

  on<K extends keyof Events>(event: K, cb: (payload: Events[K]) => void): () => void {
    (this.listeners[event] ??= new Set()).add(cb);
    return () => {
      this.listeners[event]?.delete(cb);
    };
  }

  emit<K extends keyof Events>(event: K, payload: Events[K]): void {
    this.listeners[event]?.forEach((cb) => cb(payload));
  }

  /** Wipes every listener for every event — dispose()'s "clear all subscriptions" guarantee. */
  clear(): void {
    this.listeners = {};
  }
}
