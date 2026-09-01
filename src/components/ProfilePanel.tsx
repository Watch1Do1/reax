import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { 
  X, User, Mail, Lock, LogOut, Film, Sparkles, Check, 
  AlertCircle, CheckCircle, KeyRound, Clock, Flame, ShieldCheck 
} from "lucide-react";
import { Clip } from "../types";
import { 
  getCurrentSupabaseUser, 
  signOutSupabase, 
  updateUserPassword, 
  syncUserProfile 
} from "../utils/supabaseClient";

export interface ProfilePanelProps {
  isOpen: boolean;
  onClose: () => void;
  currentUsername: string;
  onSignOut: () => void;
  onUsernameUpdated?: (newUsername: string) => void;
  clips?: Clip[];
  onClipSelect?: (clipId: string) => void;
}

export default function ProfilePanel({
  isOpen,
  onClose,
  currentUsername,
  onSignOut,
  onUsernameUpdated,
  clips = [],
  onClipSelect
}: ProfilePanelProps) {
  const [email, setEmail] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [createdAt, setCreatedAt] = useState<string | null>(null);
  
  // Change password state
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordMsg, setPasswordMsg] = useState<{ type: "error" | "success"; text: string } | null>(null);
  const [isUpdatingPassword, setIsUpdatingPassword] = useState(false);

  // Quick edit username state
  const [isEditingUsername, setIsEditingUsername] = useState(false);
  const [editedUsername, setEditedUsername] = useState(currentUsername);
  const [usernameError, setUsernameError] = useState<string | null>(null);
  const [isSavingUsername, setIsSavingUsername] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setEditedUsername(currentUsername);
      setPasswordMsg(null);
      setNewPassword("");
      setConfirmPassword("");
      setIsChangingPassword(false);
      setIsEditingUsername(false);

      // Fetch user profile & email details
      getCurrentSupabaseUser().then((user) => {
        if (user) {
          setEmail(user.email || null);
          setUserId(user.id || null);
          setCreatedAt(user.created_at || null);
        }
      });
    }
  }, [isOpen, currentUsername]);

  if (!isOpen) return null;

  // Filter clips belonging to this user (matching authorName or authorId)
  const cleanCurrent = currentUsername.trim().toLowerCase().replace(/^@/, "").replace(/^~/, "");
  const userClips = clips.filter((c) => {
    if (userId && c.authorId && c.authorId === userId) return true;
    const cleanAuthor = (c.authorName || "").trim().toLowerCase().replace(/^@/, "").replace(/^~/, "");
    return cleanAuthor === cleanCurrent && cleanAuthor.length > 0;
  });

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordMsg(null);

    if (newPassword.length < 8) {
      setPasswordMsg({ type: "error", text: "New password must be at least 8 characters long." });
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordMsg({ type: "error", text: "Passwords do not match." });
      return;
    }

    setIsUpdatingPassword(true);
    try {
      const res = await updateUserPassword(newPassword);
      if (!res.success) {
        setPasswordMsg({ type: "error", text: res.error || "Failed to update password." });
      } else {
        setPasswordMsg({ type: "success", text: "Password updated successfully!" });
        setNewPassword("");
        setConfirmPassword("");
        setTimeout(() => setIsChangingPassword(false), 1800);
      }
    } catch (err: any) {
      setPasswordMsg({ type: "error", text: err.message || "Failed to update password." });
    } finally {
      setIsUpdatingPassword(false);
    }
  };

  const handleSaveUsername = async (e: React.FormEvent) => {
    e.preventDefault();
    setUsernameError(null);
    const clean = editedUsername.trim().replace(/[^a-zA-Z0-9_]/g, "");

    if (clean.length < 3) {
      setUsernameError("Username must be at least 3 characters");
      return;
    }
    if (clean.length > 18) {
      setUsernameError("Username must be 18 characters or fewer");
      return;
    }

    setIsSavingUsername(true);
    try {
      await syncUserProfile(clean);
      if (onUsernameUpdated) {
        onUsernameUpdated(clean);
      }
      setIsEditingUsername(false);
    } catch (err: any) {
      setUsernameError(err?.message || "Could not save username");
    } finally {
      setIsSavingUsername(false);
    }
  };

  const handleSignOutClick = async () => {
    await signOutSupabase();
    onSignOut();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 10 }}
        className="w-full max-w-xl bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
      >
        {/* Header */}
        <div className="p-5 border-b border-slate-800/80 flex items-center justify-between bg-slate-950/50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-600 to-rose-600 flex items-center justify-center text-white shadow-md">
              <User className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white font-sans flex items-center gap-2">
                User Profile
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 font-mono font-medium border border-indigo-500/30">
                  Member
                </span>
              </h2>
              <p className="text-xs text-slate-400 font-mono">Manage your account & loop creations</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-6 custom-scrollbar">
          
          {/* User Info Card */}
          <div className="p-4 bg-slate-950/60 border border-slate-800 rounded-xl space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-mono text-slate-400 flex items-center gap-1.5">
                <User className="w-3.5 h-3.5 text-indigo-400" />
                Username
              </span>
              {!isEditingUsername && (
                <button
                  onClick={() => setIsEditingUsername(true)}
                  className="text-[11px] text-indigo-400 hover:text-indigo-300 font-mono font-bold hover:underline cursor-pointer"
                >
                  Edit
                </button>
              )}
            </div>

            {isEditingUsername ? (
              <form onSubmit={handleSaveUsername} className="space-y-2 pt-1">
                <div className="flex items-center gap-2">
                  <div className="relative flex-1">
                    <span className="absolute left-3 top-2.5 text-xs text-slate-500 font-mono">@</span>
                    <input
                      type="text"
                      value={editedUsername}
                      onChange={(e) => setEditedUsername(e.target.value.replace(/[^a-zA-Z0-9_]/g, ""))}
                      className="w-full pl-7 pr-3 py-2 bg-slate-900 border border-indigo-500/50 rounded-lg text-sm text-white font-mono focus:outline-none"
                      maxLength={18}
                      autoFocus
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={isSavingUsername}
                    className="px-3 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold font-mono rounded-lg transition-colors cursor-pointer disabled:opacity-50"
                  >
                    Save
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsEditingUsername(false)}
                    className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-mono rounded-lg transition-colors cursor-pointer"
                  >
                    Cancel
                  </button>
                </div>
                {usernameError && (
                  <p className="text-[11px] text-rose-400 font-mono">{usernameError}</p>
                )}
              </form>
            ) : (
              <div className="flex items-center gap-2">
                <span className="text-lg font-bold font-mono text-white">@{currentUsername}</span>
                <ShieldCheck className="w-4 h-4 text-emerald-400" />
              </div>
            )}

            {email && (
              <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between text-xs font-mono">
                <span className="text-slate-400 flex items-center gap-1.5">
                  <Mail className="w-3.5 h-3.5 text-slate-400" />
                  Email
                </span>
                <span className="text-slate-200">{email}</span>
              </div>
            )}

            {createdAt && (
              <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between text-xs font-mono">
                <span className="text-slate-400 flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-slate-400" />
                  Member Since
                </span>
                <span className="text-slate-300">{new Date(createdAt).toLocaleDateString()}</span>
              </div>
            )}
          </div>

          {/* Change Password Section */}
          <div className="p-4 bg-slate-950/60 border border-slate-800 rounded-xl space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-mono text-slate-400 flex items-center gap-1.5">
                <Lock className="w-3.5 h-3.5 text-amber-400" />
                Security & Password
              </span>
              <button
                onClick={() => {
                  setIsChangingPassword(!isChangingPassword);
                  setPasswordMsg(null);
                }}
                className="text-[11px] text-indigo-400 hover:text-indigo-300 font-mono font-bold hover:underline cursor-pointer"
              >
                {isChangingPassword ? "Cancel" : "Change Password"}
              </button>
            </div>

            {isChangingPassword ? (
              <form onSubmit={handlePasswordSubmit} className="space-y-3 pt-2">
                <div>
                  <label className="block text-[11px] font-mono text-slate-400 mb-1">New Password (min 8 chars)</label>
                  <input
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-sm text-white font-mono focus:outline-none focus:border-indigo-500"
                    autoFocus
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-mono text-slate-400 mb-1">Confirm New Password</label>
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-sm text-white font-mono focus:outline-none focus:border-indigo-500"
                  />
                </div>

                {passwordMsg && (
                  <div
                    className={`p-2.5 rounded-lg text-xs font-mono flex items-center gap-2 ${
                      passwordMsg.type === "error"
                        ? "bg-rose-950/40 border border-rose-800/60 text-rose-300"
                        : "bg-emerald-950/40 border border-emerald-800/60 text-emerald-300"
                    }`}
                  >
                    {passwordMsg.type === "error" ? (
                      <AlertCircle className="w-4 h-4 shrink-0" />
                    ) : (
                      <CheckCircle className="w-4 h-4 shrink-0" />
                    )}
                    <span>{passwordMsg.text}</span>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={isUpdatingPassword || !newPassword || !confirmPassword}
                  className="w-full py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold font-mono rounded-lg transition-colors cursor-pointer disabled:opacity-50 flex items-center justify-center gap-1.5"
                >
                  <KeyRound className="w-3.5 h-3.5" />
                  {isUpdatingPassword ? "Updating Password..." : "Update Password"}
                </button>
              </form>
            ) : (
              <p className="text-xs text-slate-400 font-mono">
                Your account is secured with email + password authentication.
              </p>
            )}
          </div>

          {/* User's Created Reactions / Clips */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-mono uppercase tracking-wider text-slate-400 flex items-center gap-1.5 font-bold">
                <Film className="w-3.5 h-3.5 text-indigo-400" />
                Your Loops ({userClips.length})
              </h3>
            </div>

            {userClips.length === 0 ? (
              <div className="p-8 text-center bg-slate-950/40 border border-dashed border-slate-800 rounded-xl">
                <Film className="w-8 h-8 text-slate-600 mx-auto mb-2 opacity-60" />
                <p className="text-xs text-slate-400 font-mono">You haven't posted any loops yet.</p>
                <p className="text-[11px] text-slate-500 font-mono mt-1">
                  Create a new loop reaction or reply to a thread to see it here.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 max-h-64 overflow-y-auto pr-1 custom-scrollbar">
                {userClips.map((clip) => (
                  <button
                    key={clip.id}
                    onClick={() => {
                      if (onClipSelect) {
                        onClipSelect(clip.parentId || clip.id);
                        onClose();
                      }
                    }}
                    className="group relative aspect-[9/12] bg-slate-950 rounded-xl overflow-hidden border border-slate-800 hover:border-indigo-500/60 transition-all text-left flex flex-col justify-end p-2.5 cursor-pointer shadow-sm active:scale-95"
                  >
                    {/* Media backdrop */}
                    {clip.mediaUrl.match(/\.(mp4|webm|mov)(\?.*)?$/i) ? (
                      <video
                        src={clip.mediaUrl}
                        className="absolute inset-0 w-full h-full object-cover opacity-60 group-hover:opacity-80 transition-opacity"
                        muted
                        playsInline
                        loop
                      />
                    ) : (
                      <img
                        src={clip.mediaUrl}
                        alt="reaction"
                        className="absolute inset-0 w-full h-full object-cover opacity-60 group-hover:opacity-80 transition-opacity"
                      />
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/30 to-transparent" />

                    {/* Tone Tag */}
                    <div className="relative z-10 flex items-center justify-between w-full mb-1">
                      <span className="text-[9px] font-mono font-bold px-1.5 py-0.5 rounded bg-black/60 border border-slate-700/60 text-indigo-300 uppercase">
                        {clip.tone}
                      </span>
                      {clip.parentId && (
                        <span className="text-[9px] font-mono text-slate-400 bg-black/60 px-1 rounded">
                          reply
                        </span>
                      )}
                    </div>

                    {/* Dialogue Text */}
                    <p className="relative z-10 text-[11px] font-sans font-medium text-white line-clamp-2 leading-tight">
                      "{clip.voiceText || "Reaction Loop"}"
                    </p>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-800 bg-slate-950/60 flex items-center justify-between">
          <button
            onClick={handleSignOutClick}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-rose-950/40 hover:bg-rose-900/60 border border-rose-800/60 text-rose-300 text-xs font-mono font-bold transition-all active:scale-95 cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5" />
            Sign out
          </button>
          
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-mono font-bold transition-all active:scale-95 cursor-pointer"
          >
            Close
          </button>
        </div>
      </motion.div>
    </div>
  );
}
