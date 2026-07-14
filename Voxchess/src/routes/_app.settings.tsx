import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Chessboard } from "react-chessboard";
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import { useSettingsStore, BOARD_THEMES } from "@/stores/settingsStore";
import { applyVoiceSettings } from "@/hooks/useVoiceEngine";
import {
  CONFIRMATION_TIMEOUT_OPTIONS,
  RECOGNITION_STYLE_OPTIONS,
  VOICE_LANGUAGE_OPTIONS,
  CURRENT_VOICE_LANGUAGE,
  type ConfirmationTimeoutTier,
  type RecognitionStyle,
} from "@/lib/voiceSettingsMapping";

export const Route = createFileRoute("/_app/settings")({
  head: () => ({ meta: [{ title: "Settings — VoxChess" }] }),
  component: SettingsPage,
});

const PREVIEW_FEN = "r1bqkb1r/pppp1ppp/2n2n2/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R";

function KeyBadge({ keyName }: { keyName: string }) {
  return (
    <Badge variant="outline" className="font-mono text-xs px-2 py-0.5">
      {keyName}
    </Badge>
  );
}

function SettingsPage() {
  const [displayName, setDisplayName] = useState("");
  const [savingName, setSavingName] = useState(false);
  const [navKey, setNavKey] = useState("N");
  const [chessKey, setChessKey] = useState("Space");
  const [deletingAccount, setDeletingAccount] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Board + voice prefs live in the store so other pages react immediately.
  // One subscription rather than two separate calls.
  const {
    boardThemeIndex,
    setBoardTheme,
    voiceConfirmationTimeout,
    voiceRecognitionStyle,
    setVoiceConfirmationTimeout,
    setVoiceRecognitionStyle,
  } = useSettingsStore();

  useEffect(() => {
    async function load() {
      try {
        const {
          data: { user },
          error: authError,
        } = await supabase.auth.getUser();
        if (authError || !user) return;
        const { data, error } = await supabase
          .from("users")
          .select("display_name, preferences")
          .eq("id", user.id)
          .single();
        if (error) {
          toast.error("Could not load settings");
          return;
        }
        if (data) {
          setDisplayName(data.display_name ?? "");
          const prefs = data.preferences as {
            boardThemeIndex?: number;
            navKey?: string;
            chessKey?: string;
          } | null;
          // Write into store so board picks them up immediately. This key
          // was previously "boardTheme" here while _app.tsx's own
          // hydration effect (which is what actually matters -- it's the
          // one that runs on every page load, not just when Settings is
          // visited) reads "boardThemeIndex". That mismatch meant a saved
          // theme never actually survived a reload anywhere -- Play and
          // Analysis both read the same store, so both were equally
          // affected. Aligned to "boardThemeIndex" to match _app.tsx.
          if (prefs?.boardThemeIndex !== undefined) setBoardTheme(prefs.boardThemeIndex);
          if (prefs?.navKey) setNavKey(prefs.navKey);
          if (prefs?.chessKey) setChessKey(prefs.chessKey);
        }
      } catch {
        toast.error("Could not load settings");
      }
    }
    load();
  }, [setBoardTheme]);

  async function savePreferences(patch: Record<string, unknown>) {
    try {
      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser();
      if (authError || !user) return;
      const { data, error: fetchError } = await supabase
        .from("users")
        .select("preferences")
        .eq("id", user.id)
        .single();
      if (fetchError) throw fetchError;
      const current = (data?.preferences as Record<string, unknown>) ?? {};
      const { error: updateError } = await supabase
        .from("users")
        .update({ preferences: { ...current, ...patch } as Json })
        .eq("id", user.id);
      if (updateError) throw updateError;
    } catch {
      toast.error("Could not save preference");
    }
  }

  async function handleSaveName() {
    if (!displayName.trim()) return;
    setSavingName(true);
    try {
      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser();
      if (authError || !user) throw new Error("Not authenticated");
      const { error } = await supabase
        .from("users")
        .update({ display_name: displayName.trim() })
        .eq("id", user.id);
      if (error) throw error;
      toast.success("Display name updated");
    } catch {
      toast.error("Could not update name");
    } finally {
      setSavingName(false);
    }
  }

  async function applyRecognitionStyle(style: RecognitionStyle) {
    setVoiceRecognitionStyle(style);
    applyVoiceSettings(voiceConfirmationTimeout, style);
    await savePreferences({ voiceRecognitionStyle: style });
  }

  async function applyConfirmationTimeout(tier: ConfirmationTimeoutTier) {
    setVoiceConfirmationTimeout(tier);
    applyVoiceSettings(tier, voiceRecognitionStyle);
    await savePreferences({ voiceConfirmationTimeout: tier });
  }

  async function handleDeleteAccount() {
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    setDeletingAccount(true);
    toast.error("Account deletion requires backend setup — coming soon");
    setDeletingAccount(false);
    setConfirmDelete(false);
  }

  const theme = BOARD_THEMES[boardThemeIndex];

  return (
    <div className="h-full overflow-y-auto ">
    <div className="p-6 max-w-2xl mx-auto space-y-6">
      <h2 className="text-lg font-semibold">Settings</h2>

      {/* Profile */}
      <Card className="p-5 space-y-4">
        <div className="text-sm font-medium">Profile</div>
        <Separator />
        <div className="space-y-3">
          <div>
            <Label htmlFor="displayName">Display name</Label>
            <div className="flex gap-2 mt-1">
              <Input
                id="displayName"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Your name"
              />
              <Button onClick={handleSaveName} disabled={savingName}>
                {savingName ? "Saving…" : "Save"}
              </Button>
            </div>
          </div>
        </div>
      </Card>

      {/* Voice input */}
      <Card className="p-5 space-y-4">
        <div className="text-sm font-medium">Voice shortcuts</div>
        <Separator />
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm">Navigation key</div>
              <div className="text-xs text-muted-foreground">Activates the Nav voice button</div>
            </div>
            <KeyBadge keyName={navKey} />
          </div>
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm">Chess move key</div>
              <div className="text-xs text-muted-foreground">Activates the Chess voice button</div>
            </div>
            <KeyBadge keyName={chessKey} />
          </div>
          <p className="text-xs text-muted-foreground">Custom key bindings coming soon.</p>
        </div>
      </Card>

      {/* Voice configuration */}
      <Card className="p-5 space-y-5">
        <div className="text-sm font-medium">Voice</div>
        <Separator />

        {/* Recognition */}
        <div className="space-y-2">
          <Label>Recognition style</Label>
          <div className="space-y-2">
            {RECOGNITION_STYLE_OPTIONS.map((opt) => (
              <button
                key={opt.style}
                onClick={() => applyRecognitionStyle(opt.style)}
                className={`w-full text-left px-3 py-2 rounded-md border transition-all ${
                  voiceRecognitionStyle === opt.style
                    ? "border-[var(--accent-blue)] bg-[var(--accent-blue)]/10"
                    : "border-border hover:border-foreground/40"
                }`}
              >
                <div
                  className={`text-sm font-medium ${
                    voiceRecognitionStyle === opt.style ? "text-[var(--accent-blue)]" : ""
                  }`}
                >
                  {opt.label}
                </div>
                <div className="text-xs text-muted-foreground mt-0.5">{opt.description}</div>
              </button>
            ))}
          </div>
        </div>

        {/* Confirmation */}
        <div className="space-y-2">
          <Label>Confirmation timeout</Label>
          <div className="text-xs text-muted-foreground -mt-1">
            How long an ambiguous move or promotion waits for a spoken reply before picking the
            top choice automatically. Dangerous commands (resign, offer draw) never auto-confirm —
            silence always cancels those.
          </div>
          <div className="flex flex-wrap gap-2 mt-2">
            {CONFIRMATION_TIMEOUT_OPTIONS.map((opt) => (
              <button
                key={opt.tier}
                onClick={() => applyConfirmationTimeout(opt.tier)}
                className={`px-3 py-1.5 rounded-md border text-sm transition-all ${
                  voiceConfirmationTimeout === opt.tier
                    ? "border-[var(--accent-blue)] bg-[var(--accent-blue)]/10 text-[var(--accent-blue)]"
                    : "border-border text-muted-foreground hover:border-foreground"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* Language */}
        <div className="space-y-2">
          <Label>Voice language</Label>
          <div className="flex flex-wrap gap-2 mt-2">
            {VOICE_LANGUAGE_OPTIONS.map((opt) => (
              <button
                key={opt.code}
                disabled={VOICE_LANGUAGE_OPTIONS.length === 1}
                className={`px-3 py-1.5 rounded-md border text-sm transition-all ${
                  opt.code === CURRENT_VOICE_LANGUAGE
                    ? "border-[var(--accent-blue)] bg-[var(--accent-blue)]/10 text-[var(--accent-blue)]"
                    : "border-border text-muted-foreground"
                } ${VOICE_LANGUAGE_OPTIONS.length === 1 ? "cursor-default opacity-80" : "hover:border-foreground"}`}
              >
                {opt.label}
              </button>
            ))}
          </div>
          {VOICE_LANGUAGE_OPTIONS.length === 1 && (
            <p className="text-xs text-muted-foreground">More languages coming soon.</p>
          )}
        </div>
      </Card>

      {/* Board */}
      <Card className="p-5 space-y-4">
        <div className="text-sm font-medium">Board</div>
        <Separator />
        <div className="space-y-4">
          <div>
            <Label>Theme</Label>
            <div className="flex flex-wrap gap-2 mt-2">
              {BOARD_THEMES.map((t, i) => (
                <button
                  key={t.name}
                  onClick={async () => {
                    setBoardTheme(i);
                    await savePreferences({ boardThemeIndex: i });
                    toast.success(`Theme: ${t.name}`);
                  }}
                  className={`px-3 py-1.5 rounded-md border text-sm transition-all ${
                    boardThemeIndex === i
                      ? "border-[var(--accent-blue)] bg-[var(--accent-blue)]/10 text-[var(--accent-blue)]"
                      : "border-border text-muted-foreground hover:border-foreground"
                  }`}
                >
                  {t.name}
                </button>
              ))}
            </div>
          </div>

          {/* Board size removed -- it was never actually wired to
              anything: Play and Analysis each size their own board via
              useResizableBoard's drag handle, completely independent of
              this store field. Adjusting it here did nothing anywhere. */}

          <div>
            <Label>Preview</Label>
            <div className="mt-2 flex justify-center">
              <div style={{ width: 280, height: 280 }}>
                <Chessboard
                  options={{
                    position: PREVIEW_FEN,
                    boardStyle: { borderRadius: 6, overflow: "hidden" },
                    darkSquareStyle: { backgroundColor: theme.dark },
                    lightSquareStyle: { backgroundColor: theme.light },
                  }}
                />
              </div>
            </div>
          </div>
        </div>
      </Card>

      {/* Account */}
      <Card className="p-5 space-y-4">
        <div className="text-sm font-medium">Account</div>
        <Separator />
        <div>
          <div className="text-sm mb-1">Change password</div>
          <div className="text-xs text-muted-foreground mb-2">
            A reset link will be sent to your email.
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={async () => {
              try {
                const {
                  data: { user },
                  error: authError,
                } = await supabase.auth.getUser();
                if (authError || !user?.email) return;
                const { error } = await supabase.auth.resetPasswordForEmail(user.email);
                if (error) throw error;
                toast.success("Password reset email sent");
              } catch {
                toast.error("Could not send reset email");
              }
            }}
          >
            Send reset email
          </Button>
        </div>
      </Card>

      {/* Danger zone */}
      <Card className="p-5 space-y-4 border-destructive/40">
        <div className="text-sm font-medium text-destructive">Danger zone</div>
        <Separator />
        <div>
          <div className="text-sm mb-1">Delete account</div>
          <div className="text-xs text-muted-foreground mb-3">
            This permanently deletes your account and all saved games. Cannot be undone.
          </div>
          <Button
            variant="destructive"
            size="sm"
            disabled={deletingAccount}
            onClick={handleDeleteAccount}
          >
            {confirmDelete ? "Are you sure? Click again to confirm" : "Delete account"}
          </Button>
          {confirmDelete && (
            <Button
              variant="ghost"
              size="sm"
              className="ml-2"
              onClick={() => setConfirmDelete(false)}
            >
              Cancel
            </Button>
          )}
        </div>
      </Card>
    </div>
     </div>
  );
}