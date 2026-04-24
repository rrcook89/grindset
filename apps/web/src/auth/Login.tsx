import { useState } from "react";
import { useGameStore } from "../state/store";

const API_BASE = import.meta.env.VITE_API_URL ?? "http://localhost:8081";

type Step = "email" | "verify" | "done";

export function Login({ onAuth }: { onAuth: () => void }) {
  const setJwt = useGameStore((s) => s.setJwt);
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleRequestEmail(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!email.trim()) { setError("Email required"); return; }
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/auth/request`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      });
      if (!res.ok) throw new Error(await res.text());
      setStep("verify");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Request failed");
    } finally {
      setLoading(false);
    }
  }

  async function handleVerify(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!code.trim()) { setError("Code required"); return; }
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/auth/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), code: code.trim() }),
      });
      if (!res.ok) throw new Error(await res.text());
      const { token } = (await res.json()) as { token: string };
      setJwt(token);
      setStep("done");
      onAuth();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Verification failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex h-full w-full items-center justify-center bg-obsidian">
      <div className="flex w-full max-w-sm flex-col gap-6 rounded border border-ingot-gold/30 bg-obsidian px-8 py-10 shadow-2xl">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-bold tracking-widest text-ingot-gold">GRINDSET</h1>
          <p className="text-xs text-parchment-grey/50">Touch grass? Mine it.</p>
        </div>

        {step === "email" && (
          <form className="flex flex-col gap-4" onSubmit={handleRequestEmail}>
            <label className="flex flex-col gap-1.5">
              <span className="text-xs uppercase tracking-widest text-parchment-grey/60">Email</span>
              <input
                data-testid="login-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                autoComplete="email"
                className="rounded border border-ingot-gold/20 bg-obsidian px-3 py-2 text-sm text-parchment-grey placeholder-parchment-grey/30 outline-none focus:border-ingot-gold/60"
              />
            </label>
            {error && <p className="text-xs text-loss-red">{error}</p>}
            <button
              type="submit"
              disabled={loading}
              className="rounded border border-ingot-gold/40 py-2 text-sm font-semibold uppercase tracking-widest text-ingot-gold transition-colors hover:bg-ingot-gold/10 disabled:opacity-50"
            >
              {loading ? "Sending..." : "Send login code"}
            </button>
          </form>
        )}

        {step === "verify" && (
          <form className="flex flex-col gap-4" onSubmit={handleVerify}>
            <p className="text-xs text-parchment-grey/60">
              Check <span className="text-ingot-gold">{email}</span> — paste the code below.
            </p>
            <label className="flex flex-col gap-1.5">
              <span className="text-xs uppercase tracking-widest text-parchment-grey/60">Code</span>
              <input
                data-testid="login-code"
                type="text"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="123456"
                autoComplete="one-time-code"
                className="rounded border border-ingot-gold/20 bg-obsidian px-3 py-2 font-mono text-sm text-parchment-grey placeholder-parchment-grey/30 outline-none focus:border-ingot-gold/60"
              />
            </label>
            {error && <p className="text-xs text-loss-red">{error}</p>}
            <button
              type="submit"
              disabled={loading}
              className="rounded border border-ingot-gold/40 py-2 text-sm font-semibold uppercase tracking-widest text-ingot-gold transition-colors hover:bg-ingot-gold/10 disabled:opacity-50"
            >
              {loading ? "Verifying..." : "Verify"}
            </button>
            <button
              type="button"
              className="text-xs text-parchment-grey/40 hover:text-parchment-grey/70"
              onClick={() => { setStep("email"); setError(null); setCode(""); }}
            >
              Back
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
