import React, { useState, useEffect } from "react";
import { 
  Film, Sparkles, RefreshCw, Plus, Heart, MessageCircle, HelpCircle, 
  Volume2, Settings, MessageSquare, Flame, CheckCircle, Info, Star,
  ShieldCheck, ArrowUpCircle, UserCheck, Trash2, ShieldAlert
} from "lucide-react";
import { AnimatePresence } from "motion/react";
import ClipCard from "./components/ClipCard";
import RespondModal from "./components/RespondModal";
import ThreadView from "./components/ThreadView";
import FastReaxPanel from "./components/FastReaxPanel";
import SavedReactionsVault from "./components/SavedReactionsVault";
import OnboardingModal from "./components/OnboardingModal";
import AdminPanel from "./components/AdminPanel";
import { Clip, SavedReaction } from "./types";
import { generateUniqueId, loadAndSanitizeReactions, detectDuplicateIds } from "./utils/keyUtils";

export default function App() {
  const [clips, setClips] = useState<Clip[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // User auth state
  const [isLoggedIn, setIsLoggedIn] = useState(() => {
    return localStorage.getItem("reax_is_logged_in") === "true";
  });

  // Username State with automatic lazy loading from localStorage
  const [username, setUsername] = useState(() => {
    let stored = localStorage.getItem("clips_username");
    const logged = localStorage.getItem("reax_is_logged_in") === "true";
    if (stored) {
      // Clean guest prefixes if they logged in
      if (logged && stored.startsWith("~")) {
        stored = stored.substring(1);
        localStorage.setItem("clips_username", stored);
      } else if (!logged && !stored.startsWith("~")) {
        stored = "~" + stored;
        localStorage.setItem("clips_username", stored);
      }
      return stored;
    }
    const funnyPrefixes = ["HyperReact", "WaveLooper", "VibeSurfer", "GigaMeme", "LoopMaster", "ChaosPilot", "Dramatist", "SarcasticScribe"];
    const baseName = funnyPrefixes[Math.floor(Math.random() * funnyPrefixes.length)] + Math.floor(Math.random() * 899 + 100);
    const generated = logged ? baseName : "~" + baseName;
    localStorage.setItem("clips_username", generated);
    return generated;
  });
  
  const [isEditingUsername, setIsEditingUsername] = useState(false);
  const [tempUsername, setTempUsername] = useState(username);

  // Onboarding & Age constraint states
  const [ageConfirmed, setAgeConfirmed] = useState(() => {
    return localStorage.getItem("reax_age_confirmed") === "true";
  });
  const [isUpgradeModalOpen, setIsUpgradeModalOpen] = useState(false);
  const [upgradeTriggerReason, setUpgradeTriggerReason] = useState<"save_reaction" | "post_limit" | "edit_username" | "nav_click" | null>(null);

  const saveUsername = () => {
    const clean = tempUsername.trim().replace(/[^a-zA-Z0-9_]/g, "");
    if (clean) {
      setUsername(clean);
      localStorage.setItem("clips_username", clean);
      window.dispatchEvent(new CustomEvent("reax_toast", { detail: { message: `Username updated to @${clean}!` } }));
    }
    setIsEditingUsername(false);
  };

  const handleLoginSuccess = (newUsername: string) => {
    localStorage.setItem("reax_is_logged_in", "true");
    localStorage.setItem("clips_username", newUsername);
    setIsLoggedIn(true);
    setUsername(newUsername);
    setTempUsername(newUsername);
    
    // Automatically confirm age since they signed up with 13+ check
    localStorage.setItem("reax_age_confirmed", "true");
    setAgeConfirmed(true);

    window.dispatchEvent(new CustomEvent("reax_toast", { detail: { message: `🎉 Successfully signed in as @${newUsername}!` } }));
    // Dispatch a sync event to redraw everything
    window.dispatchEvent(new Event("reax_saved_changed"));
    setRefreshTrigger(prev => prev + 1);
  };

  const handleLogout = () => {
    localStorage.removeItem("reax_is_logged_in");
    setIsLoggedIn(false);
    
    // Generate new guest name
    const funnyPrefixes = ["HyperReact", "WaveLooper", "VibeSurfer", "GigaMeme", "LoopMaster", "ChaosPilot", "Dramatist", "SarcasticScribe"];
    const baseName = funnyPrefixes[Math.floor(Math.random() * funnyPrefixes.length)] + Math.floor(Math.random() * 899 + 100);
    const guestName = "~" + baseName;
    localStorage.setItem("clips_username", guestName);
    setUsername(guestName);
    setTempUsername(guestName);
    
    window.dispatchEvent(new CustomEvent("reax_toast", { detail: { message: "Signed out. You are now browsing as a Guest." } }));
    window.dispatchEvent(new Event("reax_saved_changed"));
    setRefreshTrigger(prev => prev + 1);
  };


  // Modals & Navigation
  const [selectedThreadRootId, setSelectedThreadRootId] = useState<string | null>(null);
  const [replyParent, setReplyParent] = useState<Clip | null>(null);
  const [respondTone, setRespondTone] = useState<Clip["tone"] | null>(null);
  const [isRespondModalOpen, setIsRespondModalOpen] = useState(false);
  const [isVaultOpen, setIsVaultOpen] = useState(false);
  const [isAdminOpen, setIsAdminOpen] = useState(false);
  const [isAdminAuthOpen, setIsAdminAuthOpen] = useState(false);
  const [enteredPasscode, setEnteredPasscode] = useState("");
  const [adminAuthError, setAdminAuthError] = useState("");
  const [isVerifyingAdmin, setIsVerifyingAdmin] = useState(false);
  const [remixData, setRemixData] = useState<SavedReaction | null>(null);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [feedType, setFeedType] = useState<"trending" | "latest" | "most_reacted" | "audio_hot">("trending");

  // Fast Tap-to-Reax State
  const [fastReaxTarget, setFastReaxTarget] = useState<{ parentClip: Clip; tone: Clip["tone"] } | null>(null);

  // Toast & Documents State
  const [toasts, setToasts] = useState<{ id: string; message: string }[]>([]);
  const [activeDocsTab, setActiveDocsTab] = useState<"privacy" | "terms" | null>(null);

  // Global Toast event handler
  useEffect(() => {
    const handleToast = (e: Event) => {
      const customEvent = e as CustomEvent;
      const message = customEvent.detail?.message;
      if (message) {
        const id = Math.random().toString(36).substr(2, 9);
        setToasts((prev) => [...prev, { id, message }]);
        setTimeout(() => {
          setToasts((prev) => prev.filter((t) => t.id !== id));
        }, 3000);
      }
    };
    window.addEventListener("reax_toast", handleToast);
    return () => window.removeEventListener("reax_toast", handleToast);
  }, []);

  // Global Upgrade Event handler
  useEffect(() => {
    const handleUpgradeTrigger = (e: Event) => {
      const customEvent = e as CustomEvent;
      const reason = customEvent.detail?.reason || "nav_click";
      
      const logged = localStorage.getItem("reax_is_logged_in") === "true";
      if (logged) return;

      setUpgradeTriggerReason(reason);
      setIsUpgradeModalOpen(true);
    };
    
    window.addEventListener("reax_upgrade_trigger", handleUpgradeTrigger);
    return () => window.removeEventListener("reax_upgrade_trigger", handleUpgradeTrigger);
  }, []);

  // Monitor path and hash for administrative routes
  useEffect(() => {
    const handleUrlCheck = async () => {
      const isPathAdmin = window.location.pathname === "/admin";
      const isHashAdmin = window.location.hash === "#admin";
      
      if (isPathAdmin || isHashAdmin) {
        const storedPasscode = localStorage.getItem("reax_admin_passcode");
        if (storedPasscode) {
          // Attempt silent background verification
          try {
            const res = await fetch("/api/admin/verify", {
              headers: { "X-Admin-Passcode": storedPasscode }
            });
            if (res.ok) {
              setIsAdminOpen(true);
              setIsAdminAuthOpen(false);
              return;
            }
          } catch (e) {
            console.error("Silent verification error:", e);
          }
        }
        // If passcode is missing or invalid, open auth dialog
        setIsAdminAuthOpen(true);
      } else {
        setIsAdminAuthOpen(false);
      }
    };

    handleUrlCheck();

    // Listen to route and hash changes
    window.addEventListener("popstate", handleUrlCheck);
    window.addEventListener("hashchange", handleUrlCheck);

    return () => {
      window.removeEventListener("popstate", handleUrlCheck);
      window.removeEventListener("hashchange", handleUrlCheck);
    };
  }, [isAdminOpen]);

  // Settings
  const [autoSpeakNew, setAutoSpeakNew] = useState(false);

  // Fetch all clips on mount & refresh
  useEffect(() => {
    // Sanitize localStorage once on mount
    loadAndSanitizeReactions();
  }, []);

  useEffect(() => {
    let active = true;
    setLoading(true);

    fetch("/api/clips")
      .then((res) => {
        if (!res.ok) throw new Error("Could not fetch reaction clips");
        return res.json();
      })
      .then((data) => {
        if (active) {
          // Deduplicate clips by id to prevent duplicate keys in lists
          const uniqueClips: Clip[] = [];
          const seenIds = new Set<string>();
          if (Array.isArray(data)) {
            detectDuplicateIds(data, (clip) => clip?.id, "AppClipsFetch");
            data.forEach((clip: Clip) => {
              if (clip && clip.id && !seenIds.has(clip.id)) {
                seenIds.add(clip.id);
                uniqueClips.push(clip);
              }
            });
          }
          setClips(uniqueClips);
          setError(null);
        }
      })
      .catch((err) => {
        console.error(err);
        if (active) {
          setError("Failed to load clips feed. Please check the backend connection.");
        }
      })
      .finally(() => {
        if (active) {
          setLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [refreshTrigger]);

  // Handle Like Action
  const handleLike = async (id: string) => {
    try {
      // Optimistic update
      setClips(prev => prev.map(c => c.id === id ? { ...c, likesCount: c.likesCount + 1 } : c));

      const res = await fetch(`/api/clips/${id}/like`, { method: "POST" });
      if (!res.ok) throw new Error("Failed to register like on server");
      const updatedClip = await res.json();
      
      // Update with authoritative server state
      setClips(prev => prev.map(c => c.id === id ? updatedClip : c));
    } catch (err) {
      console.error("Like error:", err);
    }
  };

  // Open Respond modal for a specific clip with an optional preselected tone
  const handleRespondToClip = (parentClip: Clip, tone: Clip["tone"] | null = null) => {
    setReplyParent(parentClip);
    setRespondTone(tone);
    setIsRespondModalOpen(true);
  };

  // Fast tap-to-reax pipeline handler
  const handleFastRespond = (parentClip: Clip, tone: Clip["tone"]) => {
    setFastReaxTarget({ parentClip, tone });
  };

  // Open full editor modal as fallback or customization option from fast panel
  const handleOpenFullCustomize = (parentClip: Clip, tone: Clip["tone"]) => {
    setFastReaxTarget(null);
    setReplyParent(parentClip);
    setRespondTone(tone);
    setIsRespondModalOpen(true);
  };

  // Open Respond modal to create a fresh Root Clip
  const handleCreateRootClip = () => {
    setReplyParent(null);
    setRespondTone(null);
    setIsRespondModalOpen(true);
  };

  // Post a saved reaction from the Vault directly to the feed or as a reply
  const handlePostSavedReaction = async (reax: SavedReaction, parentId: string | null = null) => {
    try {
      setLoading(true);
      const postRes = await fetch("/api/clips", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          parentId: parentId,
          mediaUrl: reax.mediaUrl,
          voiceText: reax.voiceText || "",
          tone: reax.tone,
          authorName: username.trim(),
          effect: reax.effect || "zoom",
          overlayText: reax.overlayText || "",
          originalAuthor: reax.originalAuthor || reax.authorName,
          remixedFrom: reax.remixedFrom || undefined
        })
      });

      if (!postRes.ok) throw new Error("Failed to post reaction");
      
      setIsVaultOpen(false);
      setRefreshTrigger(prev => prev + 1);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  // Find top 3 active chains (root clips sorted by total recursive comments/replies count under them)
  const getChainCount = (clipId: string): number => {
    let count = 0;
    const direct = clips.filter(c => c.parentId === clipId);
    count += direct.length;
    direct.forEach(child => {
      count += getChainCount(child.id);
    });
    return count;
  };

  // Find the most recent activity (latest descendant reply or root creation)
  const getThreadRecentActivity = (rootId: string): number => {
    const findDescendants = (parentId: string): Clip[] => {
      const direct = clips.filter(c => c.parentId === parentId);
      let list = [...direct];
      direct.forEach(child => {
        list = [...list, ...findDescendants(child.id)];
      });
      return list;
    };
    
    const rootClip = clips.find(c => c.id === rootId);
    if (!rootClip) return Date.now();
    
    const descendants = findDescendants(rootId);
    let latestTime = new Date(rootClip.createdAt).getTime();
    
    descendants.forEach(d => {
      const t = new Date(d.createdAt).getTime();
      if (t > latestTime) {
        latestTime = t;
      }
    });
    
    return latestTime;
  };

  // Dynamically compute the feed based on active algorithm
  const rootClips = React.useMemo(() => {
    const baseRoots = clips.filter((c) => c.parentId === null);
    
    switch (feedType) {
      case "latest":
        return [...baseRoots].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        
      case "most_reacted":
        return [...baseRoots].sort((a, b) => {
          const countA = getChainCount(a.id);
          const countB = getChainCount(b.id);
          if (countB !== countA) return countB - countA;
          // Fallback to recency
          return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        });
        
      case "audio_hot":
        // Filter: has custom voice recorded audio or speech overlay text
        return [...baseRoots]
          .filter(c => !!(c.voiceAudioData || c.voiceText))
          .sort((a, b) => {
            const countA = getChainCount(a.id);
            const countB = getChainCount(b.id);
            if (countB !== countA) return countB - countA;
            return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
          });
          
      case "trending":
      default:
        // Trending Score = Replies * 5 + Likes * 2 + Recent Activity
        return [...baseRoots].sort((a, b) => {
          const repliesA = getChainCount(a.id);
          const repliesB = getChainCount(b.id);
          
          const lastActivityA = getThreadRecentActivity(a.id);
          const lastActivityB = getThreadRecentActivity(b.id);
          
          const ageHoursA = (Date.now() - lastActivityA) / (1000 * 60 * 60);
          const ageHoursB = (Date.now() - lastActivityB) / (1000 * 60 * 60);
          
          // Recent Activity Score: 20 points max, decays dynamically based on hours since last activity
          const activityScoreA = 20 / (ageHoursA + 1);
          const activityScoreB = 20 / (ageHoursB + 1);
          
          const scoreA = (repliesA * 5) + (a.likesCount * 2) + activityScoreA;
          const scoreB = (repliesB * 5) + (b.likesCount * 2) + activityScoreB;
          
          return scoreB - scoreA;
        });
    }
  }, [clips, feedType]);

  const totalCommentsCount = clips.filter(c => c.parentId !== null).length;

  const activeChains = [...clips]
    .filter(c => c.parentId === null)
    .map(clip => ({
      clip,
      totalReplies: getChainCount(clip.id)
    }))
    .filter(item => item.totalReplies > 0)
    .sort((a, b) => b.totalReplies - a.totalReplies)
    .slice(0, 3);

  return (
    <div className="min-h-screen bg-transparent text-slate-100 flex flex-col font-sans selection:bg-indigo-500/30 selection:text-white">
      
      {/* Header Bar */}
      <header className="sticky top-0 z-30 bg-[#08090c]/75 backdrop-blur-md border-b border-slate-800/30 px-4 py-3.5 shadow-sm">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          
          {/* Logo */}
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-600 to-rose-600 flex items-center justify-center shadow-lg shadow-indigo-500/10">
              <Film className="w-5.5 h-5.5 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="font-sans font-black text-xl tracking-tight text-white uppercase">Reax</span>
                <span className="px-1.5 py-0.5 rounded bg-indigo-500/10 border border-indigo-500/20 text-[9px] font-bold font-mono text-indigo-400">AI PRO</span>
              </div>
              <span className="text-[10px] text-slate-500 font-mono tracking-wider block -mt-0.5 uppercase">VISUAL REACTION CASING</span>
            </div>
          </div>

          {/* Core Stats & Navigation actions */}
          <div className="flex items-center gap-3">
            {/* Inline Username Editor */}
            {!isLoggedIn ? (
              <button 
                onClick={() => {
                  window.dispatchEvent(new CustomEvent("reax_upgrade_trigger", { detail: { reason: "edit_username" } }));
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-900/80 hover:bg-slate-800 border border-dashed border-slate-700/80 text-slate-400 hover:text-slate-200 font-mono text-xs rounded-xl transition-all active:scale-95"
                title="Click to upgrade guest profile and claim your username"
              >
                <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
                <span className="font-bold">{username}</span>
                <span className="text-[9px] px-1 bg-slate-950 border border-slate-800 rounded text-slate-500 font-bold ml-1 uppercase">Guest</span>
              </button>
            ) : isEditingUsername ? (
              <div className="flex items-center gap-1.5 bg-slate-900 border border-indigo-500/50 rounded-xl px-2.5 py-1.5">
                <span className="text-[11px] font-mono font-bold text-indigo-400">@</span>
                <input
                  type="text"
                  value={tempUsername}
                  onChange={(e) => setTempUsername(e.target.value.replace(/[^a-zA-Z0-9_]/g, ""))}
                  onBlur={saveUsername}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") saveUsername();
                  }}
                  className="bg-transparent text-[11px] font-mono text-white outline-none w-24 focus:ring-0"
                  maxLength={18}
                  autoFocus
                />
                <button onClick={saveUsername} className="text-[10px] font-bold text-emerald-400 font-mono">SAVE</button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <button 
                  onClick={() => {
                    setTempUsername(username);
                    setIsEditingUsername(true);
                  }}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-900 hover:bg-slate-850 border border-emerald-500/20 hover:border-emerald-500/40 text-emerald-400 font-mono text-xs rounded-xl transition-all active:scale-95 shadow-sm"
                  title="Click to edit your custom username"
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                  <span className="font-bold">@{username}</span>
                  <UserCheck className="w-3.5 h-3.5 text-emerald-400 ml-1 shrink-0" />
                </button>
                <button 
                  onClick={handleLogout}
                  className="p-1.5 bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-400 hover:text-rose-400 rounded-xl transition-colors cursor-pointer"
                  title="Sign Out"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            <div className="hidden sm:flex items-center gap-4 bg-slate-900/60 border border-slate-800 px-3.5 py-1.5 rounded-xl text-xs font-mono text-slate-400">
              <span className="flex items-center gap-1.5">
                <Flame className="w-3.5 h-3.5 text-rose-500" />
                <strong>{clips.length}</strong> loops
              </span>
              <div className="w-[1px] h-3.5 bg-slate-800" />
              <span>
                <strong>{totalCommentsCount}</strong> responses
              </span>
            </div>

            {/* Refresh */}
            <button 
              onClick={() => setRefreshTrigger(prev => prev + 1)}
              className="p-2 bg-slate-900 border border-slate-800 hover:border-slate-700 rounded-xl text-slate-400 hover:text-white transition-all active:scale-95"
              title="Refresh Loops Feed"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin text-indigo-400" : ""}`} />
            </button>

            {/* Reaction Vault Trigger */}
            <button 
              onClick={() => setIsVaultOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-900 hover:bg-slate-800 border border-amber-500/20 hover:border-amber-400 text-amber-400 hover:text-amber-300 font-bold text-xs rounded-xl transition-all shadow-sm active:scale-95 cursor-pointer uppercase tracking-wider font-mono"
              title="Open My Reaction Templates Vault"
            >
              <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" /> My Templates
            </button>

             {/* Main Action Call - High-visibility CTA button for starting thread */}
            <button
              onClick={handleCreateRootClip}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs rounded-xl transition-all shadow-md active:scale-95 cursor-pointer uppercase tracking-wider font-mono border border-indigo-500 hover:border-indigo-400"
            >
              <Plus className="w-3.5 h-3.5" /> Start Reaction
            </button>
          </div>

        </div>
      </header>

      {/* Hero Guidelines Section */}
      <section className="bg-gradient-to-b from-indigo-950/10 via-slate-950/5 to-transparent py-10 px-4">
        <div className="max-w-3xl mx-auto text-center space-y-4">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-gradient-to-r from-indigo-500/10 to-rose-500/10 border border-indigo-500/15 rounded-full text-[10px] font-black font-mono text-indigo-300 uppercase tracking-widest shadow-sm">
            <Sparkles className="w-3 h-3 text-indigo-400 animate-pulse" /> Social Visual Chaining
          </div>
          <h1 className="font-sans font-black text-2xl md:text-3xl text-white tracking-tight max-w-2xl mx-auto leading-[1.15] uppercase bg-gradient-to-b from-white via-white to-slate-400 bg-clip-text text-transparent">
            Create audio memes with photos, <br className="hidden sm:inline" /> short videos, captions, and your own voice.
          </h1>
          <p className="text-xs text-slate-400 max-w-lg mx-auto leading-relaxed font-normal">
            Express yourself with customizable video or picture loops. Record your voice, add visual effects, or use optional AI tools to generate audio speech synthesis when you're stuck!
          </p>

          <div className="flex justify-center flex-wrap gap-x-6 gap-y-2 pt-2 text-[10px] font-mono text-slate-400 font-semibold">
            <span className="flex items-center gap-1.5 bg-slate-900/60 border border-slate-800/40 px-2.5 py-1 rounded-full"><CheckCircle className="w-3.5 h-3.5 text-emerald-400" /> Real Voice Recording</span>
            <span className="flex items-center gap-1.5 bg-slate-900/60 border border-slate-800/40 px-2.5 py-1 rounded-full"><CheckCircle className="w-3.5 h-3.5 text-emerald-400" /> Custom Meme Captions</span>
            <span className="flex items-center gap-1.5 bg-slate-900/60 border border-slate-800/40 px-2.5 py-1 rounded-full"><CheckCircle className="w-3.5 h-3.5 text-emerald-400" /> Optional AI Assistant</span>
          </div>
        </div>
      </section>

      {/* Main Content Area */}
      <main className="flex-1 max-w-3xl w-full mx-auto px-4 py-8 space-y-6">

        {/* E. Onboarding Welcome Banner (LAUNCH CRITICAL) */}
        <div className="bg-gradient-to-r from-amber-500/10 via-indigo-950/5 to-slate-950/60 border border-amber-500/5 rounded-2xl p-4 flex items-center gap-3.5 shadow-[0_8px_32px_rgba(0,0,0,0.2)] relative overflow-hidden">
          <div className="absolute top-0 right-0 w-24 h-24 bg-amber-500/5 rounded-full blur-xl pointer-events-none" />
          <div className="w-9 h-9 rounded-xl bg-amber-500/10 flex items-center justify-center text-amber-400 flex-shrink-0 animate-pulse text-base font-mono border border-amber-500/10">
            ⚡
          </div>
          <div className="flex-1 min-w-0">
            <h4 className="text-xs font-black text-slate-100 uppercase tracking-wider font-sans">
              Tap a tone to respond instantly. No comments — only reactions.
            </h4>
            <p className="text-[10px] text-slate-400 mt-0.5 leading-relaxed font-sans">
              Click any reaction's 1-Tap button to respond instantly with custom AI audio speech synthesis & motion effects. <span className="text-amber-400 font-bold">Tip: Save reactions to reuse them later!</span>
            </p>
          </div>
        </div>
        
        {/* Error notification */}
        {error && (
          <div className="bg-red-500/10 border border-red-500/10 text-red-200 p-4 rounded-2xl text-xs flex items-center gap-3">
            <Info className="w-5 h-5 text-red-400 flex-shrink-0" />
            <div className="flex-1">
              <span className="font-bold">Database Sync Error:</span> {error}
            </div>
            <button 
              onClick={() => setRefreshTrigger(prev => prev + 1)}
              className="px-3 py-1 bg-red-500/20 hover:bg-red-500/30 font-semibold rounded-lg transition-colors"
            >
              Retry
            </button>
          </div>
        )}
 
        {/* 🔥 ACTIVE CHAINS / ENTRY HOOKS (START HERE) */}
        {!loading && activeChains.length > 0 && (
          <div className="bg-gradient-to-br from-indigo-950/20 to-slate-900/60 rounded-3xl p-5 space-y-3.5 shadow-xl relative overflow-hidden">
            <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/5 rounded-full blur-2xl pointer-events-none" />
            
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-mono font-black text-rose-400 uppercase tracking-widest flex items-center gap-1.5 bg-rose-500/5 px-2 py-0.5 rounded-full border border-rose-500/10">
                <span className="inline-block w-1.5 h-1.5 rounded-full bg-rose-500 animate-ping" />
                🔥 START HERE: ACTIVE DISCUSSION CHAINS
              </span>
              <span className="text-[9px] text-slate-500 font-mono font-black uppercase">
                Jump In ➔
              </span>
            </div>
            
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {activeChains.map(({ clip, totalReplies }, index) => {
                const isClipVideo = clip.mediaUrl.endsWith(".mp4") || clip.mediaUrl.endsWith(".webm") || clip.mediaUrl.includes("mixkit-");
                return (
                  <div 
                    key={`chain-${clip.id}`}
                    onClick={() => setSelectedThreadRootId(clip.id)}
                    className="bg-slate-900/35 backdrop-blur-md border border-slate-800/60 hover:border-indigo-500/40 rounded-2xl p-3 flex flex-col justify-between cursor-pointer group transition-all duration-300 relative overflow-hidden active:scale-95 shadow-xl glass-panel-hover"
                  >
                    <div className="absolute top-2.5 right-2.5 z-10">
                      <span className="px-1.5 py-0.5 rounded text-[8px] font-mono font-black bg-indigo-500/20 text-indigo-300 border border-indigo-500/25 uppercase">
                        💬 {totalReplies} reaction{totalReplies !== 1 ? "s" : ""}
                      </span>
                    </div>

                    {/* Tiny Thumbnail container - video bug patched */}
                    <div className="aspect-video w-full rounded-xl bg-slate-900 overflow-hidden relative mb-2 flex items-center justify-center border border-slate-950">
                      {isClipVideo ? (
                        <video 
                          src={clip.mediaUrl} 
                          className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" 
                          muted 
                          playsInline 
                        />
                      ) : (
                        <img 
                          src={clip.mediaUrl} 
                          className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" 
                          alt=""
                          referrerPolicy="no-referrer"
                        />
                      )}
                      {clip.overlayText && (
                        <div className="absolute inset-0 bg-black/45 flex items-center justify-center p-1">
                          <span className="text-[9px] font-sans font-black text-white text-center uppercase truncate w-full tracking-wider drop-shadow-md">
                            {clip.overlayText}
                          </span>
                        </div>
                      )}
                    </div>

                    <div className="space-y-1">
                      <span className="text-[10px] text-slate-300 block truncate font-bold">
                        @{clip.authorName}
                      </span>
                      <span className="text-[9px] font-mono text-indigo-400 group-hover:text-indigo-300 block uppercase font-black tracking-wide flex items-center gap-0.5">
                        ENTER CASCADE ➔
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Algo Feed Navigation Tabs */}
        {!loading && clips.length > 0 && (
          <div className="bg-slate-900/60 border border-slate-800/20 rounded-2xl p-4 space-y-3 shadow-lg">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800/20 pb-3">
              <div className="space-y-0.5">
                <span className="block text-[10px] font-mono font-black text-indigo-400 uppercase tracking-widest">
                  🎛️ FEED DISCOVERY ENGINES
                </span>
                <span className="block text-xs font-bold text-slate-200">
                  Select your curation algorithm
                </span>
              </div>
              
              {/* Active Tag */}
              <div className="flex items-center gap-1.5 self-start sm:self-center">
                <span className="inline-block w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                <span className="text-[10px] font-mono font-bold text-slate-400 bg-slate-950 px-2 py-0.5 rounded-md uppercase">
                  Algo: {feedType.replace("_", " ")}
                </span>
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-1.5">
              {[
                { id: "trending" as const, label: "🔥 Trending", desc: "Likes & replies velocity with chronological decay" },
                { id: "latest" as const, label: "🆕 Latest", desc: "Strictly newest root conversations first" },
                { id: "most_reacted" as const, label: "💬 Most Reacted", desc: "Ranked by highest total reply tree size" },
                { id: "audio_hot" as const, label: "🎤 Audio Hot", desc: "Only loops containing voice or AI speech accents" },
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setFeedType(tab.id)}
                  className={`flex flex-col items-start p-2.5 rounded-xl border text-left transition-all relative cursor-pointer group active:scale-95 ${
                    feedType === tab.id
                      ? "bg-indigo-600/15 border-indigo-500 text-indigo-200"
                      : "bg-slate-950/45 border-slate-900/60 hover:border-slate-800 hover:bg-slate-900/40 text-slate-400 hover:text-slate-200"
                  }`}
                >
                  <span className="text-xs font-extrabold tracking-tight block">
                    {tab.label}
                  </span>
                  <span className="text-[9px] text-slate-500 block leading-tight mt-0.5 group-hover:text-slate-400 transition-colors">
                    {tab.desc}
                  </span>
                </button>
              ))}
            </div>

            {/* Live Formula Inspector Code Block */}
            <div className="bg-slate-950/80 border border-slate-900 rounded-xl p-2.5 font-mono text-[9px] leading-relaxed text-slate-400">
              <span className="block text-slate-500 font-bold mb-1 uppercase tracking-wider text-[8px]">
                ⚙️ ACTIVE ALGORITHM FORMULA CODE BLOCK:
              </span>
              {feedType === "trending" && (
                <div>
                  <p className="text-indigo-300 font-bold">Trending Score = (Replies * 5) + (Likes * 2) + Recent Activity</p>
                  <p className="text-slate-500 mt-1">✓ Weighting: Replies represent direct voice/meme interactions and are heavily weighted (+5 pts) over passive likes (+2 pts).</p>
                  <p className="text-slate-500">✓ Recent Activity: Added dynamic freshness boost (max +20 pts) based on the latest reply in the thread cascade.</p>
                </div>
              )}
              {feedType === "latest" && (
                <div>
                  <p className="text-indigo-300 font-bold">query = SELECT * FROM clips WHERE parent_id IS NULL ORDER BY created_at DESC</p>
                  <p className="text-slate-500 mt-1">✓ Chronological: No bias, no weights, no personalization. Simply tracking direct time elapsed since the loop was initiated.</p>
                </div>
              )}
              {feedType === "most_reacted" && (
                <div>
                  <p className="text-indigo-300 font-bold">sort = b.reply_chain_count - a.reply_chain_count</p>
                  <p className="text-slate-500 mt-1">✓ Chain Size: Tallies the absolute recursive tree depth. Good for finding highly conversational, multi-author cascades of loops.</p>
                </div>
              )}
              {feedType === "audio_hot" && (
                <div>
                  <p className="text-indigo-300 font-bold">filter = clips.has_voice_audio || clips.has_tts_overlay</p>
                  <p className="text-slate-500 mt-1">✓ Voice Priority: Elevates threads that utilized real vocal track recording or our high-quality custom emotional AI speaking styles.</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Loading feed list placeholder */}
        {loading && clips.length === 0 ? (
          <div className="space-y-4">
            {[1, 2].map((i) => (
              <div key={i} className="bg-slate-900/40 border border-slate-800/60 rounded-2xl p-5 space-y-4 animate-pulse">
                <div className="flex gap-3">
                  <div className="w-9 h-9 rounded-full bg-slate-800" />
                  <div className="space-y-2 flex-1">
                    <div className="h-3 bg-slate-800 rounded w-1/4" />
                    <div className="h-2 bg-slate-800 rounded w-1/6" />
                  </div>
                </div>
                <div className="aspect-video bg-slate-800/80 rounded-xl" />
                <div className="h-2.5 bg-slate-800 rounded w-3/4" />
              </div>
            ))}
          </div>
        ) : rootClips.length === 0 ? (
          /* Contextual Empty State */
          <div className="text-center py-12 bg-slate-900/20 border border-slate-800/40 rounded-3xl p-8 space-y-4">
            <div className="w-14 h-14 rounded-2xl bg-slate-900 border border-slate-800 flex items-center justify-center mx-auto text-slate-500 text-lg">
              {feedType === "audio_hot" ? "🎤" : "🎬"}
            </div>
            <div className="space-y-1.5">
              <h3 className="text-sm font-bold text-white">No loops fit this algorithm</h3>
              <p className="text-xs text-slate-400 max-w-sm mx-auto leading-relaxed">
                {feedType === "audio_hot" 
                  ? "None of the active conversation threads have custom voice recordings or AI speech accents yet. Be the first to add one!"
                  : "No loops have been posted to this feed tab yet."}
              </p>
            </div>
            {feedType === "audio_hot" ? (
              <button
                onClick={handleCreateRootClip}
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs rounded-xl shadow-lg transition-all uppercase tracking-wider font-mono"
              >
                <Plus className="w-3.5 h-3.5" /> Start Voice Loop
              </button>
            ) : (
              <button
                onClick={() => setFeedType("latest")}
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-xs rounded-xl shadow-md transition-all uppercase tracking-wider font-mono"
              >
                Go to Latest Feed
              </button>
            )}
          </div>
        ) : (
          /* Loops feed list */
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <span className="text-xs font-mono font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-pulse" />
                {feedType.replace("_", " ").toUpperCase()} FEED ({rootClips.length})
              </span>
              <span className="text-[10px] text-slate-500 font-mono uppercase">
                Sorted by {feedType === "trending" ? "Velocity score" : (feedType === "most_reacted" ? "Tree reply depth" : "Date stamp")}
              </span>
            </div>

            <div className="space-y-6">
              {rootClips.map((clip) => (
                <ClipCard
                  key={`clip-${clip.id}`}
                  clip={clip}
                  allClips={clips}
                  onLike={handleLike}
                  onRespond={handleRespondToClip}
                  onRespondWithTone={handleFastRespond}
                  onRespondWithSaved={(parentClip, reax) => handlePostSavedReaction(reax, parentClip.id)}
                  onViewThread={(id) => setSelectedThreadRootId(id)}
                />
              ))}
            </div>
          </div>
        )}

      </main>

      {/* Footer Branding */}
      <footer className="bg-slate-950 border-t border-slate-900 py-6 text-center text-[10px] font-mono text-slate-600 space-y-2.5">
        <p>REAX © 2026 — SECURE CLIENT-SERVER AI AGENT</p>
        <div className="flex justify-center gap-4 text-slate-500 text-[9.5px]">
          <button onClick={() => setActiveDocsTab("privacy")} className="hover:text-amber-400 transition-colors cursor-pointer">Privacy Policy</button>
          <span>•</span>
          <button onClick={() => setActiveDocsTab("terms")} className="hover:text-amber-400 transition-colors cursor-pointer">Terms of Service</button>
        </div>
      </footer>

      {/* Modals & Overlays */}
      <AnimatePresence>
        
        {/* CREATE / RESPOND MODAL */}
        {isRespondModalOpen && (
          <RespondModal
            key="respond-modal"
            parentId={replyParent ? replyParent.id : null}
            parentClip={replyParent || undefined}
            initialTone={respondTone}
            username={username}
            remixData={remixData}
            onClose={() => {
              setIsRespondModalOpen(false);
              setRemixData(null);
            }}
            onSuccess={() => {
              setIsRespondModalOpen(false);
              setRemixData(null);
              setRefreshTrigger((prev) => prev + 1);
            }}
          />
        )}

        {/* VERTICAL THREAD VIEW TIMELINE */}
        {selectedThreadRootId && (
          <ThreadView
            key="thread-view"
            rootClipId={selectedThreadRootId}
            clips={clips}
            onClose={() => setSelectedThreadRootId(null)}
            onLike={handleLike}
            onRespond={handleRespondToClip}
            onRespondWithTone={handleFastRespond}
            onRespondWithSaved={(parentClip, reax) => handlePostSavedReaction(reax, parentClip.id)}
          />
        )}

        {/* FAST TAP-TO-REPLY PIPELINE OVERLAY */}
        {fastReaxTarget && (
          <FastReaxPanel
            key="fast-reax-panel"
            parentClip={fastReaxTarget.parentClip}
            tone={fastReaxTarget.tone}
            username={username}
            onClose={() => setFastReaxTarget(null)}
            onSuccess={() => {
              setFastReaxTarget(null);
              setRefreshTrigger((prev) => prev + 1);
            }}
            onOpenFullCustomize={handleOpenFullCustomize}
          />
        )}

        {/* REACTION VAULT SLIDEOUT DRAWER */}
        {isVaultOpen && (
          <SavedReactionsVault
            key="saved-reactions-vault"
            onClose={() => setIsVaultOpen(false)}
            onPostReaction={handlePostSavedReaction}
            onRemixReaction={(reax) => {
              setRemixData(reax);
              setReplyParent(null);
              setRespondTone(reax.tone);
              setIsVaultOpen(false);
              setIsRespondModalOpen(true);
            }}
          />
        )}

        {/* PRIVACY POLICY & TERMS OF SERVICE DOCUMENT OVERLAYS */}
        {activeDocsTab && (
          <div key="docs-overlay" className="fixed inset-0 z-[100] bg-black/85 backdrop-blur-md flex items-center justify-center p-4">
            <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-2xl max-h-[85vh] overflow-y-auto p-6 md:p-8 relative shadow-2xl space-y-6">
              <button 
                onClick={() => setActiveDocsTab(null)}
                className="absolute top-4 right-4 text-slate-400 hover:text-white px-3 py-1 bg-slate-950 border border-slate-800 rounded-xl font-mono text-xs cursor-pointer"
              >
                Close ESC
              </button>

              {activeDocsTab === "privacy" ? (
                <div className="text-slate-300 space-y-4 text-xs md:text-sm leading-relaxed text-left">
                  <h2 className="text-xl font-sans font-black text-white tracking-tight uppercase">📄 Privacy Policy</h2>
                  <p className="font-mono text-[10px] text-slate-500">Effective Date: June 2026</p>
                  
                  <div>
                    <h3 className="font-bold text-white text-sm mt-3">1. Overview</h3>
                    <p>Reax (“we”, “our”, “us”) respects your privacy. This Privacy Policy explains what information we collect and how we use it.</p>
                  </div>

                  <div>
                    <h3 className="font-bold text-white text-sm mt-3">2. Information We Collect</h3>
                    <p>We may collect:</p>
                    <ul className="list-disc pl-5 mt-1 space-y-0.5">
                      <li>Username (if you create one)</li>
                      <li>Content you create (images, videos, reactions)</li>
                      <li>Usage data (interactions, clicks, engagement)</li>
                      <li>Device/browser information (for functionality and performance)</li>
                    </ul>
                  </div>

                  <div>
                    <h3 className="font-bold text-white text-sm mt-3">3. User Content</h3>
                    <p>By using Reax, you may upload:</p>
                    <ul className="list-disc pl-5 mt-1 space-y-0.5">
                      <li>photos</li>
                      <li>videos</li>
                      <li>audio (generated or recorded)</li>
                    </ul>
                    <p className="mt-1">This content may be stored, displayed publicly in the app, and visible to other users.</p>
                  </div>

                  <div>
                    <h3 className="font-bold text-white text-sm mt-3">4. How We Use Information</h3>
                    <p>We use data to operate and improve the app, generate AI-powered reactions, enable interaction between users, and monitor and prevent abuse.</p>
                  </div>

                  <div>
                    <h3 className="font-bold text-white text-sm mt-3">5. Sharing of Information</h3>
                    <p>We do not sell your personal data. We may share data with service providers (hosting, AI services), when required by law, or to enforce our Terms of Service.</p>
                  </div>

                  <div>
                    <h3 className="font-bold text-white text-sm mt-3">6. AI-Generated Content</h3>
                    <p>Reax uses AI to generate text overlays and voice audio based on user inputs and system prompts.</p>
                  </div>

                  <div>
                    <h3 className="font-bold text-white text-sm mt-3">7. Data Storage</h3>
                    <p>Content may be stored on remote servers, and some data may be stored locally (e.g., saved reactions). We take reasonable steps to secure your data.</p>
                  </div>

                  <div>
                    <h3 className="font-bold text-white text-sm mt-3">8. Your Rights</h3>
                    <p>You may request removal of content or stop using the service at any time.</p>
                  </div>

                  <div>
                    <h3 className="font-bold text-white text-sm mt-3">9. Children’s Privacy</h3>
                    <p>Reax is not intended for users under 13.</p>
                  </div>

                  <div>
                    <h3 className="font-bold text-white text-sm mt-3">10. Changes to Policy</h3>
                    <p>We may update this policy. Continued use means acceptance.</p>
                  </div>

                  <div>
                    <h3 className="font-bold text-white text-sm mt-3">11. Contact</h3>
                    <p>For questions, contact: <span className="text-amber-400 font-mono">support@reax.co</span></p>
                  </div>
                </div>
              ) : (
                <div className="text-slate-300 space-y-4 text-xs md:text-sm leading-relaxed text-left">
                  <h2 className="text-xl font-sans font-black text-white tracking-tight uppercase">📄 Terms of Service</h2>
                  <p className="font-mono text-[10px] text-slate-500">Effective Date: June 2026</p>

                  <div>
                    <h3 className="font-bold text-white text-sm mt-3">1. Acceptance</h3>
                    <p>By using Reax, you agree to these Terms. If you do not agree, do not use the app.</p>
                  </div>

                  <div>
                    <h3 className="font-bold text-white text-sm mt-3">2. User Content Responsibility</h3>
                    <p>You are responsible for content you upload. You agree that you own or have rights to the content, your content does not violate laws or rights, and your content is not abusive, illegal, or harmful.</p>
                  </div>

                  <div>
                    <h3 className="font-bold text-white text-sm mt-3">3. Content Usage License</h3>
                    <p>By posting on Reax, you grant us a non-exclusive license to display your content, distribute it within the app, and use it to operate and improve the platform.</p>
                  </div>

                  <div>
                    <h3 className="font-bold text-white text-sm mt-3">4. Remixing & Attribution</h3>
                    <p>Reax allows reuse and remixing of content. Your content may be reused by others and attribution may be displayed automatically. You agree to this behavior by using the app.</p>
                  </div>

                  <div>
                    <h3 className="font-bold text-white text-sm mt-3">5. Prohibited Content</h3>
                    <p>You may NOT upload illegal content, copyrighted material you do not own, harmful or abusive material, or content that violates others’ rights.</p>
                  </div>

                  <div>
                    <h3 className="font-bold text-white text-sm mt-3">6. Content Removal</h3>
                    <p>We may remove content that violates these terms, is reported by users, or poses risk to the platform.</p>
                  </div>

                  <div>
                    <h3 className="font-bold text-white text-sm mt-3">7. Account/Usernames</h3>
                    <p>You are responsible for your username. We may reclaim or remove usernames if needed.</p>
                  </div>

                  <div>
                    <h3 className="font-bold text-white text-sm mt-3">8. No Guarantees</h3>
                    <p>Reax is provided “as is.” We do not guarantee uninterrupted access or permanent storage of content.</p>
                  </div>

                  <div>
                    <h3 className="font-bold text-white text-sm mt-3">9. Limitation of Liability</h3>
                    <p>We are not liable for user-generated content, loss of data, or damages from use of the app.</p>
                  </div>

                  <div>
                    <h3 className="font-bold text-white text-sm mt-3">10. Termination</h3>
                    <p>We may restrict or terminate access at any time if terms are violated.</p>
                  </div>

                  <div>
                    <h3 className="font-bold text-white text-sm mt-3">11. Changes</h3>
                    <p>We may update these Terms. Continued use = acceptance.</p>
                  </div>

                  <div>
                    <h3 className="font-bold text-white text-sm mt-3">12. Contact</h3>
                    <p>For questions, contact: <span className="text-amber-400 font-mono">support@reax.co</span></p>
                  </div>
                </div>
              )}
              
              <div className="pt-4 border-t border-slate-800 text-center">
                <button 
                  onClick={() => setActiveDocsTab(null)}
                  className="px-6 py-2 bg-indigo-600 hover:bg-indigo-500 font-bold text-xs text-white rounded-xl uppercase tracking-wider transition-colors cursor-pointer"
                >
                  I Understand
                </button>
              </div>
            </div>
          </div>
        )}

        {/* LIGHTWEIGHT AGE CONFIRMATION BANNER */}
        {!ageConfirmed && (
          <div key="age-confirmation-banner" className="fixed bottom-6 left-6 z-[95] max-w-sm w-full bg-slate-900 border border-indigo-500/10 rounded-2xl p-4 shadow-[0_8px_32px_rgba(0,0,0,0.6)] flex flex-col gap-3 animate-fade-in border-slate-800">
            <div className="flex gap-2.5">
              <ShieldCheck className="w-5 h-5 text-indigo-400 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <h4 className="text-xs font-bold text-slate-200">Reax Compliance (Ages 13+)</h4>
                <p className="text-[10px] text-slate-400 leading-normal">
                  To keep the Reax loop safe and fun, we require all users to be 13 or older. By continuing, you confirm your age.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 justify-end">
              <button 
                onClick={() => {
                  localStorage.setItem("reax_age_confirmed", "true");
                  setAgeConfirmed(true);
                  window.dispatchEvent(new CustomEvent("reax_toast", { detail: { message: "Age requirements confirmed! Let's React 🚀" } }));
                }}
                className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white font-mono font-bold text-[10px] rounded-lg tracking-wider uppercase transition-all hover:scale-102 cursor-pointer"
              >
                I am 13+ / Agree
              </button>
            </div>
          </div>
        )}

        {/* ADMIN CONTROL PANEL OVERLAY MODAL */}
        {isAdminOpen && (
          <AdminPanel
            key="admin-control-panel-modal"
            onClose={() => {
              setIsAdminOpen(false);
              window.history.pushState({}, "", "/");
            }}
            allClips={clips}
            onRefreshClips={() => setRefreshTrigger(prev => prev + 1)}
            onSelectThread={(id) => {
              setIsAdminOpen(false);
              window.history.pushState({}, "", "/");
              setSelectedThreadRootId(id);
            }}
          />
        )}

        {/* ADMIN PASSCODE AUTHENTICATION DIALOG */}
        {isAdminAuthOpen && (
          <div className="fixed inset-0 z-50 bg-[#050608]/98 backdrop-blur-md flex items-center justify-center p-4">
            <div className="w-full max-w-sm bg-slate-950 border border-slate-900 rounded-3xl p-6 shadow-2xl relative overflow-hidden">
              {/* Slate accent light glow */}
              <div className="absolute top-0 left-1/2 -translate-x-1/2 w-48 h-[1px] bg-gradient-to-r from-transparent via-red-500/30 to-transparent" />
              
              <div className="text-center space-y-4">
                <div className="w-12 h-12 rounded-2xl bg-red-500/10 border border-red-500/20 flex items-center justify-center text-red-500 mx-auto">
                  <ShieldAlert className="w-6 h-6 animate-pulse" />
                </div>
                
                <div className="space-y-1">
                  <h3 className="font-sans font-black text-sm uppercase tracking-widest text-slate-100">
                    Admin Terminal
                  </h3>
                  <p className="text-[10px] text-slate-500 font-mono uppercase tracking-wider">
                    Enter passcode to unlock control panel
                  </p>
                </div>
                
                <form 
                  onSubmit={async (e) => {
                    e.preventDefault();
                    if (!enteredPasscode.trim()) return;
                    setIsVerifyingAdmin(true);
                    setAdminAuthError("");
                    
                    try {
                      const res = await fetch("/api/admin/verify", {
                        headers: { "X-Admin-Passcode": enteredPasscode }
                      });
                      if (res.ok) {
                        localStorage.setItem("reax_admin_passcode", enteredPasscode);
                        setIsAdminOpen(true);
                        setIsAdminAuthOpen(false);
                        setEnteredPasscode("");
                      } else {
                        setAdminAuthError("Access denied. Invalid passcode.");
                      }
                    } catch (err) {
                      setAdminAuthError("Network error. Try again.");
                    } finally {
                      setIsVerifyingAdmin(false);
                    }
                  }}
                  className="space-y-4 pt-2"
                >
                  <div className="space-y-1 text-left">
                    <label className="text-[9px] font-mono font-bold text-slate-500 uppercase tracking-wider block">
                      Secure Passcode
                    </label>
                    <input
                      type="password"
                      placeholder="••••••••"
                      value={enteredPasscode}
                      onChange={(e) => setEnteredPasscode(e.target.value)}
                      className="w-full px-4 py-2.5 bg-slate-900/60 border border-slate-800 rounded-xl font-mono text-xs text-center text-red-400 focus:outline-none focus:border-red-500/50 transition-colors placeholder-slate-700"
                      disabled={isVerifyingAdmin}
                      autoFocus
                    />
                  </div>
                  
                  {adminAuthError && (
                    <p className="text-[10px] font-mono text-red-400 text-center uppercase tracking-wider">
                      ⚠️ {adminAuthError}
                    </p>
                  )}
                  
                  <div className="grid grid-cols-2 gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => {
                        setIsAdminAuthOpen(false);
                        window.history.pushState({}, "", "/");
                      }}
                      className="py-2 bg-slate-900 hover:bg-slate-850 border border-slate-800 text-slate-400 hover:text-slate-300 rounded-xl text-[10px] font-mono font-bold transition-all active:scale-95 uppercase tracking-wider cursor-pointer"
                      disabled={isVerifyingAdmin}
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="py-2 bg-red-600 hover:bg-red-500 text-white rounded-xl text-[10px] font-mono font-bold transition-all active:scale-95 uppercase tracking-wider cursor-pointer disabled:opacity-50"
                      disabled={isVerifyingAdmin || !enteredPasscode.trim()}
                    >
                      {isVerifyingAdmin ? "Verifying..." : "Unlock"}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          </div>
        )}

      </AnimatePresence>

      {/* ONBOARDING & UPGRADE MODAL */}
      <OnboardingModal
        key="onboarding-modal"
        isOpen={isUpgradeModalOpen}
        onClose={() => {
          setIsUpgradeModalOpen(false);
          setUpgradeTriggerReason(null);
        }}
        onLoginSuccess={handleLoginSuccess}
        guestUsername={username}
        triggerReason={upgradeTriggerReason}
      />

      {/* FLOATING SUBTLE TOAST NOTIFICATION CONTAINER */}
      <div key="toast-container" className="fixed bottom-6 right-6 z-[120] flex flex-col gap-2 pointer-events-none max-w-sm w-full">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className="bg-slate-900 border border-amber-500/35 text-amber-300 font-sans font-semibold text-xs py-3 px-4 rounded-xl shadow-[0_4px_16px_rgba(245,158,11,0.15)] flex items-center justify-between gap-3 pointer-events-auto"
          >
            <span>{toast.message}</span>
            <button 
              onClick={() => setToasts((prev) => prev.filter((t) => t.id !== toast.id))}
              className="text-slate-400 hover:text-white font-bold leading-none font-mono text-[10px] cursor-pointer"
            >
              ✕
            </button>
          </div>
        ))}
      </div>

    </div>
  );
}
