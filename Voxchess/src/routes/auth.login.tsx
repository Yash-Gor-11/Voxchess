import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Logo } from "@/components/layout/Logo";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/auth/login")({
  head: () => ({ meta: [{ title: "Log in — VoxChess" }, { name: "description", content: "Log in to VoxChess." }] }),
  component: LoginPage,
});

const schema = z.object({ email: z.string().email(), password: z.string().min(6) });
type Form = z.infer<typeof schema>;

function LoginPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const { register, handleSubmit, formState: { errors } } = useForm<Form>({ resolver: zodResolver(schema) });

  async function onSubmit(values: Form) {
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword(values);
    setLoading(false);
    if (error) toast.error(error.message);
    else { toast.success("Welcome back"); navigate({ to: "/dashboard" }); }
  }

  async function google() {
    const redirectUrl = `${window.location.origin}/dashboard`;
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: redirectUrl,
        queryParams: {
          prompt: 'select_account'
        }
      }
    });
    if (error) toast.error(error.message);
  }

  return (
    <div className="min-h-screen grid place-items-center bg-background bg-gradient-hero px-4">
      <Card className="w-full max-w-[420px] p-8 bg-card/70 backdrop-blur border-border/50">
        <div className="flex justify-center"><Logo /></div>
        <h1 className="mt-6 text-xl font-semibold text-center">Welcome back</h1>
        <form onSubmit={handleSubmit(onSubmit)} className="mt-6 space-y-3">
          <div>
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" {...register("email")} />
            {errors.email && <p className="text-xs text-destructive mt-1">{errors.email.message}</p>}
          </div>
          <div>
            <Label htmlFor="password">Password</Label>
            <Input id="password" type="password" {...register("password")} />
            {errors.password && <p className="text-xs text-destructive mt-1">{errors.password.message}</p>}
          </div>
          <Button type="submit" disabled={loading} className="w-full bg-[var(--accent-blue)] hover:opacity-90 text-white">
            {loading ? "Signing in…" : "Sign in"}
          </Button>
        </form>
        <div className="my-4 flex items-center gap-2 text-xs text-muted-foreground">
          <div className="h-px flex-1 bg-border" /> or continue with <div className="h-px flex-1 bg-border" />
        </div>
        <Button variant="outline" className="w-full" onClick={google}>Continue with Google</Button>
        <p className="mt-6 text-center text-sm text-muted-foreground">
          New to VoxChess?{" "}
          <Link to="/auth/signup" className="text-[var(--accent-blue)] font-medium">Create account</Link>
        </p>
      </Card>
    </div>
  );
}