"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { login, register, isLoggedIn } from "@/lib/auth";

type Mode = "signin" | "signup";

export default function AuthPage() {
  const router = useRouter();
  const [mode, setMode]     = useState<Mode>("signin");
  const [email, setEmail]   = useState("");
  const [username, setUser] = useState("");
  const [password, setPass] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [error, setError]   = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isLoggedIn()) router.replace("/");
  }, [router]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      if (mode === "signin") {
        await login(email, password);
      } else {
        if (username.length < 3) {
          setError("Username must be at least 3 characters");
          setLoading(false);
          return;
        }
        if (password.length < 8) {
          setError("Password must be at least 8 characters");
          setLoading(false);
          return;
        }
        await register(email, username, password);
      }
      router.replace("/");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="relative min-h-screen flex items-center justify-center p-4 selection:bg-indigo-500/30 selection:text-indigo-200">
      {/* Ambient background glow */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[320px] bg-gradient-to-tr from-indigo-600/15 via-purple-600/10 to-transparent blur-3xl pointer-events-none -z-10" />

      <div className="w-full max-w-[400px] animate-fade-in">
        {/* Brand Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-accent-3 text-[11px] font-medium tracking-wide uppercase mb-4 shadow-sm">
            <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-pulse-dot" />
            Engram Intelligence
          </div>

          <div className="flex items-center justify-center gap-2.5 mb-2">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 p-[1px] shadow-lg shadow-indigo-500/20">
              <div className="w-full h-full bg-[#0d0f17] rounded-[11px] flex items-center justify-center">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" className="text-indigo-400" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 2a5 5 0 0 1 5 5v1a5 5 0 0 1-5 5 5 5 0 0 1-5-5V7a5 5 0 0 1 5-5z"/>
                  <path d="M2 18a10 10 0 0 1 20 0"/>
                </svg>
              </div>
            </div>
            <span className="text-2xl font-bold tracking-tight text-white font-sans">Engram</span>
          </div>
          <p className="text-[13px] text-txt-3">Persistent personal AI memory & knowledge graph</p>
        </div>

        {/* Auth Glass Card */}
        <div className="glass-card rounded-2xl p-6 sm:p-7 relative overflow-hidden">
          {/* Subtle top border highlight */}
          <div className="absolute top-0 inset-x-0 h-[1px] bg-gradient-to-r from-transparent via-indigo-500/40 to-transparent" />

          {/* Segmented Mode Selector */}
          <div className="flex p-1 bg-bg-4/60 border border-white/[0.06] rounded-xl mb-6">
            {(["signin", "signup"] as Mode[]).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => {
                  setMode(m);
                  setError("");
                }}
                className={`flex-1 py-2 text-xs font-medium rounded-lg transition-all duration-150 ${
                  mode === m
                    ? "bg-[#1f2433] text-white shadow-md shadow-black/40 border border-white/[0.08]"
                    : "text-txt-3 hover:text-txt-2"
                }`}
              >
                {m === "signin" ? "Sign in" : "Create account"}
              </button>
            ))}
          </div>

          <form onSubmit={submit} className="space-y-4">
            <div>
              <label className="block text-[11px] font-medium text-txt-3 uppercase tracking-wider mb-1.5">
                Email address
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                placeholder="alex@example.com"
                className="w-full bg-[#11141d] border border-white/[0.08] focus:border-indigo-500/60 focus:ring-2 focus:ring-indigo-500/15 rounded-xl px-3.5 py-2.5 text-[13px] text-txt placeholder:text-txt-4 outline-none transition-all"
              />
            </div>

            {mode === "signup" && (
              <div className="animate-fade-in">
                <label className="block text-[11px] font-medium text-txt-3 uppercase tracking-wider mb-1.5">
                  Display name
                </label>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUser(e.target.value)}
                  required
                  placeholder="alex"
                  minLength={3}
                  maxLength={50}
                  className="w-full bg-[#11141d] border border-white/[0.08] focus:border-indigo-500/60 focus:ring-2 focus:ring-indigo-500/15 rounded-xl px-3.5 py-2.5 text-[13px] text-txt placeholder:text-txt-4 outline-none transition-all"
                />
              </div>
            )}

            <div>
              <label className="block text-[11px] font-medium text-txt-3 uppercase tracking-wider mb-1.5">
                Password
              </label>
              <div className="relative">
                <input
                  type={showPass ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPass(e.target.value)}
                  required
                  placeholder={mode === "signup" ? "Min. 8 characters" : "••••••••"}
                  minLength={mode === "signup" ? 8 : 1}
                  className="w-full bg-[#11141d] border border-white/[0.08] focus:border-indigo-500/60 focus:ring-2 focus:ring-indigo-500/15 rounded-xl px-3.5 py-2.5 pr-16 text-[13px] text-txt placeholder:text-txt-4 outline-none transition-all"
                />
                <button
                  type="button"
                  onClick={() => setShowPass((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] text-txt-3 hover:text-txt-2"
                >
                  {showPass ? "Hide" : "Show"}
                </button>
              </div>
            </div>

            {error && (
              <div className="flex items-start gap-2.5 bg-red-500/10 border border-red-500/20 rounded-xl p-3 text-red-300 text-xs animate-slide-in">
                <span className="text-red-400 font-bold shrink-0 mt-0.5">!</span>
                <p className="leading-relaxed">{error}</p>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 mt-2 bg-gradient-to-r from-indigo-600 to-indigo-500 hover:from-indigo-500 hover:to-indigo-400 text-white font-medium text-[13px] rounded-xl shadow-lg shadow-indigo-600/20 hover:shadow-indigo-600/35 active:scale-[0.99] transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  <span>{mode === "signin" ? "Signing in…" : "Creating account…"}</span>
                </>
              ) : (
                <span>{mode === "signin" ? "Sign in to workspace →" : "Create account →"}</span>
              )}
            </button>
          </form>

          <div className="mt-5 text-center">
            <span className="text-xs text-txt-3">
              {mode === "signin" ? "Don't have an account? " : "Already have an account? "}
            </span>
            <button
              type="button"
              onClick={() => {
                setMode(mode === "signin" ? "signup" : "signin");
                setError("");
              }}
              className="text-xs text-accent-2 hover:text-accent-3 font-medium underline underline-offset-4"
            >
              {mode === "signin" ? "Sign up" : "Sign in"}
            </button>
          </div>
        </div>

        {/* Value Props Footer */}
        <div className="mt-6 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-[11px] text-txt-3">
          <span className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
            Temporal Graph
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-indigo-400" />
            Hybrid Vector Recall
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-purple-400" />
            100% Private
          </span>
        </div>
      </div>
    </div>
  );
}
