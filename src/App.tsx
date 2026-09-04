import React, { useState, useEffect } from "react";
import { 
  Film, Sparkles, RefreshCw, Plus, Heart, MessageCircle, HelpCircle, 
  Volume2, Settings, MessageSquare, Flame, CheckCircle, Info, Star,
  ShieldCheck, ArrowUpCircle, UserCheck, Trash2, ShieldAlert, LogIn, LogOut, User,
  MoreVertical
} from "lucide-react";
import { AnimatePresence } from "motion/react";
import ClipCard from "./components/ClipCard";
import RespondModal from "./components/RespondModal";
import ThreadView from "./components/ThreadView";
import FastReaxPanel from "./components/FastReaxPanel";
import SavedReactionsVault from "./components/SavedReactionsVault";
import OnboardingModal from "./components/OnboardingModal";
import ProfilePanel from "./components/ProfilePanel";
import AdminPanel from "./components/AdminPanel";
import { Clip, SavedReaction } from "./types";
import { generateUniqueId, loadAndSanitizeReactions, detectDuplicateIds } from "./utils/keyUtils";
import { 
  getAuthToken, 
  fetchMyProfile, 
  syncUserProfile, 
  signOutSupabase, 
  handleUrlAuthTokens,
  getSupabaseClient 
} from "./utils/supabaseClient";

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

  // Profile Panel & Onboarding Modal states
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [isHeaderMenuOpen, setIsHeaderMenuOpen] = useState(false);
  const [isUpgradeModalOpen, setIsUpgradeModalOpen] = useState(false);
  const [upgradeTriggerReason, setUpgradeTriggerReason] = useState<"save_reaction" | "post_limit" | "edit_username" | "nav_click" | null>(null);

  // Age constraint state
  const [ageConfirmed, setAgeConfirmed] = useState(() => {
    return localStorage.getItem("reax_age_confirmed") === "true";
  });

  // Sync profile & handle auth URL tokens on mount
  useEffect(() => {
    let isMounted = true;

    async function initAuth() {
      // 1. Process URL tokens if user arrived via email confirmation link
      try {
        const urlAuth = await handleUrlAuthTokens();
        if (urlAuth.success) {
          setIsLoggedIn(true);
          localStorage.setItem("reax_is_logged_in", "true");
          localStorage.setItem("reax_age_confirmed", "true");
          setAgeConfirmed(true);

          if (urlAuth.username && isMounted) {
            setUsername(urlAuth.username);
            setTempUsername(urlAuth.username);
            localStorage.setItem("clips_username", urlAuth.username);
          }

          window.dispatchEvent(new CustomEvent("reax_toast", { detail: { message: "🎉 Successfully confirmed & signed in!" } }));
        }
      } catch (err) {
        console.warn("Error handling auth URL tokens on mount:", err);
      }

      // 2. Fetch profile from backend
      try {
        const { profile } = await fetchMyProfile();
        if (profile && isMounted) {
          setIsLoggedIn(true);
          localStorage.setItem("reax_is_logged_in", "true");
          if (profile.username) {
            setUsername(profile.username);
            setTempUsername(profile.username);
            localStorage.setItem("clips_username", profile.username);
          }
        }
      } catch (err) {
        console.warn("Could not fetch my profile on mount:", err);
      }
    }

    initAuth();

    return () => {
      isMounted = false;
    };
  }, []);

  const saveUsername = async () => {
    const clean = tempUsername.trim().replace(/[^a-zA-Z0-9_]/g, "");
    if (clean) {
      setUsername(clean);
      localStorage.setItem("clips_username", clean);
      if (isLoggedIn) {
        try {
          await syncUserProfile(clean);
        } catch (e) {
          console.warn("Could not sync username to backend:", e);
        }
      }
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

  const handleLogout = async () => {
    await signOutSupabase();
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
      const isHashProfile = window.location.hash === "#profile";
      
      if (isHashProfile) {
        const logged = localStorage.getItem("reax_is_logged_in") === "true";
        if (logged) {
          setIsProfileOpen(true);
        } else {
          setUpgradeTriggerReason("nav_click");
          setIsUpgradeModalOpen(true);
        }
      }

      if (isPathAdmin || isHashAdmin) {
        const storedPasscode = localStorage.getItem("reax_admin_passcode") || "";
        let token = "";
        try { token = await getAuthToken(); } catch {}

        if (storedPasscode || token) {
          // Attempt silent background verification
          try {
            const res = await fetch("/api/admin/verify", {
              headers: {
                ...(token ? { Authorization: `Bearer ${token}` } : {}),
                "X-Admin-Passcode": storedPasscode
              }
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
      .then(async (res) => {
        if (res.status === 503) {
          const errData = await res.json().catch(() => ({}));
          if (errData.error === "database_unconfigured") {
            throw new Error("DB not configured. Production database connection (Supabase) is required.");
          }
        }
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

      let token = "";
      try { token = await getAuthToken(); } catch {}

      const res = await fetch(`/api/clips/${id}/like`, {
        method: "POST",
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        }
      });
      if (!res.ok) throw new Error("Failed to register like on server");
      const updatedClip = await res.json();
      
      // Update with authoritative server state
      setClips(prev => prev.map(c => c.id === id ? updatedClip : c));
    } catch (err) {
      console.error("Like error:", err);
    }
  };

  // Handle Laugh Action (😂 primary humor metric)
  const handleLaugh = async (id: string) => {
    try {
      // Optimistic update
      setClips(prev => prev.map(c => c.id === id ? { ...c, laughsCount: (c.laughsCount || 0) + 1 } : c));

      let token = "";
      try { token = await getAuthToken(); } catch {}

      const res = await fetch(`/api/clips/${id}/laugh`, {
        method: "POST",
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        }
      });
      if (!res.ok) throw new Error("Failed to register laugh on server");
      const updatedClip = await res.json();
      
      // Update with authoritative server state
      setClips(prev => prev.map(c => c.id === id ? updatedClip : c));
    } catch (err) {
      console.error("Laugh error:", err);
    }
  };

  // Handle Author-Only Deletion (author can remove own reaction; thread creators CANNOT delete replies)
  const handleDeleteClip = async (id: string) => {
    try {
      const authorUsername = (username || localStorage.getItem("clips_username") || "").trim();
      let token = "";
      try { token = await getAuthToken(); } catch {}

      const res = await fetch(`/api/clips/${id}/user-delete`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify({ username: authorUsername })
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || "Failed to delete clip");
      }

      // Remove from client state
      setClips(prev => prev.filter(c => c.id !== id));
      window.dispatchEvent(new CustomEvent("reax_toast", { detail: { message: "Your reaction was removed." } }));
    } catch (err: any) {
      console.error("Delete error:", err);
      window.dispatchEvent(new CustomEvent("reax_toast", { detail: { message: err.message || "Could not delete clip." } }));
    }
  };

  // Open Respond modal for a specific clip with an optional preselected tone (Capture-first flow)
  const handleRespondToClip = (parentClip: Clip, tone: Clip["tone"] | null = null) => {
    setReplyParent(parentClip);
    setRespondTone(tone || parentClip.tone || "funny");
    setIsRespondModalOpen(true);
  };

  // Fast tap-to-reax pipeline handler - opens RespondModal directly at capture step
  const handleFastRespond = (parentClip: Clip, tone: Clip["tone"]) => {
    setReplyParent(parentClip);
    setRespondTone(tone);
    setIsRespondModalOpen(true);
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
      let token = "";
      try { token = await getAuthToken(); } catch {}

      const postRes = await fetch("/api/clips", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
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
          .filter(c => !!(c.voiceAudioData || c.voiceAudioUrl || c.voiceText))
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
      <header className="sticky top-0 z-30 bg-[#08090c]/85 backdrop-blur-md border-b border-slate-800/40 px-4 py-3 shadow-sm">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          
          {/* Left: Reax Wordmark */}
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-indigo-600 to-rose-600 flex items-center justify-center shadow-md shadow-indigo-500/15">
              <Film className="w-4.5 h-4.5 text-white" />
            </div>
            <span className="font-sans font-black text-xl tracking-tight text-white uppercase">Reax</span>
          </div>

          {/* Right: @username (opens Profile) OR Sign in, and + button */}
          <div className="flex items-center gap-2">
            {/* Subtle Refresh icon only */}
            <button 
              onClick={() => setRefreshTrigger(prev => prev + 1)}
              className="p-2 text-slate-400 hover:text-white rounded-xl hover:bg-slate-900 transition-colors cursor-pointer"
              title="Refresh feed"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin text-indigo-400" : ""}`} />
            </button>

            {/* @username (opens Profile) OR Sign in */}
            {isLoggedIn ? (
              <button 
                onClick={() => setIsProfileOpen(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-900 hover:bg-slate-800 border border-slate-800 hover:border-slate-700 text-slate-200 font-mono text-xs rounded-xl transition-all cursor-pointer"
                title="View Profile"
              >
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                <span className="font-bold">@{username}</span>
              </button>
            ) : (
              <button
                onClick={() => {
                  setUpgradeTriggerReason("nav_click");
                  setIsUpgradeModalOpen(true);
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-900 hover:bg-slate-800 border border-slate-800 hover:border-slate-700 text-slate-200 text-xs font-semibold rounded-xl transition-all cursor-pointer"
                title="Sign in or claim username"
              >
                <LogIn className="w-3.5 h-3.5 text-slate-400" />
                <span>Sign in</span>
              </button>
            )}

            {/* + Button to create a root loop */}
            <button
              onClick={handleCreateRootClip}
              className="flex items-center justify-center w-8 h-8 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold transition-all shadow-md active:scale-95 cursor-pointer"
              title="Create a reaction loop"
            >
              <Plus className="w-4 h-4" />
            </button>

            {/* Overflow menu for Vault / Admin / Sign out */}
            <div className="relative">
              <button
                onClick={() => setIsHeaderMenuOpen(!isHeaderMenuOpen)}
                className="p-1.5 text-slate-400 hover:text-white rounded-xl hover:bg-slate-900 transition-colors cursor-pointer"
                title="More options"
              >
                <MoreVertical className="w-4 h-4" />
              </button>

              {isHeaderMenuOpen && (
                <div 
                  className="absolute right-0 top-full mt-1.5 w-44 bg-slate-900/95 backdrop-blur-md border border-slate-800 rounded-xl shadow-2xl py-1 z-50 text-xs font-sans"
                  onClick={() => setIsHeaderMenuOpen(false)}
                >
                  <button
                    onClick={() => setIsVaultOpen(true)}
                    className="w-full px-3 py-2 text-left text-amber-300 hover:bg-slate-800/80 flex items-center gap-2 cursor-pointer font-medium"
                  >
                    <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
                    <span>My Templates</span>
                  </button>
                  <button
                    onClick={() => setIsAdminAuthOpen(true)}
                    className="w-full px-3 py-2 text-left text-slate-400 hover:bg-slate-800/80 flex items-center gap-2 cursor-pointer"
                  >
                    <ShieldCheck className="w-3.5 h-3.5" />
                    <span>Admin</span>
                  </button>
                  {isLoggedIn && (
                    <button
                      onClick={handleLogout}
                      className="w-full px-3 py-2 text-left text-rose-400 hover:bg-slate-800/80 flex items-center gap-2 cursor-pointer border-t border-slate-800/50"
                    >
                      <LogOut className="w-3.5 h-3.5" />
                      <span>Sign out</span>
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>

        </div>
      </header>

      {/* One short hero line at most */}
      <div className="text-center pt-5 pb-1 px-4 max-w-xl mx-auto">
        <p className="text-xs sm:text-sm text-slate-400 font-medium">
          Photo & video reaction loops. Tap any tone to respond.
        </p>
      </div>

      {/* Main Content Area */}
      <main className="flex-1 max-w-2xl w-full mx-auto px-4 py-4 space-y-4">
        
        {/* Error notification */}
        {error && (
          <div className="bg-red-500/10 border border-red-500/20 text-red-200 p-3 rounded-xl text-xs flex items-center gap-3">
            <Info className="w-4 h-4 text-red-400 flex-shrink-0" />
            <div className="flex-1">
              <span className="font-bold">Sync Error:</span> {error}
            </div>
            <button 
              onClick={() => setRefreshTrigger(prev => prev + 1)}
              className="px-2.5 py-1 bg-red-500/20 hover:bg-red-500/30 font-semibold rounded-lg transition-colors text-[11px]"
            >
              Retry
            </button>
          </div>
        )}

        {/* Minimal Feed Filter */}
        {!loading && clips.length > 0 && (
          <div className="flex items-center justify-center gap-3 text-xs font-medium text-slate-500 pb-1">
            <button 
              onClick={() => setFeedType("trending")}
              className={`transition-colors cursor-pointer ${feedType === "trending" ? "text-slate-100 font-bold" : "hover:text-slate-300"}`}
            >
              Trending
            </button>
            <span className="text-slate-700">•</span>
            <button 
              onClick={() => setFeedType("latest")}
              className={`transition-colors cursor-pointer ${feedType === "latest" ? "text-slate-100 font-bold" : "hover:text-slate-300"}`}
            >
              Latest
            </button>
            <span className="text-slate-700">•</span>
            <button 
              onClick={() => setFeedType("most_reacted")}
              className={`transition-colors cursor-pointer ${feedType === "most_reacted" ? "text-slate-100 font-bold" : "hover:text-slate-300"}`}
            >
              Most Reacted
            </button>
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
                  onLaugh={handleLaugh}
                  onLike={handleLike}
                  onDelete={handleDeleteClip}
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
            onLaugh={handleLaugh}
            onLike={handleLike}
            onDelete={handleDeleteClip}
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
                  <p className="font-mono text-[10px] text-slate-500">Effective: September 4, 2026</p>
                  
                  <p>Reax (“we”) runs getreax.com. This explains what we collect and why.</p>

                  <div>
                    <h3 className="font-bold text-white text-sm mt-3">What we collect</h3>
                    <ul className="list-disc pl-5 mt-1 space-y-1">
                      <li>Email and password if you create an account (password is stored as a hash by our auth provider)</li>
                      <li>Username and profile details you choose</li>
                      <li>Content you post: photos, short videos, captions, recorded voice</li>
                      <li>Guest / anonymous session ids if you post without an account</li>
                      <li>Basic device and log data needed to run the site (browser, errors, abuse signals)</li>
                    </ul>
                  </div>

                  <div>
                    <h3 className="font-bold text-white text-sm mt-3">What is public</h3>
                    <p>Loops you post are public. Other people can view, reply to, save, and remix them in the app.</p>
                  </div>

                  <div>
                    <h3 className="font-bold text-white text-sm mt-3">How we use it</h3>
                    <p>To operate Reax, show the feed and threads, store media, send confirm-email links, prevent abuse, and improve the product. We do not sell your personal information.</p>
                  </div>

                  <div>
                    <h3 className="font-bold text-white text-sm mt-3">Processors</h3>
                    <p>We use hosting and database providers (currently Vercel and Supabase) to store accounts, clips, and media. They process data only to provide those services.</p>
                  </div>

                  <div>
                    <h3 className="font-bold text-white text-sm mt-3">AI</h3>
                    <p>Reax does not send your posts to a paid AI API today. Optional on-device text-to-speech may read a caption you typed. If we add server AI later, we will update this policy.</p>
                  </div>

                  <div>
                    <h3 className="font-bold text-white text-sm mt-3">Storage</h3>
                    <p>Media lives on remote storage. Some preferences (saved reactions) stay in your browser. We do not promise forever storage.</p>
                  </div>

                  <div>
                    <h3 className="font-bold text-white text-sm mt-3">Your choices</h3>
                    <p>Delete your own clips in the app. Request account or content removal at the contact below. Stop using the service at any time.</p>
                  </div>

                  <div>
                    <h3 className="font-bold text-white text-sm mt-3">Children</h3>
                    <p>Not for anyone under 13.</p>
                  </div>

                  <div>
                    <h3 className="font-bold text-white text-sm mt-3">Changes</h3>
                    <p>We may update this policy. Continued use after a change means you accept the new version.</p>
                  </div>

                  <div>
                    <h3 className="font-bold text-white text-sm mt-3">Contact</h3>
                    <p>
                      <a href="mailto:team@watch1do1.com" className="text-amber-400 font-mono hover:underline">
                        team@watch1do1.com
                      </a>
                    </p>
                  </div>
                </div>
              ) : (
                <div className="text-slate-300 space-y-4 text-xs md:text-sm leading-relaxed text-left">
                  <h2 className="text-xl font-sans font-black text-white tracking-tight uppercase">📄 Terms of Service</h2>
                  <p className="font-mono text-[10px] text-slate-500">Effective: September 4, 2026</p>

                  <p>By using getreax.com you agree to these terms. If you don’t, don’t use Reax.</p>

                  <div>
                    <h3 className="font-bold text-white text-sm mt-3">Your content</h3>
                    <p>You own what you upload. You must have the right to post it. You must not post illegal, hateful, harassing, sexual-involving-minors, or infringing material.</p>
                  </div>

                  <div>
                    <h3 className="font-bold text-white text-sm mt-3">License to us</h3>
                    <p>You give Reax a non-exclusive license to host, display, and distribute your content inside the service so reactions and threads work.</p>
                  </div>

                  <div>
                    <h3 className="font-bold text-white text-sm mt-3">Remix</h3>
                    <p>Others may reply with new loops that reference your post. Attribution may show automatically. That is how the product works.</p>
                  </div>

                  <div>
                    <h3 className="font-bold text-white text-sm mt-3">Accounts</h3>
                    <p>You’re responsible for your username and password. We may reclaim names or remove accounts that break these terms. Guest posts are still bound by these rules.</p>
                  </div>

                  <div>
                    <h3 className="font-bold text-white text-sm mt-3">Moderation</h3>
                    <p>We may hide or delete content, including after a report. We may suspend access.</p>
                  </div>

                  <div>
                    <h3 className="font-bold text-white text-sm mt-3">No warranty</h3>
                    <p>Reax is provided “as is.” Uptime and permanent storage are not guaranteed.</p>
                  </div>

                  <div>
                    <h3 className="font-bold text-white text-sm mt-3">Liability</h3>
                    <p>We are not responsible for other users’ content or for loss of data beyond what the law requires.</p>
                  </div>

                  <div>
                    <h3 className="font-bold text-white text-sm mt-3">Changes</h3>
                    <p>We may update these terms. Continued use means acceptance.</p>
                  </div>

                  <div>
                    <h3 className="font-bold text-white text-sm mt-3">Contact</h3>
                    <p>
                      <a href="mailto:team@watch1do1.com" className="text-amber-400 font-mono hover:underline">
                        team@watch1do1.com
                      </a>
                    </p>
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

      {/* USER PROFILE PANEL */}
      <ProfilePanel
        isOpen={isProfileOpen}
        onClose={() => {
          setIsProfileOpen(false);
          if (window.location.hash === "#profile") {
            window.history.replaceState({}, document.title, window.location.pathname);
          }
        }}
        currentUsername={username}
        onSignOut={handleLogout}
        onUsernameUpdated={(newUsername) => {
          setUsername(newUsername);
          setTempUsername(newUsername);
          localStorage.setItem("clips_username", newUsername);
        }}
        clips={clips}
        onClipSelect={(targetId) => setSelectedThreadRootId(targetId)}
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
