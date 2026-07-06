import React, { useState } from "react";
import { motion } from "motion/react";
import { Sparkles, ShieldCheck, Mail, Lock, User, AlertCircle, CheckCircle } from "lucide-react";

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
  const [isSignUp, setIsSignUp] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [username, setUsername] = useState(() => {
    // Strip prefix ~ if present
    return guestUsername.startsWith("~") ? guestUsername.slice(1) : guestUsername;
  });
  const [ageConfirmed, setAgeConfirmed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  if (!isOpen) return null;

  // Username validation constraints
  const validateUsername = (name: string): string | null => {
    if (name.length < 3) return "Username must be at least 3 characters";
    if (name.length > 18) return "Username must be 18 characters or fewer";
    if (!/^[a-zA-Z0-9_]+$/.test(name)) return "Allowed: letters, numbers, underscores";
    if (name.toLowerCase() === "admin" || name.toLowerCase() === "reax") return "This username is reserved";
    return null;
  };

  const handleSimulatedSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!email || !password) {
      setError("Please fill in all credentials.");
      return;
    }

    if (isSignUp) {
      if (!username) {
        setError("Please choose a username.");
        return;
      }
      const uErr = validateUsername(username);
      if (uErr) {
        setError(uErr);
        return;
      }
      if (!ageConfirmed) {
        setError("You must confirm you are 13 or older to register.");
        return;
      }
    }

    // Simulate database lookup or API call
    setSuccess(true);
    setTimeout(() => {
      onLoginSuccess(isSignUp ? username : (guestUsername.startsWith("~") ? guestUsername.slice(1) : guestUsername));
      onClose();
    }, 1500);
  };

  const handleGoogleSignIn = () => {
    setError(null);
    setSuccess(true);
    setTimeout(() => {
      // Keep the current guest username minus prefix
      const cleanName = guestUsername.startsWith("~") ? guestUsername.slice(1) : guestUsername;
      onLoginSuccess(cleanName);
      onClose();
    }, 1200);
  };

  // Human, friendly trigger copy
  const getTriggerCopy = () => {
    switch (triggerReason) {
      case "save_reaction":
        return {
          title: "Save Reaction to Cloud Vault",
          desc: "Upgrade to a free account to back up your custom reactions and access them from any browser!"
        };
      case "post_limit":
        return {
          title: "🔥 You're on fire!",
          desc: "You've posted multiple reaction clips! Lock in your username and keep your reaction streak active."
        };
      case "edit_username":
        return {
          title: "Customize Your Alias",
          desc: "Upgrade from Guest to create a permanent username, remove the '~' prefix, and build your digital identity."
        };
      default:
        return {
          title: "Upgrade to Reax Pro Profile",
          desc: "Secure your username, preserve all saved items, and post unlimited interactive AI loops instantly."
        };
    }
  };

  const copy = getTriggerCopy();

  return (
    <div className="fixed inset-0 z-[110] bg-black/90 backdrop-blur-md flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 15 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 15 }}
        className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-md p-6 relative overflow-hidden shadow-2xl space-y-6"
      >
        {/* Glow ornament */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-48 h-24 bg-indigo-500/10 blur-3xl rounded-full pointer-events-none" />

        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-slate-400 hover:text-white px-3 py-1 bg-slate-950 border border-slate-800 rounded-xl font-mono text-xs cursor-pointer transition-colors"
        >
          Skip
        </button>

        {/* Header */}
        <div className="text-center space-y-2 pt-2">
          <div className="mx-auto w-12 h-12 rounded-2xl bg-indigo-500/10 flex items-center justify-center text-indigo-400">
            <Sparkles className="w-6 h-6 animate-pulse" />
          </div>
          <h2 className="text-xl font-black font-sans tracking-tight text-white uppercase mt-3">
            {copy.title}
          </h2>
          <p className="text-xs text-slate-400 max-w-sm mx-auto leading-relaxed">
            {copy.desc}
          </p>
        </div>

        {success ? (
          <div className="py-8 text-center space-y-3">
            <div className="mx-auto w-12 h-12 rounded-full bg-emerald-500/15 flex items-center justify-center text-emerald-400">
              <CheckCircle className="w-8 h-8" />
            </div>
            <p className="text-emerald-400 font-mono text-sm font-bold animate-bounce">
              Identity Upgraded Successfully!
            </p>
            <p className="text-xs text-slate-500 font-mono">Merging guest loops & saved items...</p>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Auth Tab Picker */}
            <div className="grid grid-cols-2 p-1 bg-slate-950 border border-slate-800 rounded-xl">
              <button
                type="button"
                onClick={() => { setIsSignUp(true); setError(null); }}
                className={`py-1.5 text-xs font-bold rounded-lg transition-all font-mono uppercase ${
                  isSignUp 
                    ? "bg-slate-800 text-white shadow-sm" 
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                Sign Up
              </button>
              <button
                type="button"
                onClick={() => { setIsSignUp(false); setError(null); }}
                className={`py-1.5 text-xs font-bold rounded-lg transition-all font-mono uppercase ${
                  !isSignUp 
                    ? "bg-slate-800 text-white shadow-sm" 
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                Sign In
              </button>
            </div>

            {/* Error box */}
            {error && (
              <div className="p-3 bg-rose-500/10 border border-rose-500/20 rounded-xl flex items-center gap-2.5 text-rose-300 text-xs">
                <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
                <span>{error}</span>
              </div>
            )}

            <form onSubmit={handleSimulatedSubmit} className="space-y-3">
              {/* Email */}
              <div className="space-y-1">
                <label className="text-[10px] font-mono text-slate-500 uppercase tracking-wider block">Email Address</label>
                <div className="relative">
                  <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    className="w-full bg-slate-950/80 border border-slate-800/80 focus:border-indigo-500 rounded-xl py-2 pl-10 pr-4 text-xs font-mono text-white outline-none transition-colors"
                  />
                </div>
              </div>

              {/* Password */}
              <div className="space-y-1">
                <label className="text-[10px] font-mono text-slate-500 uppercase tracking-wider block">Password</label>
                <div className="relative">
                  <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                  <input
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full bg-slate-950/80 border border-slate-800/80 focus:border-indigo-500 rounded-xl py-2 pl-10 pr-4 text-xs font-mono text-white outline-none transition-colors"
                  />
                </div>
              </div>

              {/* Custom Username for Sign Up */}
              {isSignUp && (
                <div className="space-y-1">
                  <div className="flex justify-between items-center">
                    <label className="text-[10px] font-mono text-slate-500 uppercase tracking-wider">Choose Username</label>
                    <span className="text-[9px] font-mono text-slate-600">No '~' prefix</span>
                  </div>
                  <div className="relative">
                    <User className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                    <input
                      type="text"
                      required
                      value={username}
                      onChange={(e) => setUsername(e.target.value.replace(/[^a-zA-Z0-9_]/g, ""))}
                      maxLength={18}
                      placeholder="MyAwesomeAlias"
                      className="w-full bg-slate-950/80 border border-slate-800/80 focus:border-indigo-500 rounded-xl py-2 pl-10 pr-4 text-xs font-mono text-white outline-none transition-colors"
                    />
                  </div>
                </div>
              )}

              {/* Age verification required for sign up */}
              {isSignUp && (
                <label className="flex items-start gap-2.5 p-3 bg-slate-950/50 rounded-xl border border-slate-800/50 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={ageConfirmed}
                    onChange={(e) => setAgeConfirmed(e.target.checked)}
                    className="mt-0.5 rounded border-slate-800 text-indigo-600 focus:ring-indigo-500/20 bg-slate-900"
                  />
                  <div className="text-[11px] text-slate-400 leading-normal">
                    <span className="font-bold text-slate-300">I am 13 years or older</span>. I confirm that I meet the minimum age required for Reax compliance.
                  </div>
                </label>
              )}

              <button
                type="submit"
                className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs uppercase tracking-widest rounded-xl transition-all font-mono shadow-md active:scale-98"
              >
                {isSignUp ? "Create Permanent Profile" : "Sign In & Merge"}
              </button>
            </form>

            {/* Divider */}
            <div className="flex items-center gap-3 py-1.5">
              <div className="h-[1px] bg-slate-800 grow" />
              <span className="text-[10px] font-mono text-slate-600 uppercase">Or</span>
              <div className="h-[1px] bg-slate-800 grow" />
            </div>

            {/* Google Sign In Option */}
            <button
              onClick={handleGoogleSignIn}
              className="w-full py-2.5 bg-slate-950 hover:bg-slate-800 border border-slate-800/80 text-slate-300 font-bold text-xs uppercase tracking-wider rounded-xl transition-all font-mono flex items-center justify-center gap-2"
            >
              <span className="text-sm font-sans font-black bg-gradient-to-r from-red-400 via-yellow-400 to-green-400 bg-clip-text text-transparent">G</span>
              <span>Continue with Google</span>
            </button>
          </div>
        )}

        <div className="text-center">
          <p className="text-[10px] text-slate-500 font-mono uppercase tracking-wide">
            🔒 Safe, lightweight, 100% cloud backup
          </p>
        </div>
      </motion.div>
    </div>
  );
}
