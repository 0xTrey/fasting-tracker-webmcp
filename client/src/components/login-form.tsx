import { useState, type FormEvent } from "react";
import { ArrowRight, KeyRound, ShieldCheck, UserRound } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function LoginForm() {
  const { login } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setIsSubmitting(true);
    try {
      await login(username, password);
      setPassword("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to sign in");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main className="login-shell">
      <div className="login-orbit" aria-hidden="true" />
      <section className="login-card" aria-labelledby="login-title">
        <div className="login-mark" aria-hidden="true"><span /></div>
        <h1 id="login-title">Keep your fasting history private.</h1>
        <p className="login-intro">
          Sign in to track your fasts, review your history, and use your trusted agent with the same account. This browser stays signed in for up to 90 days. You can sign out at any time.
        </p>

        <form onSubmit={handleSubmit} className="mt-8 space-y-4">
          <label className="block space-y-2">
            <span className="text-sm font-semibold text-foreground/80">Username</span>
            <div className="relative">
              <UserRound className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
              <Input
                name="username"
                autoComplete="username"
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                className="h-14 rounded-2xl border-white/10 bg-black/20 pl-12 text-base"
                required
                autoFocus
                aria-invalid={Boolean(error)}
                aria-describedby={error ? "login-error" : undefined}
              />
            </div>
          </label>

          <label className="block space-y-2">
            <span className="text-sm font-semibold text-foreground/80">Password</span>
            <div className="relative">
              <KeyRound className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
              <Input
                name="password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="h-14 rounded-2xl border-white/10 bg-black/20 pl-12 text-base"
                required
                aria-invalid={Boolean(error)}
                aria-describedby={error ? "login-error" : undefined}
              />
            </div>
          </label>

          <div aria-live="polite">
            {error && (
              <p id="login-error" className="rounded-xl border border-red-400/20 bg-red-400/10 px-4 py-3 text-sm text-red-100" role="alert">
                {error}
              </p>
            )}
          </div>

          <Button
            type="submit"
            className="h-14 w-full rounded-2xl bg-amber-300 text-base font-bold text-stone-950 hover:bg-amber-200"
            disabled={isSubmitting || !username || !password}
          >
            {isSubmitting ? "Signing in…" : "Sign in to my tracker"}
            {!isSubmitting && <ArrowRight className="ml-2 h-5 w-5" />}
          </Button>
        </form>

        <div className="mt-8 flex items-center gap-3 border-t border-white/10 pt-5 text-xs text-muted-foreground">
          <ShieldCheck className="h-4 w-4 text-teal-300" />
          <span>Private account · secure sign-in · access you can revoke</span>
        </div>
        <p className="mt-4 text-xs leading-relaxed text-muted-foreground">
          Fasting Tracker is a timer and journal, not medical advice. Stop if you feel unwell and ask a qualified healthcare professional if fasting is right for you.
        </p>
      </section>
    </main>
  );
}
