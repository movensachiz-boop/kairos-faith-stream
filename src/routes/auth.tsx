import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import { ensureGuestUser, GUEST_EMAIL, GUEST_PASSWORD } from "@/lib/guest.functions";
import logoAsset from "@/assets/kairos-logo.png.asset.json";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Sign in — KAIROS APP" },
      { name: "description", content: "Join KAIROS APP to watch, read, pray, connect and give." },
      { property: "og:title", content: "Sign in — KAIROS APP" },
      { property: "og:description", content: "Join the KAIROS community of churches, ministries and believers." },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: window.location.origin,
            data: { display_name: displayName || email.split("@")[0] },
          },
        });
        if (error) throw error;
        if (!data.session) {
          toast.success("Check your email to confirm your account.");
          return;
        }
        toast.success("Welcome to KAIROS.");
        navigate({ to: "/" });
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        toast.success("Welcome back.");
        navigate({ to: "/" });
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  async function google() {
    const result = await lovable.auth.signInWithOAuth("google", {
      redirect_uri: window.location.origin,
    });
    if (result.error) {
      toast.error("Google sign-in failed. Please try again.");
      return;
    }
    if (result.redirected) return;
    navigate({ to: "/" });
  }

  async function guest() {
    setBusy(true);
    try {
      await ensureGuestUser();
      const { error } = await supabase.auth.signInWithPassword({
        email: GUEST_EMAIL,
        password: GUEST_PASSWORD,
      });
      if (error) throw error;
      toast.success("Welcome, guest.");
      navigate({ to: "/" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Guest sign-in failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-10">
      <div className="glass-strong w-full max-w-md rounded-3xl p-7">
        <Link to="/" className="mb-6 flex items-center gap-2.5">
          <img src={logoAsset.url} alt="KAIROS logo" className="size-9 rounded-xl" />
          <span className="leading-none">
            <span className="block font-display text-[15px] font-bold tracking-tight">KAIROS APP</span>
            <span className="block text-[10px] text-muted-foreground">Connect. Grow. Share. Give.</span>
          </span>
        </Link>

        <h1 className="font-display text-2xl font-bold">
          {mode === "signin" ? "Welcome back" : "Create your account"}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Live services, the Bible, ministries, prayer and giving — in one place.
        </p>

        <form onSubmit={submit} className="mt-6 space-y-3">
          {mode === "signup" ? (
            <input
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Display name"
              className="glass w-full rounded-xl px-4 py-3 text-sm outline-none placeholder:text-muted-foreground"
            />
          ) : null}
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Email"
            className="glass w-full rounded-xl px-4 py-3 text-sm outline-none placeholder:text-muted-foreground"
          />
          <input
            type="password"
            required
            minLength={6}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password"
            className="glass w-full rounded-xl px-4 py-3 text-sm outline-none placeholder:text-muted-foreground"
          />
          <button
            type="submit"
            disabled={busy}
            className="brand-mark w-full rounded-xl py-3 text-sm font-semibold text-ink disabled:opacity-60"
          >
            {busy ? "Please wait…" : mode === "signin" ? "Sign in" : "Create account"}
          </button>
        </form>

        <button onClick={google} className="glass mt-3 w-full rounded-xl py-3 text-sm font-medium">
          Continue with Google
        </button>

        <button
          onClick={guest}
          disabled={busy}
          className="glass mt-3 w-full rounded-xl py-3 text-sm font-semibold text-gold disabled:opacity-60"
        >
          Enter as guest — no details needed
        </button>

        <button
          onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
          className="mt-5 w-full text-center text-xs text-muted-foreground hover:text-foreground"
        >
          {mode === "signin" ? "New to KAIROS? Create an account" : "Already have an account? Sign in"}
        </button>
      </div>
    </div>
  );
}
