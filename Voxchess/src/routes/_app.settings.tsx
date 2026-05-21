import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import { toast } from "sonner";
import { Chessboard } from "react-chessboard";
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import { useSettingsStore, BOARD_THEMES } from "@/stores/settingsStore";

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
  const [uploadingPhoto, setUploadingPhoto] = useState(false);

  // Board prefs live in the store so other pages react immediately
  const { boardThemeIndex, boardSize, setBoardTheme, setBoardSize } = useSettingsStore();

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
            boardTheme?: number;
            boardSize?: number;
            navKey?: string;
            chessKey?: string;
          } | null;
          // Write into store so board picks them up immediately
          if (prefs?.boardTheme !== undefined) setBoardTheme(prefs.boardTheme);
          if (prefs?.boardSize !== undefined) setBoardSize(prefs.boardSize);
          if (prefs?.navKey) setNavKey(prefs.navKey);
          if (prefs?.chessKey) setChessKey(prefs.chessKey);
        }
      } catch {
        toast.error("Could not load settings");
      }
    }
    load();
  }, [setBoardTheme, setBoardSize]);

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

  async function handlePhotoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingPhoto(true);
    toast.info("Profile photo upload coming soon");
    setUploadingPhoto(false);
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
    <div className="h-full overflow-y-auto">
    <div className="p-6 max-w-2xl space-y-6">
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
          <div>
            <Label>Profile picture</Label>
            <div className="mt-1 flex items-center gap-3">
              <div className="h-14 w-14 rounded-full bg-[var(--accent-blue)] flex items-center justify-center text-white text-lg font-semibold">
                {displayName.slice(0, 1).toUpperCase() || "?"}
              </div>
              <div>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={uploadingPhoto}
                  onClick={() => document.getElementById("photo-upload")?.click()}
                >
                  {uploadingPhoto ? "Uploading…" : "Upload photo"}
                </Button>
                <input
                  id="photo-upload"
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handlePhotoUpload}
                />
                <p className="text-xs text-muted-foreground mt-1">JPG, PNG or GIF · max 2MB</p>
              </div>
            </div>
          </div>
        </div>
      </Card>

      {/* Voice input */}
      <Card className="p-5 space-y-4">
        <div className="text-sm font-medium">Voice input</div>
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
                    await savePreferences({ boardTheme: i });
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

          <div>
            <Label>Board size — {boardSize}px</Label>
            <div className="mt-2">
              <Slider
                min={200}
                max={480}
                step={20}
                value={[boardSize]}
                onValueChange={async ([v]) => {
                  setBoardSize(v);
                  await savePreferences({ boardSize: v });
                }}
              />
            </div>
          </div>

          <div>
            <Label>Preview</Label>
            <div className="mt-2 flex justify-center">
              <div style={{ width: boardSize, height: boardSize }}>
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
