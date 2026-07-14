import { createFileRoute, Outlet, redirect, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { isSpeechSupported } from "@/lib/voice/recognition/BrowserRecognizer";
import { applyVoiceSettings } from "@/hooks/useVoiceEngine";
import { isConfirmationTimeoutTier, isRecognitionStyle } from "@/lib/voiceSettingsMapping";
import { AppHeader } from "@/components/layout/AppHeader";
import { AppSidebar } from "@/components/layout/AppSidebar";
import { VoiceStatusBar } from "@/components/layout/VoiceStatusBar";
import { Banner } from "@/components/layout/Banner";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useSettingsStore } from "@/stores/settingsStore";

export const Route = createFileRoute("/_app")({
  beforeLoad: async () => {
    if (typeof window === "undefined") return;
    const { data } = await supabase.auth.getSession();
    if (!data.session) throw redirect({ to: "/auth/login" });
  },
  component: AppLayout,
});

function AppLayout() {
  const { user, loading } = useAuth();
  const supported = typeof window === "undefined" ? true : isSpeechSupported();
  const navigate = useNavigate();
  const { setBoardTheme, setVoiceConfirmationTimeout, setVoiceRecognitionStyle } =
    useSettingsStore();

  // Mobile nav sheet state — lifted here so header hamburger and sidebar
  // sheet are in sync without a store or prop-drilling through many layers.
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  // Handle session expiry and cross-tab sign-out.
  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_OUT" || !session) {
        navigate({ to: "/auth/login" });
      }
    });
    return () => subscription.unsubscribe();
  }, [navigate]);

  // Hydrate settings store from Supabase on every page load so board
  // preferences apply immediately everywhere, not only after visiting Settings.
  useEffect(() => {
    if (!user) return;
    supabase
      .from("users")
      .select("preferences")
      .eq("id", user.id)
      .single()
      .then(({ data }) => {
        const prefs = (data?.preferences ?? {}) as Record<string, unknown>;

        if (typeof prefs.boardThemeIndex === "number") setBoardTheme(prefs.boardThemeIndex);

        // Voice settings: validate against the known tier/style sets
        // rather than trusting the stored value blindly (preferences is
        // an unstructured JSON blob -- a stale or hand-edited value
        // shouldn't be able to hand configure() something invalid).
        const timeoutTier = isConfirmationTimeoutTier(prefs.voiceConfirmationTimeout)
          ? prefs.voiceConfirmationTimeout
          : "standard";
        const recognitionStyle = isRecognitionStyle(prefs.voiceRecognitionStyle)
          ? prefs.voiceRecognitionStyle
          : "forgiving";
        setVoiceConfirmationTimeout(timeoutTier);
        setVoiceRecognitionStyle(recognitionStyle);

        // The piece that actually matters: apply it to the shared engine
        // NOW, on app load, not just when the user happens to visit
        // Settings. VoiceEngine.createSession() reads config via a live
        // getter, so this takes effect for any session already mounted
        // (Play/Analysis) without needing to recreate it, and for every
        // session created afterward.
        applyVoiceSettings(timeoutTier, recognitionStyle);
      });
  }, [user, setBoardTheme, setVoiceConfirmationTimeout, setVoiceRecognitionStyle]);

  if (loading)
    return (
      <div className="min-h-screen grid place-items-center text-sm text-muted-foreground">
        Loading…
      </div>
    );

  return (
    <div className="h-screen flex bg-background">
      <AppSidebar
        email={user?.email ?? undefined}
        mobileNavOpen={mobileNavOpen}
        setMobileNavOpen={setMobileNavOpen}
      />
      <div className="flex-1 flex flex-col min-w-0 min-h-0 overflow-hidden">
        <AppHeader email={user?.email ?? undefined} onMenuClick={() => setMobileNavOpen(true)} />
        <VoiceStatusBar />
        {!supported && (
          <Banner>
            Voice input requires Chrome or Edge. You can still play using drag and drop.
          </Banner>
        )}
        <main className="flex-1 overflow-hidden min-h-0">
          <Outlet />
        </main>
      </div>
    </div>
  );
}