import React, { useState, useEffect, useRef, useCallback } from "react";
import { dragHasFiles, isSupportedPostFile, readDroppedFile, UNREADABLE_DROP_MESSAGE } from "./utils/fileDrop";
import { 
  Film, Sparkles, RefreshCw, Plus, Heart, MessageCircle, HelpCircle, 
  Volume2, Settings, MessageSquare, Flame, CheckCircle, Info, Star,
  ShieldCheck, ArrowUpCircle, UserCheck, Trash2, ShieldAlert, LogIn, LogOut, User,
  MoreVertical, Mail, FileText, Clock, Mic, Loader2, X, Palette
} from "lucide-react";
import { AnimatePresence } from "motion/react";
import ClipCard from "./components/ClipCard";
import RespondModal from "./components/RespondModal";
import VoiceItModal from "./components/VoiceItModal";
import { VOICE_IT_EVENT, isVoiceItEligible } from "./utils/voiceIt";
import ThreadView from "./components/ThreadView";
import FastReaxPanel from "./components/FastReaxPanel";
import SavedReactionsVault from "./components/SavedReactionsVault";
import OnboardingModal from "./components/OnboardingModal";
import ResetPasswordModal from "./components/ResetPasswordModal";
import ContactModal from "./components/ContactModal";
import ProfilePanel from "./components/ProfilePanel";
import PacksPage from "./components/PacksPage";
import { OPEN_PACKS_EVENT } from "./packs/render";
import UserProfileModal from "./components/UserProfileModal";
import UserSearchBar from "./components/UserSearchBar";
import AdminPanel from "./components/AdminPanel";
import PolicyDocumentModal from "./components/PolicyDocumentModal";
import PolicyReacceptModal from "./components/PolicyReacceptModal";
import { TERMS_VERSION, PRIVACY_VERSION } from "./constants/policy";
import { Clip, SavedReaction } from "./types";
import { generateUniqueId, loadAndSanitizeReactions, detectDuplicateIds } from "./utils/keyUtils";
import { extractHashtags, parseTagQuery, HASHTAG_EVENT } from "./utils/hashtags";
import { 
  getAuthToken, 
  fetchMyProfile, 
  syncUserProfile, 
  signOutSupabase, 
  handleUrlAuthTokens,
  getSupabaseClient,
  acceptPolicies
} from "./utils/supabaseClient";

type FeedType = "hot" | "latest" | "most_reacted" | "audio_hot";
const FEED_TYPES: FeedType[] = ["hot", "latest", "most_reacted", "audio_hot"];
const DEFAULT_FEED_STORAGE_KEY = "reax_default_feed";
const FEED_LABELS: Record<FeedType, string> = {
  hot: "Hot",
  latest: "Latest",
  most_reacted: "Most Reacted",
  audio_hot: "Voice"
};
function readDefaultFeedType(): FeedType {
  try {
    const saved = localStorage.getItem(DEFAULT_FEED_STORAGE_KEY);
    if (saved && (FEED_TYPES as string[]).includes(saved)) return saved as FeedType;
  } catch {
    // localStorage unavailable (private mode): fall back to Latest
  }
  return "latest";
}

