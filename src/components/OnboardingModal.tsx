import React, { useState } from "react";
import { motion } from "motion/react";
import { 
  Sparkles, ShieldCheck, Mail, Lock, User, AlertCircle, 
  CheckCircle, ArrowRight, LogIn, UserPlus, Check
} from "lucide-react";
import { 
  signUpWithEmail, 
  signInWithEmail, 
  syncUserProfile, 
  fetchMyProfile 
} from "../utils/supabaseClient";

interface OnboardingModalProps {
  key?: string;
  isOpen: boolean;
  onClose: () => void;
  onLoginSuccess: (newUsername: string) => void;
  guestUsername: string;
  triggerReason: "save_reaction" | "post_limit" | "edit_username" | "nav_click" | null;
}

export default function OnboardingModal({
  isOpen,
  onClose,
  onLoginSuccess,
  guestUsername,
  triggerReason
}: OnboardingModalProps) {
  const [tab, setTab] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [username, setUsername] = useState(() => {
    return guestUsername.startsWith("~") ? guestUsername.slice(1) : guestUsername;
  });
  const [ageConfirmed, setAgeConfirmed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [needsEmailConfirm, setNeedsEmailConfirm] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen) return null;

  const validateUsername = (name: string): string | null => {
    if (name.length < 3) return "Username must be at least 3 characters";
    if (name.length > 18) return "Username must be 18 characters or fewer";
    if (!/^[a-zA-Z0-9_]+$/.test(name)) return "Allowed: letters, numbers, underscores";
    if (name.toLowerCase() === "admin" || name.toLowerCase() === "reax") return "This username is reserved";
    return null;
  };

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);

    const cleanEmail = email.trim();
    if (!cleanEmail || !cleanEmail.includes("@")) {
      setError("Please enter a valid email address.");
      return;
    }
    if (!password) {
      setError("Please enter your password.");
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await signInWithEmail({ email: cleanEmail, password });
      if (!res.success) {
        setError(res.error || "Sign in failed. Please check your credentials.");
        setIsSubmitting(false);
        return;
      }

      // Extract username from profile or metadata
      let resolvedUsername =
        res.user?.user_metadata?.username ||
        res.user?.user_metadata?.display_name;

      if (!resolvedUsername) {
        const { profile } = await fetchMyProfile();
        if (profile?.username) {
          resolvedUsername = profile.username;
        }
      }

      if (!resolvedUsername) {
        resolvedUsername = cleanEmail.split("@")[0].replace(/[^a-zA-Z0-9_]/g, "") || "User";
      }

      try {
        const synced = await syncUserProfile(resolvedUsername);
        if (synced?.username) resolvedUsername = synced.username;
      } catch {}

      setSuccessMsg(`Welcome back, @${resolvedUsername}!`);
      setTimeout(() => {
        onLoginSuccess(resolvedUsername);
        onClose();
      }, 800);
    } catch (err: any) {
      setError(err?.message || "Sign in error. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);

    const cleanEmail = email.trim();
    if (!cleanEmail || !cleanEmail.includes("@")) {
      setError("Please enter a valid email address.");
      return;
    }

    const cleanUsername = username.trim().replace(/[^a-zA-Z0-9_]/g, "");
    if (!cleanUsername) {
      setError("Please choose a username.");
      return;
    }
    const uErr = validateUsername(cleanUsername);
    if (uErr) {
      setError(uErr);
      return;
    }

    if (password.length < 8) {
      setError("Password must be at least 8 characters long.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    if (!ageConfirmed) {
      setError("You must confirm you are 13 or older to register.");
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await signUpWithEmail({
        email: cleanEmail,
        password,
        username: cleanUsername
      });

      if (res.error) {
        setError(res.error);
        setIsSubmitting(false);
        return;
      }

      if (res.needsEmailConfirm) {
        setNeedsEmailConfirm(true);
        setError(null);
      } else {
        // Immediate session without confirmation
        try {
          await syncUserProfile(cleanUsername);
        } catch {}

        setSuccessMsg(`Account created for @${cleanUsername}!`);
        setTimeout(() => {
          onLoginSuccess(cleanUsername);
          onClose();
        }, 1000);
      }
    } catch (err: any) {
      setError(err?.message || "Registration failed. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 15 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 15 }}
        className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col"
      >
        {/* Header */}
        <div className="p-5 border-b border-slate-800 bg-slate-950/50 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-indigo-600 to-rose-600 flex items-center justify-center text-white shadow-md">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white font-sans">
                {tab === "signin" ? "Sign In to Reax" : "Create Your Reax Account"}
              </h2>
              <p className="text-xs text-slate-400 font-mono">
                {triggerReason === "save_reaction"
                  ? "Sign in to save custom reactions to your vault"
                  : triggerReason === "edit_username"
                  ? "Claim a permanent @username"
                  : "Email & password authentication"}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white text-xs font-mono p-1.5 rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
          >
            ✕
          </button>
        </div>

        {/* Tab Selector */}
        {!needsEmailConfirm && (
          <div className="flex border-b border-slate-800 bg-slate-950/30">
            <button
              onClick={() => {
                setTab("signin");
                setError(null);
                setSuccessMsg(null);
              }}
              className={`flex-1 py-3 text-xs font-mono font-bold flex items-center justify-center gap-1.5 border-b-2 transition-colors cursor-pointer ${
                tab === "signin"
                  ? "border-indigo-500 text-indigo-400 bg-indigo-500/5"
                  : "border-transparent text-slate-400 hover:text-slate-200"
              }`}
            >
              <LogIn className="w-3.5 h-3.5" />
              Sign In
            </button>
            <button
              onClick={() => {
                setTab("signup");
                setError(null);
                setSuccessMsg(null);
              }}
              className={`flex-1 py-3 text-xs font-mono font-bold flex items-center justify-center gap-1.5 border-b-2 transition-colors cursor-pointer ${
                tab === "signup"
                  ? "border-indigo-500 text-indigo-400 bg-indigo-500/5"
                  : "border-transparent text-slate-400 hover:text-slate-200"
              }`}
            >
              <UserPlus className="w-3.5 h-3.5" />
              Sign Up
            </button>
          </div>
        )}

        {/* Content Body */}
        <div className="p-6 space-y-4">
          
          {/* Email Confirmation Notice (When Sign Up requires email link confirmation) */}
          {needsEmailConfirm ? (
            <div className="space-y-4 py-2 text-center">
              <div className="w-12 h-12 rounded-2xl bg-indigo-500/10 border border-indigo-500/30 flex items-center justify-center mx-auto text-indigo-400 shadow-lg">
                <Mail className="w-6 h-6" />
              </div>
              <div className="space-y-2">
                <h3 className="text-base font-bold text-white font-sans">Confirmation Email Sent</h3>
                <p className="text-xs text-slate-300 font-mono leading-relaxed max-w-xs mx-auto">
                  Check your email and tap <strong>Confirm</strong>. After that, sign in with your password. No code needed.
                </p>
              </div>
              <div className="pt-2 flex flex-col gap-2">
                <button
                  onClick={() => {
                    setNeedsEmailConfirm(false);
                    setTab("signin");
                  }}
                  className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white font-mono font-bold text-xs rounded-xl transition-all cursor-pointer shadow-md"
                >
                  Go to Sign In
                </button>
                <button
                  onClick={onClose}
                  className="w-full py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 font-mono text-xs rounded-xl transition-colors cursor-pointer"
                >
                  Close
                </button>
              </div>
            </div>
          ) : (
            <>
              {/* Sign In Form */}
              {tab === "signin" && (
                <form onSubmit={handleSignIn} className="space-y-3.5">
                  <div>
                    <label className="block text-[11px] font-mono text-slate-400 mb-1">Email Address</label>
                    <div className="relative">
                      <Mail className="w-4 h-4 text-slate-500 absolute left-3 top-3" />
                      <input
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="you@example.com"
                        required
                        className="w-full pl-9 pr-3 py-2.5 bg-slate-950 border border-slate-700 rounded-xl text-xs font-mono text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500"
                        autoFocus
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-[11px] font-mono text-slate-400 mb-1">Password</label>
                    <div className="relative">
                      <Lock className="w-4 h-4 text-slate-500 absolute left-3 top-3" />
                      <input
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="••••••••"
                        required
                        className="w-full pl-9 pr-3 py-2.5 bg-slate-950 border border-slate-700 rounded-xl text-xs font-mono text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500"
                      />
                    </div>
                  </div>

                  {error && (
                    <div className="p-2.5 rounded-xl bg-rose-950/40 border border-rose-800/60 text-rose-300 text-xs font-mono flex items-center gap-2">
                      <AlertCircle className="w-4 h-4 shrink-0" />
                      <span>{error}</span>
                    </div>
                  )}

                  {successMsg && (
                    <div className="p-2.5 rounded-xl bg-emerald-950/40 border border-emerald-800/60 text-emerald-300 text-xs font-mono flex items-center gap-2">
                      <CheckCircle className="w-4 h-4 shrink-0" />
                      <span>{successMsg}</span>
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white font-mono font-bold text-xs rounded-xl transition-all shadow-md active:scale-95 cursor-pointer disabled:opacity-50 flex items-center justify-center gap-1.5"
                  >
                    <LogIn className="w-3.5 h-3.5" />
                    {isSubmitting ? "Signing in..." : "Sign In"}
                  </button>
                </form>
              )}

              {/* Sign Up Form */}
              {tab === "signup" && (
                <form onSubmit={handleSignUp} className="space-y-3">
                  <div>
                    <label className="block text-[11px] font-mono text-slate-400 mb-1">Email Address</label>
                    <div className="relative">
                      <Mail className="w-4 h-4 text-slate-500 absolute left-3 top-3" />
                      <input
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="you@example.com"
                        required
                        className="w-full pl-9 pr-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-xs font-mono text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500"
                        autoFocus
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-[11px] font-mono text-slate-400 mb-1">
                      Choose @username <span className="text-slate-500">(3-18 chars)</span>
                    </label>
                    <div className="relative">
                      <User className="w-4 h-4 text-slate-500 absolute left-3 top-2.5" />
                      <input
                        type="text"
                        value={username}
                        onChange={(e) => setUsername(e.target.value.replace(/[^a-zA-Z0-9_]/g, ""))}
                        placeholder="CoolCreator"
                        maxLength={18}
                        required
                        className="w-full pl-9 pr-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-xs font-mono text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[11px] font-mono text-slate-400 mb-1">Password (min 8)</label>
                      <input
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="••••••••"
                        required
                        className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-xs font-mono text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-mono text-slate-400 mb-1">Confirm Password</label>
                      <input
                        type="password"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        placeholder="••••••••"
                        required
                        className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-xs font-mono text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500"
                      />
                    </div>
                  </div>

                  {/* 13+ Checkbox */}
                  <label className="flex items-start gap-2.5 p-2 bg-slate-950/60 border border-slate-800 rounded-xl cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={ageConfirmed}
                      onChange={(e) => setAgeConfirmed(e.target.checked)}
                      className="mt-0.5 rounded border-slate-700 text-indigo-600 focus:ring-0 bg-slate-900 cursor-pointer"
                    />
                    <span className="text-[11px] font-mono text-slate-300 leading-tight">
                      I confirm that I am <strong>13 years of age or older</strong> and agree to community standards.
                    </span>
                  </label>

                  {error && (
                    <div className="p-2.5 rounded-xl bg-rose-950/40 border border-rose-800/60 text-rose-300 text-xs font-mono flex items-center gap-2">
                      <AlertCircle className="w-4 h-4 shrink-0" />
                      <span>{error}</span>
                    </div>
                  )}

                  {successMsg && (
                    <div className="p-2.5 rounded-xl bg-emerald-950/40 border border-emerald-800/60 text-emerald-300 text-xs font-mono flex items-center gap-2">
                      <CheckCircle className="w-4 h-4 shrink-0" />
                      <span>{successMsg}</span>
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white font-mono font-bold text-xs rounded-xl transition-all shadow-md active:scale-95 cursor-pointer disabled:opacity-50 flex items-center justify-center gap-1.5"
                  >
                    <UserPlus className="w-3.5 h-3.5" />
                    {isSubmitting ? "Creating account..." : "Sign Up"}
                  </button>
                </form>
              )}

              {/* Continue as guest footer */}
              <div className="pt-2 border-t border-slate-800/80 text-center">
                <button
                  type="button"
                  onClick={onClose}
                  className="text-xs text-slate-400 hover:text-slate-200 font-mono hover:underline cursor-pointer"
                >
                  Continue as guest
                </button>
              </div>
            </>
          )}

        </div>
      </motion.div>
    </div>
  );
}
