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
import { Checkbox } from "@/components/ui/checkbox";
import { Logo } from "@/components/layout/Logo";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/auth/signup")({
  head: () => ({ meta: [{ title: "Sign up — VoxChess" }, { name: "description", content: "Create your VoxChess account." }] }),
  component: SignupPage,
});

const schema = z.object({
  displayName: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(6),
  terms: z.boolean().refine((v) => v, "Required"),
});
type Form = z.infer<typeof schema>;

function SignupPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const { register, handleSubmit, setValue, watch, formState: { errors } } = useForm<Form>({ resolver: zodResolver(schema), defaultValues: { terms: false } });
  const terms = watch("terms");

  async function onSubmit(values: Form) {
    setLoading(true);
    const redirectUrl = `${window.location.origin}/dashboard`;
    const { error } = await supabase.auth.signUp({
      email: values.email,
      password: values.password,
      options: { emailRedirectTo: redirectUrl, data: { display_name: values.displayName } },
    });
    setLoading(false);
    if (error) toast.error(error.message);
    else { toast.success("Account created — check your email to confirm."); navigate({ to: "/auth/login" }); }
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
        <h1 className="mt-6 text-xl font-semibold text-center">Create account</h1>
        <form onSubmit={handleSubmit(onSubmit)} className="mt-6 space-y-3">
          <div>
            <Label htmlFor="displayName">Display name</Label>
            <Input id="displayName" {...register("displayName")} />
            {errors.displayName && <p className="text-xs text-destructive mt-1">{errors.displayName.message}</p>}
          </div>
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
          <div className="flex items-center gap-2 pt-1">
            <Checkbox id="terms" checked={terms} onCheckedChange={(c) => setValue("terms", Boolean(c), { shouldValidate: true })} />
            <Label htmlFor="terms" className="text-xs text-muted-foreground">I agree to the terms.</Label>
          </div>
          {errors.terms && <p className="text-xs text-destructive">{errors.terms.message}</p>}
          <Button type="submit" disabled={loading} className="w-full bg-[var(--accent-blue)] hover:opacity-90 text-white">
            {loading ? "Creating account…" : "Create account"}
          </Button>
        </form>
        <div className="my-4 flex items-center gap-2 text-xs text-muted-foreground">
          <div className="h-px flex-1 bg-border" /> or continue with <div className="h-px flex-1 bg-border" />
        </div>
        <Button variant="outline" className="w-full" onClick={google}>Continue with Google</Button>
        <p className="mt-6 text-center text-sm text-muted-foreground">
          Already have an account?{" "}
          <Link to="/auth/login" className="text-[var(--accent-blue)] font-medium">Log in</Link>
        </p>
      </Card>
    </div>
  );
}