export default function App() {
  const [clips, setClips] = useState<Clip[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // User auth state
  const [isLoggedIn, setIsLoggedIn] = useState(() => {
    return localStorage.getItem("reax_is_logged_in") === "true";
  });

  // Username State: only loaded from storage if user is logged in
  const [username, setUsername] = useState(() => {
    const logged = localStorage.getItem("reax_is_logged_in") === "true";
    if (!logged) {
      // Clear out any old auto-generated ~guest username so anonymous users never have one
      const stored = localStorage.getItem("clips_username");
      if (stored && stored.startsWith("~")) {
        localStorage.removeItem("clips_username");
      }
      return "";
    }
    let stored = localStorage.getItem("clips_username") || "";
    if (stored.startsWith("~")) {
      stored = stored.substring(1);
      localStorage.setItem("clips_username", stored);
    }
    return stored;
  });
  
  const [isEditingUsername, setIsEditingUsername] = useState(false);
  const [tempUsername, setTempUsername] = useState(username);

  // Profile Panel & Onboarding Modal states
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [isHeaderMenuOpen, setIsHeaderMenuOpen] = useState(false);
  const [isUpgradeModalOpen, setIsUpgradeModalOpen] = useState(false);
  const [upgradeTriggerReason, setUpgradeTriggerReason] = useState<"save_reaction" | "post_limit" | "edit_username" | "nav_click" | null>(null);
  const [isResetPasswordModalOpen, setIsResetPasswordModalOpen] = useState(false);
  const [isContactModalOpen, setIsContactModalOpen] = useState(false);
  const [isPolicyReacceptModalOpen, setIsPolicyReacceptModalOpen] = useState(false);
  const [policyReacceptUser, setPolicyReacceptUser] = useState<{ id?: string; username: string } | null>(null);

  // In-flight reactions guard to ignore duplicate taps while request is in flight
  const inFlightReactionsRef = useRef<Set<string>>(new Set());

  // Sync user reactions from server (GET /api/me/reactions)
  const syncUserReactions = async () => {
    try {
      let token = "";
      try { token = await getAuthToken(); } catch {}
      if (!token) return;

      const res = await fetch("/api/me/reactions", {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        const likedIds = Array.isArray(data.likedIds) ? data.likedIds : [];
        const laughedIds = Array.isArray(data.laughedIds) ? data.laughedIds : [];
        localStorage.setItem("reax_liked_ids", JSON.stringify(likedIds));
        localStorage.setItem("reax_laughed_ids", JSON.stringify(laughedIds));
        window.dispatchEvent(new Event("reax_likes_changed"));
      }
    } catch (err) {
      console.warn("Could not sync user reactions:", err);
    }
  };

  // Policy acceptance verification helper
  const checkPolicyAcceptance = (profile: any) => {
    if (!profile) return;

    // Check localStorage cache first (ensures instant persistence across windows/tabs)
    const localUserKey = profile.id ? `reax_policy_accepted_${profile.id}` : null;
    const localStored = (localUserKey && localStorage.getItem(localUserKey)) || localStorage.getItem("reax_policy_accepted_global");
    if (localStored) {
      try {
        const parsed = JSON.parse(localStored);
        if (parsed?.termsVersion === TERMS_VERSION && parsed?.privacyVersion === PRIVACY_VERSION) {
          // Reconcile profile state in memory
          if (!profile.acceptedTermsVersion) profile.acceptedTermsVersion = TERMS_VERSION;
          if (!profile.acceptedPrivacyVersion) profile.acceptedPrivacyVersion = PRIVACY_VERSION;
          return;
        }
      } catch {}
    }

    const termsAccepted = profile.acceptedTermsVersion === TERMS_VERSION;
    const privacyAccepted = profile.acceptedPrivacyVersion === PRIVACY_VERSION;
    if (!termsAccepted || !privacyAccepted) {
      setPolicyReacceptUser({
        id: profile.id,
        username: profile.username || ""
      });
      setIsPolicyReacceptModalOpen(true);
    }
  };

  const handleAcceptUpdatedPolicies = async () => {
    try {
      const now = new Date().toISOString();
      const policyRecord = JSON.stringify({
        termsVersion: TERMS_VERSION,
        privacyVersion: PRIVACY_VERSION,
        acceptedAt: now
      });

      if (policyReacceptUser?.id) {
        localStorage.setItem(`reax_policy_accepted_${policyReacceptUser.id}`, policyRecord);
      }
      localStorage.setItem("reax_policy_accepted_global", policyRecord);

      setIsPolicyReacceptModalOpen(false);
      setPolicyReacceptUser(null);

      // Trigger background policy acceptance across auth metadata and backend
      await acceptPolicies(TERMS_VERSION, PRIVACY_VERSION);

      window.dispatchEvent(
        new CustomEvent("reax_toast", {
          detail: { message: "✅ Policies accepted. Thank you!" }
        })
      );
    } catch (err) {
      console.error("Failed to accept policies:", err);
      setIsPolicyReacceptModalOpen(false);
      setPolicyReacceptUser(null);
    }
  };

  // Age constraint state
  const [ageConfirmed, setAgeConfirmed] = useState(() => {
    return localStorage.getItem("reax_age_confirmed") === "true";
  });

  // Sync profile & handle auth URL tokens on mount
  useEffect(() => {
    let isMounted = true;

    // Also open the reset modal on Supabase's own PASSWORD_RECOVERY signal, which covers
    // recovery link formats the URL check may not recognise. Setting true twice is a no-op.
    let authSub: { unsubscribe: () => void } | null = null;
    getSupabaseClient()
      .then((client) => {
        if (!client || !isMounted) return;
        const { data } = client.auth.onAuthStateChange((event) => {
          if (event === "PASSWORD_RECOVERY") setIsResetPasswordModalOpen(true);
        });
        authSub = data.subscription;
      })
      .catch((err) => console.warn("Could not subscribe to auth state changes:", err));

    async function initAuth() {
      // 1. Process URL tokens if user arrived via email confirmation or recovery link
      try {
        const urlAuth = await handleUrlAuthTokens();
        if (urlAuth.isRecovery) {
          setIsResetPasswordModalOpen(true);
        } else if (urlAuth.success && urlAuth.user && urlAuth.user.email && !(urlAuth.user as any).is_anonymous) {
          const emailConfirmed = Boolean(urlAuth.user.email_confirmed_at || (urlAuth.user as any).confirmed_at);
          if (emailConfirmed) {
            setIsLoggedIn(true);
            localStorage.setItem("reax_is_logged_in", "true");
            localStorage.setItem("reax_age_confirmed", "true");
            setAgeConfirmed(true);

            // Requirement 2: initAuth uses only GET /api/me for logged-in users' username.
            // Do NOT initialize username from URL token metadata.
            window.dispatchEvent(new CustomEvent("reax_toast", { detail: { message: "🎉 Successfully confirmed & signed in!" } }));
          }
        }
      } catch (err) {
        console.warn("Error handling auth URL tokens on mount:", err);
      }

      // 2. Fetch profile from GET /api/me (Canonical source of truth for logged-in users)
      try {
        const { profile, isAnonymous, hasEmail, emailConfirmed } = await fetchMyProfile();
        const isConfirmedEmailUser = Boolean(hasEmail && !isAnonymous && emailConfirmed);

        if (isConfirmedEmailUser && profile && isMounted) {
          setIsLoggedIn(true);
          localStorage.setItem("reax_is_logged_in", "true");
          // Requirement 2: initAuth uses only this username for logged-in users
          const uname = (profile.username || "").trim();
          if (uname) {
            setUsername(uname);
            setTempUsername(uname);
            localStorage.setItem("clips_username", uname);
          }

          // Check if policy versions are current
          checkPolicyAcceptance(profile);

          // Fetch reactions for logged in user
          syncUserReactions();
        } else if (isMounted) {
          // Anonymous session or unconfirmed email: not logged in
          setIsLoggedIn(false);
          localStorage.removeItem("reax_is_logged_in");
          localStorage.removeItem("clips_username");
          setUsername("");
          setTempUsername("");
        }
      } catch (err) {
        console.warn("Could not fetch my profile on mount:", err);
      }
    }

    initAuth();

    return () => {
      isMounted = false;
      authSub?.unsubscribe();
    };
  }, []);

  const saveUsername = async () => {
    const clean = tempUsername.trim().replace(/[^a-zA-Z0-9_]/g, "");
    if (!clean) {
      setIsEditingUsername(false);
      return;
    }
    if (clean.length < 3 || clean.length > 20) {
      window.dispatchEvent(new CustomEvent("reax_toast", { detail: { message: "Username must be between 3 and 20 characters." } }));
      return;
    }
    if (isLoggedIn) {
      try {
        const syncRes = await syncUserProfile(clean);
        const savedName = syncRes.profile?.username || clean;
        setUsername(savedName);
        setTempUsername(savedName);
        localStorage.setItem("clips_username", savedName);
        setRefreshTrigger(prev => prev + 1);
        window.dispatchEvent(new CustomEvent("reax_toast", { detail: { message: `Username updated to @${savedName}!` } }));
        setIsEditingUsername(false);
      } catch (e: any) {
        setTempUsername(username);
        window.dispatchEvent(new CustomEvent("reax_toast", { detail: { message: e?.message || "Username is already taken." } }));
      }
    } else {
      setUsername(clean);
      localStorage.setItem("clips_username", clean);
      window.dispatchEvent(new CustomEvent("reax_toast", { detail: { message: `Username updated to @${clean}!` } }));
      setIsEditingUsername(false);
    }
  };

  const handleLoginSuccess = async (newUsername: string) => {
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

    // Verify policy acceptance for this account
    try {
      const { profile } = await fetchMyProfile();
      if (profile) {
        checkPolicyAcceptance(profile);
      }
    } catch (err) {
      console.warn("Could not check policy acceptance after login:", err);
    }

    // Sync user reactions on login
    syncUserReactions();
  };

  const handleLogout = async () => {
    await signOutSupabase();
    localStorage.removeItem("reax_is_logged_in");
    localStorage.removeItem("clips_username");
    localStorage.removeItem("reax_liked_ids");
    localStorage.removeItem("reax_laughed_ids");
    setIsLoggedIn(false);
    setUsername("");
    setTempUsername("");
    
    window.dispatchEvent(new CustomEvent("reax_toast", { detail: { message: "Signed out. You are now browsing as a Guest." } }));
    window.dispatchEvent(new Event("reax_saved_changed"));
    window.dispatchEvent(new Event("reax_likes_changed"));
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
  // The user's chosen default feed tab lives in localStorage (no account setting needed).
  const [defaultFeedType, setDefaultFeedType] = useState<FeedType>(() => readDefaultFeedType());
  const [feedType, setFeedType] = useState<FeedType>(defaultFeedType);
  const makeFeedDefault = (type: FeedType) => {
    try {
      localStorage.setItem(DEFAULT_FEED_STORAGE_KEY, type);
    } catch (err) {
      console.error("Could not save default feed tab:", err);
    }
    setDefaultFeedType(type);
  };

  // User Search & Public Profile State
  const [selectedUserProfileUsername, setSelectedUserProfileUsername] = useState<string | null>(null);
  const [userProfileInitialTab, setUserProfileInitialTab] = useState<"all" | "liked">("all");
  const [activeUserFilter, setActiveUserFilter] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

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

  // Reaction Packs page: opened from the menu, the editor's "Get more styles"
  // link, or a "made with the ___ Pack" tag (which can focus one pack).
  const [packsPage, setPacksPage] = useState<{ packId: string | null } | null>(null);
  useEffect(() => {
    const handleOpenPacks = (e: Event) => {
      const packId = (e as CustomEvent).detail?.packId;
      setPacksPage({ packId: typeof packId === "string" ? packId : null });
    };
    window.addEventListener(OPEN_PACKS_EVENT, handleOpenPacks);
    return () => window.removeEventListener(OPEN_PACKS_EVENT, handleOpenPacks);
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
      
      if (window.location.hash.startsWith("#clip-")) {
        const targetId = window.location.hash.slice(1);
        setTimeout(() => {
          const el = document.getElementById(targetId);
          if (el) {
            el.scrollIntoView({ behavior: "smooth", block: "center" });
            el.classList.add("ring-2", "ring-indigo-500", "transition-all");
            setTimeout(() => {
              el.classList.remove("ring-2", "ring-indigo-500");
            }, 3000);
          }
        }, 400);
      }

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

        if (storedPasscode) {
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
        // If passcode is missing or invalid, open auth dialog to prompt for passcode
        setIsAdminOpen(false);
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

  // Server paging state. Refreshes re-fetch as many top-level posts as are already
  // loaded, so a refresh never drops pages the user has scrolled through.
  const FEED_SERVER_PAGE = 20;
  const [feedCursor, setFeedCursor] = useState<string | null>(null);
  const [feedHasMore, setFeedHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  // ---- Server-side search (so results aren't limited to posts already loaded) ----
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [searchCursor, setSearchCursor] = useState<string | null>(null);
  const [searchHasMore, setSearchHasMore] = useState(false);
  const [searchLoading, setSearchLoading] = useState(false);
  const searchSeqRef = useRef(0);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchQuery.trim()), 300);
    return () => clearTimeout(t);
  }, [searchQuery]);

  const mergeClips = useCallback((incoming: Clip[]) => {
    setClips(prev => {
      const seen = new Set(prev.map(c => c.id));
      const add = incoming.filter(c => c && c.id && !seen.has(c.id) && (seen.add(c.id), true));
      return add.length ? [...prev, ...add] : prev;
    });
  }, []);

  const fetchSearchPage = useCallback(async (q: string, cursor: string | null) => {
    const seq = ++searchSeqRef.current;
    setSearchLoading(true);
    try {
      const url = `/api/clips?limit=${FEED_SERVER_PAGE}&q=${encodeURIComponent(q)}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}&_t=${Date.now()}`;
      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) throw new Error(`Search failed (${res.status})`);
      const page = await res.json();
      if (seq !== searchSeqRef.current) return;
      mergeClips(Array.isArray(page?.clips) ? page.clips : []);
      setSearchCursor(page?.nextCursor || null);
      setSearchHasMore(Boolean(page?.hasMore && page?.nextCursor));
    } catch (err) {
      if (seq !== searchSeqRef.current) return;
      console.error(err);
      setSearchHasMore(false);
      window.dispatchEvent(new CustomEvent("reax_toast", { detail: { message: "Search couldn't reach the server. Showing loaded posts only." } }));
    } finally {
      if (seq === searchSeqRef.current) setSearchLoading(false);
    }
  }, [mergeClips]);

  useEffect(() => {
    const term = debouncedSearch.replace(/^[@#]/, "");
    setSearchCursor(null);
    setSearchHasMore(false);
    if (term.length < 2) {
      searchSeqRef.current++;
      setSearchLoading(false);
      return;
    }
    fetchSearchPage(debouncedSearch, null);
  }, [debouncedSearch, fetchSearchPage]);

  // Tapping a #hashtag anywhere opens the feed filtered to that tag.
  useEffect(() => {
    const onTag = (e: Event) => {
      const tag = (e as CustomEvent<{ tag?: string }>).detail?.tag;
      if (!tag) return;
      setSearchQuery(`#${tag}`);
      setSelectedThreadRootId(null);
      setSelectedUserProfileUsername(null);
      setUserProfileInitialTab("all");
      window.scrollTo({ top: 0, behavior: "smooth" });
    };
    window.addEventListener(HASHTAG_EVENT, onTag);
    return () => window.removeEventListener(HASHTAG_EVENT, onTag);
  }, []);

  const loadedRootCountRef = useRef(0);
  const loadingMoreRef = useRef(false);

  useEffect(() => {
    loadedRootCountRef.current = clips.filter(c => !c.parentId).length;
  }, [clips]);

  const loadMoreFromServer = useCallback(async (limit: number = FEED_SERVER_PAGE) => {
    if (loadingMoreRef.current || !feedHasMore || !feedCursor) return;
    loadingMoreRef.current = true;
    setLoadingMore(true);
    try {
      const res = await fetch(`/api/clips?limit=${limit}&cursor=${encodeURIComponent(feedCursor)}&_t=${Date.now()}`, {
        cache: "no-store",
        headers: { "Cache-Control": "no-cache, no-store, must-revalidate", "Pragma": "no-cache" }
      });
      if (!res.ok) throw new Error("Could not load more clips");
      const page = await res.json();
      const incoming: Clip[] = Array.isArray(page?.clips) ? page.clips : [];
      setClips(prev => {
        const seen = new Set(prev.map(c => c.id));
        const add = incoming.filter(c => c && c.id && !seen.has(c.id) && (seen.add(c.id), true));
        return add.length ? [...prev, ...add] : prev;
      });
      setFeedCursor(page?.nextCursor || null);
      setFeedHasMore(Boolean(page?.hasMore && page?.nextCursor));
    } catch (err) {
      console.error(err);
      window.dispatchEvent(new CustomEvent("reax_toast", { detail: { message: "Couldn't load more posts. Try again." } }));
    } finally {
      loadingMoreRef.current = false;
      setLoadingMore(false);
    }
  }, [feedCursor, feedHasMore]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    const initialLimit = Math.min(500, Math.max(FEED_SERVER_PAGE, loadedRootCountRef.current));

    fetch(`/api/clips?limit=${initialLimit}&_t=${Date.now()}`, {
      cache: "no-store",
      headers: {
        "Cache-Control": "no-cache, no-store, must-revalidate",
        "Pragma": "no-cache"
      }
    })
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
      .then((page) => {
        if (active) {
          const data = Array.isArray(page) ? page : page?.clips;
          setFeedCursor(Array.isArray(page) ? null : (page?.nextCursor || null));
          setFeedHasMore(Array.isArray(page) ? false : Boolean(page?.hasMore && page?.nextCursor));
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

          if (window.location.hash.startsWith("#clip-")) {
            const targetId = window.location.hash.slice(1);
            setTimeout(() => {
              const el = document.getElementById(targetId);
              if (el) {
                el.scrollIntoView({ behavior: "smooth", block: "center" });
                el.classList.add("ring-2", "ring-indigo-500", "transition-all");
                setTimeout(() => {
                  el.classList.remove("ring-2", "ring-indigo-500");
                }, 3000);
              }
            }, 300);
          }
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
    if (localStorage.getItem("reax_is_logged_in") !== "true") {
      window.dispatchEvent(new CustomEvent("reax_upgrade_trigger", { detail: { reason: "save_reaction" } }));
      return;
    }

    const inFlightKey = `${id}:like`;
    if (inFlightReactionsRef.current.has(inFlightKey)) return;
    inFlightReactionsRef.current.add(inFlightKey);

    const prevLikedIds = JSON.parse(localStorage.getItem("reax_liked_ids") || "[]");

    try {
      let token = "";
      try { token = await getAuthToken(); } catch {}

      const res = await fetch(`/api/clips/${id}/like`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        }
      });
      if (!res.ok) {
        if (res.status === 401) {
          window.dispatchEvent(new CustomEvent("reax_upgrade_trigger", { detail: { reason: "save_reaction" } }));
        }
        throw new Error("Failed to register like on server");
      }
      const updatedClip = await res.json();
      
      // Update with authoritative server state
      setClips(prev => prev.map(c => c.id === id ? { ...c, likesCount: updatedClip.likesCount, laughsCount: updatedClip.laughsCount } : c));

      // Update stored liked ids based on server liked result
      let currentLiked = JSON.parse(localStorage.getItem("reax_liked_ids") || "[]");
      if (updatedClip.liked) {
        if (!currentLiked.includes(id)) currentLiked.push(id);
      } else {
        currentLiked = currentLiked.filter((item: string) => item !== id);
      }
      localStorage.setItem("reax_liked_ids", JSON.stringify(currentLiked));
      window.dispatchEvent(new Event("reax_likes_changed"));
    } catch (err) {
      console.error("Like error:", err);
      localStorage.setItem("reax_liked_ids", JSON.stringify(prevLikedIds));
      window.dispatchEvent(new Event("reax_likes_changed"));
    } finally {
      inFlightReactionsRef.current.delete(inFlightKey);
    }
  };

  // Handle Unlike Action
  const handleUnlike = async (id: string) => {
    if (localStorage.getItem("reax_is_logged_in") !== "true") {
      window.dispatchEvent(new CustomEvent("reax_upgrade_trigger", { detail: { reason: "save_reaction" } }));
      return;
    }

    const inFlightKey = `${id}:like`;
    if (inFlightReactionsRef.current.has(inFlightKey)) return;
    inFlightReactionsRef.current.add(inFlightKey);

    const prevLikedIds = JSON.parse(localStorage.getItem("reax_liked_ids") || "[]");

    try {
      let token = "";
      try { token = await getAuthToken(); } catch {}

      const res = await fetch(`/api/clips/${id}/unlike`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        }
      });
      if (!res.ok) {
        if (res.status === 401) {
          window.dispatchEvent(new CustomEvent("reax_upgrade_trigger", { detail: { reason: "save_reaction" } }));
        }
        throw new Error("Failed to register unlike on server");
      }
      const updatedClip = await res.json();
      
      // Update with authoritative server state
      setClips(prev => prev.map(c => c.id === id ? { ...c, likesCount: updatedClip.likesCount, laughsCount: updatedClip.laughsCount } : c));

      // Update stored liked ids based on server liked result
      let currentLiked = JSON.parse(localStorage.getItem("reax_liked_ids") || "[]");
      if (updatedClip.liked) {
        if (!currentLiked.includes(id)) currentLiked.push(id);
      } else {
        currentLiked = currentLiked.filter((item: string) => item !== id);
      }
      localStorage.setItem("reax_liked_ids", JSON.stringify(currentLiked));
      window.dispatchEvent(new Event("reax_likes_changed"));
    } catch (err) {
      console.error("Unlike error:", err);
      localStorage.setItem("reax_liked_ids", JSON.stringify(prevLikedIds));
      window.dispatchEvent(new Event("reax_likes_changed"));
    } finally {
      inFlightReactionsRef.current.delete(inFlightKey);
    }
  };

  // Handle Laugh Action (😂 primary humor metric)
  const handleLaugh = async (id: string) => {
    if (localStorage.getItem("reax_is_logged_in") !== "true") {
      window.dispatchEvent(new CustomEvent("reax_upgrade_trigger", { detail: { reason: "save_reaction" } }));
      return;
    }

    const inFlightKey = `${id}:laugh`;
    if (inFlightReactionsRef.current.has(inFlightKey)) return;
    inFlightReactionsRef.current.add(inFlightKey);

    const prevLaughedIds = JSON.parse(localStorage.getItem("reax_laughed_ids") || "[]");

    try {
      let token = "";
      try { token = await getAuthToken(); } catch {}

      const res = await fetch(`/api/clips/${id}/laugh`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        }
      });
      if (!res.ok) {
        if (res.status === 401) {
          window.dispatchEvent(new CustomEvent("reax_upgrade_trigger", { detail: { reason: "save_reaction" } }));
        }
        throw new Error("Failed to register laugh on server");
      }
      const updatedClip = await res.json();
      
      // Update with authoritative server state
      setClips(prev => prev.map(c => c.id === id ? { ...c, likesCount: updatedClip.likesCount, laughsCount: updatedClip.laughsCount } : c));

      // Update stored laughed ids based on server laughed result
      let currentLaughed = JSON.parse(localStorage.getItem("reax_laughed_ids") || "[]");
      if (updatedClip.laughed) {
        if (!currentLaughed.includes(id)) currentLaughed.push(id);
      } else {
        currentLaughed = currentLaughed.filter((item: string) => item !== id);
      }
      localStorage.setItem("reax_laughed_ids", JSON.stringify(currentLaughed));
      window.dispatchEvent(new Event("reax_likes_changed"));
    } catch (err) {
      console.error("Laugh error:", err);
      localStorage.setItem("reax_laughed_ids", JSON.stringify(prevLaughedIds));
      window.dispatchEvent(new Event("reax_likes_changed"));
    } finally {
      inFlightReactionsRef.current.delete(inFlightKey);
    }
  };

  // Handle Unlaugh Action
  const handleUnlaugh = async (id: string) => {
    if (localStorage.getItem("reax_is_logged_in") !== "true") {
      window.dispatchEvent(new CustomEvent("reax_upgrade_trigger", { detail: { reason: "save_reaction" } }));
      return;
    }

    const inFlightKey = `${id}:laugh`;
    if (inFlightReactionsRef.current.has(inFlightKey)) return;
    inFlightReactionsRef.current.add(inFlightKey);

    const prevLaughedIds = JSON.parse(localStorage.getItem("reax_laughed_ids") || "[]");

    try {
      let token = "";
      try { token = await getAuthToken(); } catch {}

      const res = await fetch(`/api/clips/${id}/unlaugh`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        }
      });
      if (!res.ok) {
        if (res.status === 401) {
          window.dispatchEvent(new CustomEvent("reax_upgrade_trigger", { detail: { reason: "save_reaction" } }));
        }
        throw new Error("Failed to register unlaugh on server");
      }
      const updatedClip = await res.json();
      
      // Update with authoritative server state
      setClips(prev => prev.map(c => c.id === id ? { ...c, likesCount: updatedClip.likesCount, laughsCount: updatedClip.laughsCount } : c));

      // Update stored laughed ids based on server laughed result
      let currentLaughed = JSON.parse(localStorage.getItem("reax_laughed_ids") || "[]");
      if (updatedClip.laughed) {
        if (!currentLaughed.includes(id)) currentLaughed.push(id);
      } else {
        currentLaughed = currentLaughed.filter((item: string) => item !== id);
      }
      localStorage.setItem("reax_laughed_ids", JSON.stringify(currentLaughed));
      window.dispatchEvent(new Event("reax_likes_changed"));
    } catch (err) {
      console.error("Unlaugh error:", err);
      localStorage.setItem("reax_laughed_ids", JSON.stringify(prevLaughedIds));
      window.dispatchEvent(new Event("reax_likes_changed"));
    } finally {
      inFlightReactionsRef.current.delete(inFlightKey);
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

  // Check guest quota with /api/guest-status before opening composer
  const checkGuestQuotaBeforeComposer = async (): Promise<boolean> => {
    try {
      let token = "";
      try { token = await getAuthToken(); } catch {}
      if (!token) return false;

      const res = await fetch("/api/guest-status", {
        headers: {
          Authorization: `Bearer ${token}`
        }
      });
      if (res.ok) {
        const data = await res.json();
        if (data?.signupRequired) {
          window.dispatchEvent(new CustomEvent("reax_upgrade_trigger", {
            detail: { reason: "post_limit", clipCount: data.clipCount || 3 }
          }));
          return true; // Quota reached, do not open composer
        }
      }
    } catch (err) {
      console.warn("Could not check guest quota status:", err);
    }
    return false;
  };

  // Open Respond modal for a specific clip with an optional preselected tone (Capture-first flow)
  const handleRespondToClip = async (parentClip: Clip, tone: Clip["tone"] | null = null) => {
    const quotaExceeded = await checkGuestQuotaBeforeComposer();
    if (quotaExceeded) return;

    setReplyParent(parentClip);
    setRespondTone(tone || parentClip.tone || "funny");
    setIsRespondModalOpen(true);
  };

  // "Voice it": quick voice reply that reuses the parent picture
  const [voiceItParent, setVoiceItParent] = useState<Clip | null>(null);
  useEffect(() => {
    const handler = async (e: Event) => {
      const clip = (e as CustomEvent).detail?.clip as Clip | undefined;
      if (!clip || !isVoiceItEligible(clip)) return;
      const quotaExceeded = await checkGuestQuotaBeforeComposer();
      if (quotaExceeded) return;
      setVoiceItParent(clip);
    };
    window.addEventListener(VOICE_IT_EVENT, handler);
    return () => window.removeEventListener(VOICE_IT_EVENT, handler);
  });

  // Fast tap-to-reax pipeline handler - opens RespondModal directly at capture step
  const handleFastRespond = async (parentClip: Clip, tone: Clip["tone"]) => {
    const quotaExceeded = await checkGuestQuotaBeforeComposer();
    if (quotaExceeded) return;

    setReplyParent(parentClip);
    setRespondTone(tone);
    setIsRespondModalOpen(true);
  };

  // Open full editor modal as fallback or customization option from fast panel
  const handleOpenFullCustomize = async (parentClip: Clip, tone: Clip["tone"]) => {
    const quotaExceeded = await checkGuestQuotaBeforeComposer();
    if (quotaExceeded) return;

    setFastReaxTarget(null);
    setReplyParent(parentClip);
    setRespondTone(tone);
    setIsRespondModalOpen(true);
  };

  // Open Respond modal to create a fresh Root Clip
  const handleCreateRootClip = async (): Promise<boolean> => {
    const quotaExceeded = await checkGuestQuotaBeforeComposer();
    if (quotaExceeded) return false;

    setReplyParent(null);
    setRespondTone(null);
    setIsRespondModalOpen(true);
    return true;
  };

  // Desktop drag-and-drop anywhere on the page -> open the new-post window with the file loaded
  const [droppedPostFile, setDroppedPostFile] = useState<File | null>(null);
  const [isPageDragOver, setIsPageDragOver] = useState(false);
  const pageDragDepthRef = useRef(0);
  const isRespondModalOpenRef = useRef(isRespondModalOpen);
  isRespondModalOpenRef.current = isRespondModalOpen;
  const handleCreateRootClipRef = useRef(handleCreateRootClip);
  handleCreateRootClipRef.current = handleCreateRootClip;
  useEffect(() => {
    // Any open modal/panel locks body scroll (useBodyScrollLock sets position: fixed)
    const anyModalOpen = () => isRespondModalOpenRef.current || document.body.style.position === "fixed";
    const onDragEnter = (e: DragEvent) => {
      if (!dragHasFiles(e)) return;
      e.preventDefault();
      pageDragDepthRef.current += 1;
      if (!anyModalOpen()) setIsPageDragOver(true);
    };
    const onDragOver = (e: DragEvent) => {
      if (!dragHasFiles(e)) return;
      // A modal drop zone (e.g. RespondModal) already handled this event and chose its own
      // dropEffect; overriding it to "none" here would make the browser cancel the drop.
      if (e.defaultPrevented) return;
      // Always prevent default so the browser never navigates to a dropped file
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = anyModalOpen() ? "none" : "copy";
    };
    const onDragLeave = (e: DragEvent) => {
      if (!dragHasFiles(e)) return;
      pageDragDepthRef.current = Math.max(0, pageDragDepthRef.current - 1);
      if (pageDragDepthRef.current === 0) setIsPageDragOver(false);
    };
    const onDrop = async (e: DragEvent) => {
      if (!dragHasFiles(e)) return;
      e.preventDefault();
      pageDragDepthRef.current = 0;
      setIsPageDragOver(false);
      if (anyModalOpen()) return;
      const file = await readDroppedFile(e.dataTransfer);
      if (!file) {
        window.dispatchEvent(new CustomEvent("reax_toast", { detail: { message: UNREADABLE_DROP_MESSAGE } }));
        return;
      }
      if (!isSupportedPostFile(file)) {
        window.dispatchEvent(
          new CustomEvent("reax_toast", { detail: { message: "Please drop an image, GIF, or video file." } })
        );
        return;
      }
      setDroppedPostFile(file);
      const opened = await handleCreateRootClipRef.current();
      if (!opened) setDroppedPostFile(null);
    };
    window.addEventListener("dragenter", onDragEnter);
    window.addEventListener("dragover", onDragOver);
    window.addEventListener("dragleave", onDragLeave);
    window.addEventListener("drop", onDrop);
    return () => {
      window.removeEventListener("dragenter", onDragEnter);
      window.removeEventListener("dragover", onDragOver);
      window.removeEventListener("dragleave", onDragLeave);
      window.removeEventListener("drop", onDrop);
    };
  }, []);

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

      if (!postRes.ok) {
        const errData = await postRes.json().catch(() => ({}));
        if (postRes.status === 403 && errData.error === "signup_required") {
          setIsVaultOpen(false);
          setUpgradeTriggerReason("post_limit");
          setIsUpgradeModalOpen(true);
          return;
        }
        throw new Error(errData.error || "Failed to post reaction");
      }
      
      setIsVaultOpen(false);
      setRefreshTrigger(prev => prev + 1);
    } catch (err: any) {
      console.error(err);
      if (err?.message === "signup_required" || err?.signupRequired) {
        setIsVaultOpen(false);
        setUpgradeTriggerReason("post_limit");
        setIsUpgradeModalOpen(true);
        return;
      }
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

  // Dynamically compute the feed based on active algorithm, user filter, and search query
  const rootClips = React.useMemo(() => {
    let baseRoots = clips.filter((c) => c.parentId === null);

    // Apply user filter (roots authored by user OR threads where user replied)
    if (activeUserFilter) {
      const filterClean = activeUserFilter.toLowerCase().replace(/^~/, "").replace(/^@/, "");
      baseRoots = baseRoots.filter((root) => {
        const rootAuthor = (root.authorName || "").toLowerCase().replace(/^~/, "").replace(/^@/, "");
        if (rootAuthor === filterClean) return true;
        
        const findDescendants = (parentId: string): Clip[] => {
          const direct = clips.filter(c => c.parentId === parentId);
          let list = [...direct];
          direct.forEach(child => {
            list = [...list, ...findDescendants(child.id)];
          });
          return list;
        };
        const allDescendants = findDescendants(root.id);
        return allDescendants.some(d => (d.authorName || "").toLowerCase().replace(/^~/, "").replace(/^@/, "") === filterClean);
      });
    }

    // Apply text search query
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase().replace(/^@/, "");
      const tag = parseTagQuery(searchQuery);
      const matches = (c: Clip) => tag
        ? extractHashtags(c.overlayText).includes(tag) || extractHashtags(c.voiceText).includes(tag)
        : (c.authorName || "").toLowerCase().includes(q) ||
          (c.overlayText || "").toLowerCase().includes(q) ||
          (c.voiceText || "").toLowerCase().includes(q);
      baseRoots = baseRoots.filter((root) => {
        if (matches(root)) return true;
        const findDescendants = (parentId: string): Clip[] => {
          const direct = clips.filter(c => c.parentId === parentId);
          let list = [...direct];
          direct.forEach(child => {
            list = [...list, ...findDescendants(child.id)];
          });
          return list;
        };
        return findDescendants(root.id).some(matches);
      });
    }

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
          
      case "hot":
      default:
        // Hot Velocity Score = (Replies * 5) + (Laughs * 3) + (Likes * 2) + Dynamic Freshness Boost
        return [...baseRoots].sort((a, b) => {
          const repliesA = getChainCount(a.id);
          const repliesB = getChainCount(b.id);
          
          const lastActivityA = getThreadRecentActivity(a.id);
          const lastActivityB = getThreadRecentActivity(b.id);
          
          const ageHoursA = (Date.now() - lastActivityA) / (1000 * 60 * 60);
          const ageHoursB = (Date.now() - lastActivityB) / (1000 * 60 * 60);
          
          // Velocity Score: Active conversations in recent hours get highest multiplier
          const activityScoreA = 25 / (ageHoursA + 1);
          const activityScoreB = 25 / (ageHoursB + 1);
          
          const scoreA = (repliesA * 5) + ((a.laughsCount || 0) * 3) + (a.likesCount * 2) + activityScoreA;
          const scoreB = (repliesB * 5) + ((b.laughsCount || 0) * 3) + (b.likesCount * 2) + activityScoreB;
          
          return scoreB - scoreA;
        });
    }
  }, [clips, feedType, searchQuery, activeUserFilter]);

  const FEED_PAGE_SIZE = 20;
  const [visibleCount, setVisibleCount] = useState(FEED_PAGE_SIZE);
  useEffect(() => {
    setVisibleCount(FEED_PAGE_SIZE);
  }, [feedType, searchQuery, activeUserFilter]);
  const visibleRootClips = rootClips.slice(0, visibleCount);
  const isSearching = searchQuery.trim().replace(/^[@#]/, "").length >= 2;
  const hasMoreClips = rootClips.length > visibleCount || (isSearching ? searchHasMore : feedHasMore);
  const activeTag = parseTagQuery(searchQuery);

  // Hot / Most Reacted / Voice rank by reply counts and recent activity, which are not
  // database columns, so for those tabs we widen the loaded window once (up to ~220 newest posts)
  // and rank client-side.
  const widenedForRankingRef = useRef(false);
  useEffect(() => {
    if (feedType !== "latest" && feedHasMore && !widenedForRankingRef.current && !loading) {
      widenedForRankingRef.current = true;
      loadMoreFromServer(200);
    }
  }, [feedType, feedHasMore, loading, loadMoreFromServer]);

  const handleLoadMore = async () => {
    if (loadingMore || searchLoading) return;
    if (isSearching) {
      if (rootClips.length < visibleCount + FEED_PAGE_SIZE && searchHasMore && searchCursor) {
        await fetchSearchPage(searchQuery.trim(), searchCursor);
      }
      setVisibleCount((n) => n + FEED_PAGE_SIZE);
      return;
    }
    if (rootClips.length < visibleCount + FEED_PAGE_SIZE && feedHasMore) {
      await loadMoreFromServer(FEED_SERVER_PAGE);
    }
    setVisibleCount((n) => n + FEED_PAGE_SIZE);
  };

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
            {/* If logged in: @username (opens Profile). If guest: Sign in */}
            {isLoggedIn && username && !username.startsWith("user_") ? (
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

            {/* Overflow menu for Vault / Sign out */}
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
                    onClick={() => setPacksPage({ packId: null })}
                    className="w-full px-3 py-2 text-left text-slate-200 hover:bg-slate-800/80 flex items-center gap-2 cursor-pointer font-medium border-t border-slate-800/50"
                  >
                    <Palette className="w-3.5 h-3.5 text-pink-400" />
                    <span>Reaction Packs</span>
                  </button>
                  <button
                    onClick={() => setIsContactModalOpen(true)}
                    className="w-full px-3 py-2 text-left text-indigo-300 hover:bg-slate-800/80 flex items-center gap-2 cursor-pointer font-medium border-t border-slate-800/50"
                  >
                    <Mail className="w-3.5 h-3.5 text-indigo-400" />
                    <span>Contact Us</span>
                  </button>
                  <button
                    onClick={() => setActiveDocsTab("terms")}
                    className="w-full px-3 py-2 text-left text-slate-300 hover:bg-slate-800/80 flex items-center gap-2 cursor-pointer font-medium border-t border-slate-800/50"
                  >
                    <FileText className="w-3.5 h-3.5 text-slate-400" />
                    <span>Terms of Service</span>
                  </button>
                  <button
                    onClick={() => setActiveDocsTab("privacy")}
                    className="w-full px-3 py-2 text-left text-slate-300 hover:bg-slate-800/80 flex items-center gap-2 cursor-pointer font-medium border-t border-slate-800/50"
                  >
                    <ShieldCheck className="w-3.5 h-3.5 text-slate-400" />
                    <span>Privacy Policy</span>
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

        {/* User Search & Discovery Bar */}
        {!loading && clips.length > 0 && (
          <div className="pb-1">
            <UserSearchBar
              clips={clips}
              activeUserFilter={activeUserFilter}
              onSelectUserFilter={(u) => setActiveUserFilter(u)}
              onOpenUserProfile={(u) => setSelectedUserProfileUsername(u)}
              searchQuery={searchQuery}
              onSearchQueryChange={(q) => setSearchQuery(q)}
            />
          </div>
        )}

        {/* Modern Segmented Feed Filter */}
        {!loading && clips.length > 0 && (
          <div className="flex items-center justify-center gap-1 p-1 bg-slate-900/80 border border-slate-800/80 rounded-2xl max-w-fit mx-auto mb-1 text-xs font-medium shadow-inner backdrop-blur-sm">
            <button 
              onClick={() => setFeedType("hot")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl transition-all cursor-pointer ${
                feedType === "hot" 
                  ? "bg-gradient-to-r from-amber-500/20 via-orange-500/20 to-rose-500/20 text-rose-300 font-bold border border-rose-500/35 shadow-sm" 
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              <Flame className={`w-3.5 h-3.5 ${feedType === "hot" ? "text-orange-400 fill-orange-400/30" : "text-slate-400"}`} />
              <span>Hot</span>
            </button>
            <button 
              onClick={() => setFeedType("latest")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl transition-all cursor-pointer ${
                feedType === "latest" 
                  ? "bg-slate-800 text-slate-100 font-bold border border-slate-700 shadow-sm" 
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              <Clock className="w-3.5 h-3.5 text-cyan-400" />
              <span>Latest</span>
            </button>
            <button 
              onClick={() => setFeedType("most_reacted")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl transition-all cursor-pointer ${
                feedType === "most_reacted" 
                  ? "bg-slate-800 text-slate-100 font-bold border border-slate-700 shadow-sm" 
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              <MessageSquare className="w-3.5 h-3.5 text-indigo-400" />
              <span>Most Reacted</span>
            </button>
            <button 
              onClick={() => setFeedType("audio_hot")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl transition-all cursor-pointer ${
                feedType === "audio_hot" 
                  ? "bg-slate-800 text-slate-100 font-bold border border-slate-700 shadow-sm" 
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              <Mic className="w-3.5 h-3.5 text-emerald-400" />
              <span>Voice</span>
            </button>
          </div>
        )}
        {!loading && clips.length > 0 && (
          <div className="flex justify-center mb-2 text-[11px]">
            {feedType === defaultFeedType ? (
              <span className="text-slate-500">{FEED_LABELS[feedType]} is your default feed</span>
            ) : (
              <button
                onClick={() => makeFeedDefault(feedType)}
                className="text-cyan-400 hover:text-cyan-300 hover:underline cursor-pointer"
              >
                Make {FEED_LABELS[feedType]} my default
              </button>
            )}
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
        ) : rootClips.length === 0 && searchQuery.trim() ? (
          <div className="text-center py-12 bg-slate-900/20 border border-slate-800/40 rounded-3xl p-8 space-y-4">
            <div className="w-14 h-14 rounded-2xl bg-slate-900 border border-slate-800 flex items-center justify-center mx-auto text-slate-500 text-lg">
              {activeTag ? "#" : "🔍"}
            </div>
            <div className="space-y-1.5">
              <h3 className="text-sm font-bold text-white">
                {searchLoading || searchQuery.trim() !== debouncedSearch
                  ? "Searching…"
                  : activeTag ? `No posts for #${activeTag}` : `No posts match "${searchQuery.trim()}"`}
              </h3>
              {!searchLoading && searchQuery.trim() === debouncedSearch && (
                <p className="text-xs text-slate-400 max-w-sm mx-auto leading-relaxed">
                  {activeTag ? "Be the first: add this hashtag to your caption when you post." : "Try a different word, a #hashtag or an @username."}
                </p>
              )}
            </div>
            <button
              onClick={() => setSearchQuery("")}
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-xs rounded-xl shadow-md transition-all uppercase tracking-wider font-mono"
            >
              Clear search
            </button>
          </div>
        ) : rootClips.length === 0 ? (
          /* Contextual Empty State */
          <div className="text-center py-12 bg-slate-900/20 border border-slate-800/40 rounded-3xl p-8 space-y-4">
            <div className="w-14 h-14 rounded-2xl bg-slate-900 border border-slate-800 flex items-center justify-center mx-auto text-slate-500 text-lg">
              {feedType === "audio_hot" ? "🎤" : (feedType === "hot" ? "🔥" : "🎬")}
            </div>
            <div className="space-y-1.5">
              <h3 className="text-sm font-bold text-white">No loops fit this algorithm</h3>
              <p className="text-xs text-slate-400 max-w-sm mx-auto leading-relaxed">
                {feedType === "audio_hot" 
                  ? "None of the active conversation threads have custom voice recordings or AI speech accents yet. Be the first to add one!"
                  : feedType === "hot"
                  ? "No active reaction conversations yet. Be the first to start a hot thread!"
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
                <span className={`w-1.5 h-1.5 rounded-full ${feedType === "hot" ? "bg-rose-500 animate-pulse" : "bg-indigo-500"}`} />
                {feedType === "hot" ? "🔥 HOT FEED" : `${feedType.replace("_", " ").toUpperCase()} FEED`} ({rootClips.length})
              </span>
              <span className="text-[10px] text-slate-500 font-mono uppercase">
                Sorted by {feedType === "hot" ? "Engagement Velocity" : (feedType === "most_reacted" ? "Thread Depth" : (feedType === "audio_hot" ? "Voice Activity" : "Date Stamp"))}
              </span>
            </div>

            {searchQuery.trim() && (
              <div className="flex items-center justify-between gap-2 bg-sky-950/40 border border-sky-500/30 rounded-xl px-3 py-1.5 text-xs">
                <span className="text-slate-300 truncate">
                  {activeTag ? <>Posts tagged <span className="font-bold text-sky-300">#{activeTag}</span></> : <>Results for <span className="font-bold text-sky-300">"{searchQuery.trim()}"</span></>}
                  {searchLoading && <span className="text-slate-500"> · searching…</span>}
                </span>
                <button
                  type="button"
                  onClick={() => setSearchQuery("")}
                  className="p-1 text-slate-400 hover:text-rose-400 rounded transition-colors cursor-pointer"
                  title="Clear search"
                  aria-label="Clear search"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            <div className="space-y-6">
              {visibleRootClips.map((clip, index) => (
                <ClipCard
                  key={`clip-${clip.id}`}
                  clip={clip}
                  allClips={clips}
                  isHot={feedType === "hot" && index < 3}
                  onLaugh={handleLaugh}
                  onLike={handleLike}
                  onUnlike={handleUnlike}
                  onUnlaugh={handleUnlaugh}
                  onDelete={handleDeleteClip}
                  onRespond={handleRespondToClip}
                  onRespondWithTone={handleFastRespond}
                  onRespondWithSaved={(parentClip, reax) => handlePostSavedReaction(reax, parentClip.id)}
                  onViewThread={(id) => setSelectedThreadRootId(id)}
                  onViewUser={(author) => setSelectedUserProfileUsername(author)}
                />
              ))}
            </div>

            {hasMoreClips ? (
              <div className="flex justify-center pt-2">
                <button
                  type="button"
                  onClick={handleLoadMore}
                  disabled={loadingMore}
                  aria-busy={loadingMore}
                  className="w-full sm:w-auto sm:min-w-[220px] inline-flex items-center justify-center gap-2 px-6 py-3 rounded-full border border-slate-700 bg-slate-900 hover:bg-slate-800 hover:border-indigo-500/60 text-slate-200 text-sm font-semibold shadow-md transition-all cursor-pointer disabled:cursor-wait disabled:opacity-70"
                >
                  {loadingMore ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin text-indigo-400" />
                      <span>Loading…</span>
                    </>
                  ) : (
                    <span>Load more</span>
                  )}
                </button>
              </div>
            ) : rootClips.length > FEED_PAGE_SIZE ? (
              <p className="text-center text-xs text-slate-500 pt-2 pb-4">You're all caught up ✨</p>
            ) : null}
          </div>
        )}

      </main>

      {/* Footer Branding */}
      <footer className="bg-slate-950 border-t border-slate-900 py-6 text-center text-[10px] font-mono text-slate-600 space-y-2.5">
        <p>REAX © 2026</p>
        <div className="flex justify-center gap-4 text-slate-500 text-[9.5px]">
          <button onClick={() => setActiveDocsTab("privacy")} className="hover:text-amber-400 transition-colors cursor-pointer">Privacy Policy</button>
          <span>•</span>
          <button onClick={() => setActiveDocsTab("terms")} className="hover:text-amber-400 transition-colors cursor-pointer">Terms of Service</button>
          <span>•</span>
          <button onClick={() => setIsContactModalOpen(true)} className="hover:text-amber-400 transition-colors cursor-pointer">Contact Us</button>
        </div>
      </footer>

      {/* Full-page drag-and-drop overlay (desktop) */}
      {isPageDragOver && (
        <div className="pointer-events-none fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="mx-6 px-10 py-12 rounded-3xl border-2 border-dashed border-indigo-400 bg-slate-950/90 text-center">
            <p className="text-xl font-bold text-white">Drop to post</p>
            <p className="mt-1 text-xs font-mono text-slate-400">Photo, GIF, or video</p>
          </div>
        </div>
      )}

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
            initialFile={droppedPostFile}
            onClose={() => {
              setIsRespondModalOpen(false);
              setRemixData(null);
              setDroppedPostFile(null);
            }}
            onSuccess={() => {
              setIsRespondModalOpen(false);
              setRemixData(null);
              setDroppedPostFile(null);
              setRefreshTrigger((prev) => prev + 1);
            }}
          />
        )}

        {/* VOICE IT QUICK VOICE REPLY */}
        {voiceItParent && (
          <VoiceItModal
            key="voice-it-modal"
            parentClip={voiceItParent}
            username={username}
            onClose={() => setVoiceItParent(null)}
            onSuccess={() => {
              setVoiceItParent(null);
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
            onUnlike={handleUnlike}
            onUnlaugh={handleUnlaugh}
            onDelete={handleDeleteClip}
            onRespond={handleRespondToClip}
            onRespondWithTone={handleFastRespond}
            onRespondWithSaved={(parentClip, reax) => handlePostSavedReaction(reax, parentClip.id)}
            onViewUser={(author) => setSelectedUserProfileUsername(author)}
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

        {/* PRIVACY POLICY & TERMS OF SERVICE DOCUMENT MODAL */}
        <PolicyDocumentModal
          type={activeDocsTab}
          onClose={() => setActiveDocsTab(null)}
          onOpenContact={() => {
            setActiveDocsTab(null);
            setIsContactModalOpen(true);
          }}
        />

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

      {/* RESET PASSWORD MODAL (RECOVERY FLOW) */}
      <ResetPasswordModal
        isOpen={isResetPasswordModalOpen}
        onClose={() => setIsResetPasswordModalOpen(false)}
        onSuccess={async () => {
          setIsResetPasswordModalOpen(false);
          const { profile } = await fetchMyProfile();
          setIsLoggedIn(true);
          localStorage.setItem("reax_is_logged_in", "true");
          if (profile?.username) {
            setUsername(profile.username);
            setTempUsername(profile.username);
            localStorage.setItem("clips_username", profile.username);
          }
          window.dispatchEvent(new CustomEvent("reax_toast", { detail: { message: "🔑 Password updated successfully!" } }));
        }}
      />

      {/* CONTACT US MODAL */}
      {packsPage && (
        <PacksPage
          focusPackId={packsPage.packId}
          username={isLoggedIn ? username : null}
          onClose={() => setPacksPage(null)}
        />
      )}

      <ContactModal
        isOpen={isContactModalOpen}
        onClose={() => setIsContactModalOpen(false)}
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
          setRefreshTrigger(prev => prev + 1);
        }}
        onRefreshClips={() => setRefreshTrigger(prev => prev + 1)}
        clips={clips}
        onClipSelect={(targetId) => setSelectedThreadRootId(targetId)}
        onOpenLiked={() => {
          setIsProfileOpen(false);
          setUserProfileInitialTab("liked");
          setSelectedUserProfileUsername(username);
        }}
      />

      {/* PUBLIC USER PROFILE & REACTIONS MODAL */}
      <UserProfileModal
        isOpen={!!selectedUserProfileUsername}
        username={selectedUserProfileUsername}
        onClose={() => {
          setSelectedUserProfileUsername(null);
          setUserProfileInitialTab("all");
        }}
        allClips={clips}
        initialTab={userProfileInitialTab}
        isOwnProfile={Boolean(
          isLoggedIn && username && selectedUserProfileUsername &&
          selectedUserProfileUsername.trim().replace(/^@/, "").toLowerCase() === username.trim().replace(/^@/, "").toLowerCase()
        )}
        onSelectLikedClip={(likedClip) => {
          // A liked post may be older than what the feed has loaded; add it so the thread can open.
          mergeClips([likedClip]);
          setSelectedUserProfileUsername(null);
          setUserProfileInitialTab("all");
          setSelectedThreadRootId(likedClip.id);
        }}
        onSelectClip={(targetId) => {
          setSelectedUserProfileUsername(null);
          setSelectedThreadRootId(targetId);
        }}
        onRespondToClip={(targetClip) => {
          setSelectedUserProfileUsername(null);
          handleRespondToClip(targetClip);
        }}
      />

      {/* POLICY RE-ACCEPTANCE MODAL (BLOCKING FOR OUTDATED POLICY VERSIONS) */}
      <PolicyReacceptModal
        isOpen={isPolicyReacceptModalOpen}
        username={policyReacceptUser?.username || ""}
        onAccept={handleAcceptUpdatedPolicies}
        onSignOut={handleLogout}
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
