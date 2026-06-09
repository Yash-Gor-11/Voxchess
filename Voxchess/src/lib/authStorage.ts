export function getCurrentUserId(): string | null {
  try {
    const key = Object.keys(localStorage).find(
      (k) => k.startsWith("sb-") && k.endsWith("-auth-token"),
    );
    if (!key) return null;
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw).user?.id ?? null;
  } catch {
    return null;
  }
}

export function getPlayStorageKey(): string | null {
  const userId = getCurrentUserId();
  return userId ? `voxchess_game:${userId}` : null;
}