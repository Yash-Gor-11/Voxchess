import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { isSpeechSupported } from "@/lib/voice/speechRecognition";
import { AppHeader } from "@/components/layout/AppHeader";
import { AppSidebar } from "@/components/layout/AppSidebar";
import { VoiceStatusBar } from "@/components/layout/VoiceStatusBar";
import { Banner } from "@/components/layout/Banner";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";

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

  if (loading)
    return (
      <div className="min-h-screen grid place-items-center text-sm text-muted-foreground">
        Loading…
      </div>
    );

  return (
    <div className="min-h-screen flex bg-background">
      <AppSidebar email={user?.email ?? undefined} />
      <div className="flex-1 flex flex-col min-w-0">
        <AppHeader email={user?.email ?? undefined} />
        <VoiceStatusBar />
        {!supported && (
          <Banner>
            Voice input requires Chrome or Edge. You can still play using drag and drop.
          </Banner>
        )}
        <main className="flex-1 overflow-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
