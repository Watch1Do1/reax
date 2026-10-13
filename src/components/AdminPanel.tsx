import React, { useState, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "motion/react";
import { 
  X, Shield, Users, Settings, Trash2, 
  RefreshCw, Eye, UserX, AlertTriangle, 
  Tv, CheckCircle, Database, ShieldAlert, Copy,
  Mail, Search, Check, Building2, BadgeCheck
} from "lucide-react";
import { Clip } from "../types";
import { getAuthToken } from "../utils/supabaseClient";
import { protectedMediaProps, blockMediaEvent } from "../utils/mediaProtection";
import Avatar from "./Avatar";
import { REACTION_PACKS } from "../packs/manifest";

interface AdminPanelProps {
  key?: string | number | null;
  onClose: () => void;
  allClips: Clip[];
  onRefreshClips: () => void;
  onSelectThread: (id: string) => void;
}

type AdminTab = "reports" | "content" | "dashboard" | "users" | "badges" | "packs" | "settings";

type AdminStats = {
  overview?: {
    totalClips?: number;
    totalRootThreads?: number;
    totalReplies?: number;
    openReports?: number;
    totalUsers?: number;
  };
  breakdown?: {
    voiceReactions?: number;
    silentReactions?: number;
    videoReactions?: number;
    imageReactions?: number;
  };
};

type AdminReport = {
  id: string;
  clipId: string;
  reporter: string;
  reason: string;
  createdAt: string;
  clip: {
    id: string;
    authorName: string;
    mediaUrl: string;
    voiceText?: string;
    overlayText?: string;
    deleted: boolean;
    reportCount: number;
  } | null;
};

type AdminUser = {
  id?: string;
  username: string;
  email?: string | null;
  createdAt: string;
  lastActive: string;
  reactionCount: number;
  suspended: boolean;
  strikes: number;
  isConfirmed?: boolean;
  authSource?: string;
  avatarUrl?: string | null;
};

export default function AdminPanel({ onClose, onRefreshClips, onSelectThread }: AdminPanelProps) {
  const [activeTab, setActiveTab] = useState<AdminTab>("reports");
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [clipsList, setClipsList] = useState<Clip[]>([]);
  const [reportsList, setReportsList] = useState<AdminReport[]>([]);
  const [usersList, setUsersList] = useState<AdminUser[]>([]);
  const [userCategoryFilter, setUserCategoryFilter] = useState<"confirmed" | "all" | "guests">("confirmed");
  const [userSearchQuery, setUserSearchQuery] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedUserFilter, setSelectedUserFilter] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<"all" | "live" | "deleted" | "reported">("all");
  const [sortBy, setSortBy] = useState<"newest" | "likes" | "reactions" | "reported">("newest");
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Dedicated Purge Confirmation State
  const [clipToPurge, setClipToPurge] = useState<Clip | null>(null);
  const [isPurging, setIsPurging] = useState(false);
  const purgedClipIdsRef = React.useRef<Set<string>>(new Set());

  // Database Connection diagnostics state
  const [dbStatus, setDbStatus] = useState<any>(null);
  const [loadingDbStatus, setLoadingDbStatus] = useState(false);

  // Supabase Auth synchronization state
  const [isSyncingAuth, setIsSyncingAuth] = useState(false);
  const [syncAuthResult, setSyncAuthResult] = useState<{ success: boolean; message: string; hasServiceRoleKey?: boolean; synced?: number; authCount?: number } | null>(null);
  const [showSyncSqlModal, setShowSyncSqlModal] = useState(false);
  const [copiedSyncSql, setCopiedSyncSql] = useState(false);

  // Check if running on localhost for optional developer sandbox tooling
  const isLocalhost = typeof window !== "undefined" && 
    (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1");

  // Secure wrapper for admin fetch requests with cache-busting
  const adminFetch = async (url: string, options: any = {}) => {
    let token = "";
    try {
      token = await getAuthToken();
    } catch {}
    const passcode = localStorage.getItem("reax_admin_passcode") || "";
    if (!passcode && !token) {
      showToast("Admin session expired. Please enter passcode.");
      onClose();
      throw new Error("Missing admin credentials");
    }
    const cacheBuster = url.includes("?") ? `&_t=${Date.now()}` : `?_t=${Date.now()}`;
    const finalUrl = options.method && options.method !== "GET" ? url : `${url}${cacheBuster}`;

    const res = await fetch(finalUrl, {
      ...options,
      cache: "no-store",
      headers: {
        "Cache-Control": "no-cache, no-store, must-revalidate",
        "Pragma": "no-cache",
        ...options.headers,
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(passcode ? { "X-Admin-Passcode": passcode } : {})
      }
    });

    if (res.status === 401) {
      localStorage.removeItem("reax_admin_passcode");
      showToast("Admin passcode expired or invalid. Please log in again.");
      onClose();
    }

    return res;
  };

  const loadDbStatus = async () => {
    setLoadingDbStatus(true);
    try {
      const res = await fetch("/api/db-status");
      if (res.ok) {
        setDbStatus(await res.json());
      }
    } catch (err) {
      console.error("Failed to load db status:", err);
    } finally {
      setLoadingDbStatus(false);
    }
  };

  // Load Admin Data (all real counts and records)
  const loadAdminData = async (silent = false, excludeClipId?: string) => {
    if (!silent) setLoading(true);
    try {
      const [statsRes, clipsRes, reportsRes, usersRes] = await Promise.all([
        adminFetch("/api/admin/stats"),
        adminFetch("/api/admin/clips"),
        adminFetch("/api/admin/reports"),
        adminFetch("/api/admin/users")
      ]);

      if (statsRes.ok) setStats(await statsRes.json());
      if (clipsRes.ok) {
        const rawClips: Clip[] = await clipsRes.json();
        const filtered = (Array.isArray(rawClips) ? rawClips : []).filter(
          c => !purgedClipIdsRef.current.has(c.id) && c.id !== excludeClipId
        );
        setClipsList(filtered);
      }
      if (reportsRes.ok) {
        const rawReports: AdminReport[] = await reportsRes.json();
        const filteredReports = (Array.isArray(rawReports) ? rawReports : []).filter(
          r => !purgedClipIdsRef.current.has(r.clipId) && r.clipId !== excludeClipId
        );
        setReportsList(filteredReports);
      }
      if (usersRes.ok) {
        const usersData = await usersRes.json();
        setUsersList(Array.isArray(usersData) ? usersData : []);
      }
    } catch (err) {
      console.error("Failed to fetch admin data", err);
      showToast("Error loading panel data.");
    } finally {
      if (!silent) setLoading(false);
    }
  };

  const SYNC_AUTH_SQL = `-- 1. Link emails and display names from Supabase Auth to existing user_profiles
UPDATE public.user_profiles p
SET 
  email = u.email,
  username = CASE 
    WHEN p.username IS NULL OR p.username = '' OR p.username LIKE 'user_%' OR p.username LIKE 'Reaxer_%' THEN
      COALESCE(
        NULLIF(TRIM(u.raw_user_meta_data->>'username'), ''),
        NULLIF(TRIM(u.raw_user_meta_data->>'display_name'), ''),
        NULLIF(TRIM(u.raw_user_meta_data->>'user_name'), ''),
        NULLIF(TRIM(split_part(u.email, '@', 1)), ''),
        p.username
      )
    ELSE COALESCE(
      NULLIF(TRIM(u.raw_user_meta_data->>'username'), ''),
      NULLIF(TRIM(u.raw_user_meta_data->>'display_name'), ''),
      p.username
    )
  END
FROM auth.users u
WHERE (p.id = u.id OR p.user_id = u.id);

-- 2. Insert any auth accounts missing from user_profiles
INSERT INTO public.user_profiles (
  id, user_id, email, username, suspended, strikes, reaction_count, created_at, last_active
)
SELECT 
  u.id,
  u.id,
  u.email,
  COALESCE(
    NULLIF(TRIM(u.raw_user_meta_data->>'username'), ''),
    NULLIF(TRIM(u.raw_user_meta_data->>'user_name'), ''),
    NULLIF(TRIM(u.raw_user_meta_data->>'display_name'), ''),
    NULLIF(TRIM(split_part(u.email, '@', 1)), ''),
    'user_' || substr(u.id::text, 1, 8)
  ),
  false, 0, 0,
  COALESCE(u.created_at, NOW()),
  COALESCE(u.created_at, NOW())
FROM auth.users u
WHERE NOT EXISTS (
  SELECT 1 FROM public.user_profiles p WHERE p.id = u.id OR p.user_id = u.id
)
ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email;

-- 3. Install RPC function so admin panel can query auth accounts directly
CREATE OR REPLACE FUNCTION public.get_auth_users()
RETURNS TABLE (
  id UUID,
  email TEXT,
  created_at TIMESTAMPTZ,
  confirmed_at TIMESTAMPTZ,
  last_sign_in_at TIMESTAMPTZ,
  raw_user_meta_data JSONB
)
SECURITY DEFINER
SET search_path = public, auth
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    u.id,
    u.email::TEXT,
    u.created_at,
    COALESCE(u.email_confirmed_at, u.confirmed_at),
    u.last_sign_in_at,
    u.raw_user_meta_data
  FROM auth.users u;
END;
$$;
GRANT EXECUTE ON FUNCTION public.get_auth_users() TO authenticated, anon, service_role;`;

  const handleSyncAuthUsers = async () => {
    setIsSyncingAuth(true);
    try {
      const res = await adminFetch("/api/admin/sync-auth-users", { method: "POST" });
      const data = await res.json();
      setSyncAuthResult(data);
      if (data.synced > 0) {
        showToast(data.message || `Synced ${data.synced} auth accounts.`);
        await loadAdminData(true);
      } else if (!data.hasServiceRoleKey) {
        setShowSyncSqlModal(true);
      } else {
        showToast(data.message || "All Supabase Auth accounts are synchronized.");
        await loadAdminData(true);
      }
    } catch (err: any) {
      showToast("Error syncing auth users.");
    } finally {
      setIsSyncingAuth(false);
    }
  };

  useEffect(() => {
    loadAdminData();
    loadDbStatus();
  }, []);

  // If on Users tab but no real users exist, fall back to reports
  useEffect(() => {
    if (!loading && usersList.length === 0 && activeTab === "users") {
      setActiveTab("reports");
    }
  }, [loading, usersList, activeTab]);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  // Soft Delete Clip
  const handleDeleteClip = async (clipId: string) => {
    // Optimistically mark as deleted
    setClipsList(prev => prev.map(c => c.id === clipId ? { ...c, deleted: true } : c));
    try {
      const res = await adminFetch(`/api/admin/clips/${clipId}/delete`, { method: "POST" });
      if (res.ok) {
        showToast("Clip soft-deleted successfully.");
        onRefreshClips();
        await loadAdminData(true);
      } else {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Delete API failed");
      }
    } catch (err: any) {
      showToast(err?.message || "Failed to delete clip.");
      await loadAdminData(true);
    }
  };

  // Restore Soft-Deleted Clip
  const handleRestoreClip = async (clipId: string) => {
    // Optimistically mark as active
    setClipsList(prev => prev.map(c => c.id === clipId ? { ...c, deleted: false } : c));
    try {
      const res = await adminFetch(`/api/admin/clips/${clipId}/restore`, { method: "POST" });
      if (res.ok) {
        showToast("Clip restored successfully.");
        onRefreshClips();
        await loadAdminData(true);
      } else {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Restore API failed");
      }
    } catch (err: any) {
      showToast(err?.message || "Failed to restore clip.");
      await loadAdminData(true);
    }
  };

  // Permanently Purge Clip (delete storage objects + DB row)
  const executePurge = async () => {
    if (!clipToPurge) return;
    const targetClip = clipToPurge;
    const clipId = targetClip.id;

    setIsPurging(true);
    purgedClipIdsRef.current.add(clipId);

    // Immediately remove from UI lists (optimistic deletion from Content Browser)
    const prevClips = [...clipsList];
    const prevReports = [...reportsList];
    setClipsList(prev => prev.filter(c => c.id !== clipId));
    setReportsList(prev => prev.filter(r => r.clipId !== clipId));
    setStats(prev => prev ? {
      ...prev,
      overview: {
        ...prev.overview,
        totalClips: Math.max(0, (prev.overview?.totalClips || 1) - 1)
      }
    } : null);

    try {
      const res = await adminFetch(`/api/admin/clips/${clipId}/purge`, { method: "POST" });
      if (res.ok) {
        showToast("Clip and storage assets deleted forever.");
        setClipToPurge(null);
        onRefreshClips();
        await loadAdminData(true, clipId);
      } else {
        const data = await res.json().catch(() => ({}));
        purgedClipIdsRef.current.delete(clipId);
        // Revert UI on error
        setClipsList(prevClips);
        setReportsList(prevReports);
        throw new Error(data.error || "Purge API failed");
      }
    } catch (err: any) {
      console.error("Purge error:", err);
      showToast(err?.message || "Failed to permanently delete clip.");
      await loadAdminData(true);
    } finally {
      setIsPurging(false);
    }
  };

  // Open the confirmation modal for purging
  const handlePurgeClip = (clip: Clip) => {
    setClipToPurge(clip);
  };

  // Dismiss report
  const handleDismissReport = async (reportId: string) => {
    try {
      const res = await adminFetch(`/api/admin/reports/${reportId}/dismiss`, { method: "POST" });
      if (res.ok) {
        showToast("Report dismissed.");
        await loadAdminData();
      } else {
        throw new Error("Dismiss API failed");
      }
    } catch (err) {
      showToast("Failed to dismiss report.");
    }
  };

  // Suspend User
  const handleSuspendUser = async (username: string) => {
    try {
      const res = await adminFetch(`/api/admin/users/${encodeURIComponent(username)}/suspend`, { method: "POST" });
      if (res.ok) {
        showToast(`User @${username} suspended.`);
        await loadAdminData();
      } else {
        throw new Error("Suspend API failed");
      }
    } catch (err) {
      showToast("Failed to suspend user.");
    }
  };

  // Unsuspend User
  const handleUnsuspendUser = async (username: string) => {
    try {
      const res = await adminFetch(`/api/admin/users/${encodeURIComponent(username)}/unsuspend`, { method: "POST" });
      if (res.ok) {
        showToast(`Suspension lifted for @${username}.`);
        await loadAdminData();
      } else {
        throw new Error("Unsuspend API failed");
      }
    } catch (err) {
      showToast("Failed to unsuspend user.");
    }
  };

  // Issue Strike
  const handleIssueStrike = async (username: string) => {
    try {
      const res = await adminFetch(`/api/admin/users/${encodeURIComponent(username)}/strike`, { method: "POST" });
      if (res.ok) {
        const data = await res.json();
        const strikesCount = data.user?.strikes || 0;
        const autoSuspended = strikesCount >= 3;
        showToast(`Strike issued to @${username}. Total strikes: ${strikesCount}.${autoSuspended ? " User suspended." : ""}`);
        await loadAdminData();
      } else {
        throw new Error("Strike API failed");
      }
    } catch (err) {
      showToast("Failed to issue strike.");
    }
  };

  // Clear User Avatar
  const handleClearAvatar = async (userId?: string) => {
    if (!userId) return;
    try {
      const res = await adminFetch(`/api/admin/users/${userId}/clear-avatar`, { method: "POST" });
      if (res.ok) {
        showToast("Avatar cleared");
        await loadAdminData();
      } else {
        const data = await res.json().catch(() => null);
        showToast(data?.error || "Failed to clear avatar");
      }
    } catch (err: any) {
      showToast(err?.message || "Failed to clear avatar");
    }
  };

  // Localhost-only test report generator (never shown in production)
  const handleTriggerLocalhostMockReport = async () => {
    if (clipsList.length === 0) {
      showToast("No clips available to report.");
      return;
    }
    const targetClip = clipsList[Math.floor(Math.random() * clipsList.length)];
    const reasons = ["Pornography", "Copyright", "Harassment", "Spam", "Violence", "Other"];
    const randomReason = reasons[Math.floor(Math.random() * reasons.length)];
    
    try {
      const res = await fetch(`/api/clips/${targetClip.id}/report`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reporter: "LocalTester_" + Math.floor(Math.random() * 100),
          reason: randomReason
        })
      });
      if (res.ok) {
        showToast(`Localhost report created for clip by @${targetClip.authorName}`);
        await loadAdminData();
      }
    } catch (e) {
      showToast("Failed to create test report.");
    }
  };

  // Filter and sort clips
  const filteredClips = useMemo(() => {
    const filtered = clipsList.filter(c => {
      const matchesSearch = c.authorName.toLowerCase().includes(searchQuery.toLowerCase()) || 
                            (c.voiceText || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
                            (c.overlayText || "").toLowerCase().includes(searchQuery.toLowerCase());
      const matchesUser = selectedUserFilter ? c.authorName.toLowerCase() === selectedUserFilter.toLowerCase() : true;
      let matchesStatus = true;
      if (statusFilter === "live") matchesStatus = !c.deleted;
      else if (statusFilter === "deleted") matchesStatus = !!c.deleted;
      else if (statusFilter === "reported") matchesStatus = (c.reportCount || 0) > 0;

      return matchesSearch && matchesUser && matchesStatus;
    });

    return [...filtered].sort((a, b) => {
      if (sortBy === "likes") {
        return (b.likesCount || 0) - (a.likesCount || 0);
      } else if (sortBy === "reactions") {
        const repliesA = clipsList.filter(c => c.parentId === a.id).length;
        const repliesB = clipsList.filter(c => c.parentId === b.id).length;
        return repliesB - repliesA;
      } else if (sortBy === "reported") {
        return (b.reportCount || 0) - (a.reportCount || 0);
      } else {
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      }
    });
  }, [clipsList, searchQuery, selectedUserFilter, statusFilter, sortBy]);

  // User Manager Counts and Filtered List
  const confirmedUsersCount = useMemo(() => {
    return usersList.filter(u => Boolean(u.isConfirmed || (u.email && u.email.includes("@")))).length;
  }, [usersList]);

  const guestUsersCount = useMemo(() => {
    return Math.max(0, usersList.length - confirmedUsersCount);
  }, [usersList, confirmedUsersCount]);

  const filteredUsersList = useMemo(() => {
    return usersList.filter(u => {
      const isConf = Boolean(u.isConfirmed || (u.email && u.email.includes("@")));
      if (userCategoryFilter === "confirmed" && !isConf) return false;
      if (userCategoryFilter === "guests" && isConf) return false;
      if (userSearchQuery.trim()) {
        const q = userSearchQuery.toLowerCase();
        const matchesName = (u.username || "").toLowerCase().includes(q);
        const matchesEmail = (u.email || "").toLowerCase().includes(q);
        if (!matchesName && !matchesEmail) return false;
      }
      return true;
    });
  }, [usersList, userCategoryFilter, userSearchQuery]);

  // Dynamic Navigation Tabs
  const navTabs: Array<{ id: AdminTab; label: string; desc: string; badge?: number }> = [
    { id: "reports", label: "🚩 Reports Queue", desc: "Open reports queue", badge: reportsList.length },
    { id: "content", label: "📝 Content Browser", desc: "Clips & moderation" },
    { id: "dashboard", label: "📊 Dashboard", desc: "Real count overview" },
    ...(usersList.length > 0 ? [{ 
      id: "users" as AdminTab, 
      label: "👥 Users Manager", 
      desc: "Auth-backed profiles", 
      badge: confirmedUsersCount > 0 ? confirmedUsersCount : usersList.length 
    }] : []),
    { id: "badges", label: "Business badges", desc: "Give or remove Verified" },
    { id: "packs", label: "🎁 Packs", desc: "Founders, codes, grants" },
    { id: "settings", label: "⚙️ Settings", desc: "Database diagnostics" },
  ];

  return (
    <div id="admin-panel-overlay" className="fixed inset-0 z-50 bg-[#050608]/95 backdrop-blur-md flex flex-col md:flex-row text-slate-100 font-sans">
      
      {/* Toast Alert */}
      <AnimatePresence>
        {toastMessage && (
          <motion.div 
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="fixed top-4 left-1/2 transform -translate-x-1/2 z-50 px-4 py-2.5 bg-red-600 border border-red-500 text-white font-mono font-bold text-xs rounded-xl shadow-lg flex items-center gap-2"
          >
            <ShieldAlert className="w-4 h-4 shrink-0" />
            <span>{toastMessage}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Sidebar navigation */}
      <div className="w-full md:w-64 bg-[#0a0c10] border-r border-slate-900 flex flex-col shrink-0">
        
        {/* Sidebar Header */}
        <div className="p-5 border-b border-slate-900 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-red-600/10 border border-red-500/20 flex items-center justify-center text-red-400">
              <Shield className="w-4 h-4" />
            </div>
            <div>
              <h2 className="font-sans font-black text-xs uppercase tracking-wider text-slate-100">Reax Admin</h2>
              <span className="text-[9px] font-mono font-bold text-red-500 uppercase tracking-widest block -mt-0.5">Control Terminal</span>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-1 bg-slate-950 border border-slate-800 hover:border-slate-700 hover:text-white rounded-lg transition-colors cursor-pointer block md:hidden"
          >
            <X className="w-4 h-4 text-slate-400" />
          </button>
        </div>

        {/* Sidebar Tabs */}
        <nav className="flex-1 p-4 space-y-1">
          {navTabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => {
                setActiveTab(tab.id);
                setSelectedUserFilter(null);
              }}
              className={`w-full flex items-center justify-between p-3 rounded-xl border text-left transition-all cursor-pointer group active:scale-98 ${
                activeTab === tab.id
                  ? "bg-red-500/10 border-red-500/30 text-red-200 shadow-md shadow-red-500/5"
                  : "bg-transparent border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-950"
              }`}
            >
              <div className="min-w-0">
                <span className="text-xs font-bold block">{tab.label}</span>
                <span className="text-[9px] text-slate-500 block leading-tight mt-0.5 group-hover:text-slate-400">{tab.desc}</span>
              </div>
              {tab.badge !== undefined && tab.badge > 0 ? (
                <span className="px-1.5 py-0.5 bg-red-500 border border-red-400 text-white font-mono font-black text-[9px] rounded-full">
                  {tab.badge}
                </span>
              ) : null}
            </button>
          ))}
        </nav>

        {/* Sidebar Footer */}
        <div className="p-4 border-t border-slate-900 bg-slate-950/40 text-center space-y-2">
          <div className="flex items-center justify-center gap-1 text-[9px] font-mono text-slate-500 font-bold uppercase tracking-wider">
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping mr-1" />
            Admin Authenticated
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button 
              onClick={onClose}
              className="py-2 bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 hover:text-white rounded-xl text-[10px] font-mono font-bold transition-all active:scale-95 uppercase tracking-wider cursor-pointer"
            >
              Exit
            </button>
            <button 
              onClick={() => {
                localStorage.removeItem("reax_admin_passcode");
                onClose();
                window.location.href = "/";
              }}
              className="py-2 bg-red-950/20 hover:bg-red-950/40 border border-red-500/20 text-red-400 hover:text-red-300 rounded-xl text-[10px] font-mono font-bold transition-all active:scale-95 uppercase tracking-wider cursor-pointer flex items-center justify-center gap-1"
              title="Clear stored admin session and exit"
            >
              🔒 Lock
            </button>
          </div>
        </div>
      </div>

      {/* Main Content Pane */}
      <div className="flex-1 overflow-y-auto flex flex-col bg-[#050608]">
        
        {/* Pane Header */}
        <header className="p-5 border-b border-slate-900 bg-[#08090c]/80 flex items-center justify-between">
          <div>
            <span className="text-[9px] font-mono font-bold text-red-500 uppercase tracking-widest block">ADMIN PANEL</span>
            <h1 className="font-sans font-black text-xl text-white uppercase tracking-tight -mt-0.5">
              {activeTab === "reports" && "🚩 Moderation Reports Queue"}
              {activeTab === "content" && "📝 Content Browser"}
              {activeTab === "dashboard" && "📊 Dashboard Analytics"}
              {activeTab === "users" && "👥 Community User Directory"}
              {activeTab === "badges" && "🏷️ Business Badges"}
              {activeTab === "packs" && "🎁 Reaction Packs"}
              {activeTab === "settings" && "⚙️ System Configuration"}
            </h1>
          </div>
          <div className="flex items-center gap-3">
            <button 
              onClick={loadAdminData}
              className="p-2 bg-slate-900 hover:bg-slate-800 border border-slate-800 hover:border-slate-700 text-slate-400 hover:text-white rounded-xl transition-all active:scale-95 cursor-pointer"
              title="Refresh Admin Data"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin text-red-400" : ""}`} />
            </button>
            <button 
              onClick={onClose}
              className="p-2 bg-slate-900 hover:bg-slate-850 border border-slate-800 hover:border-slate-700 text-slate-400 hover:text-white rounded-xl transition-all active:scale-95 hidden md:block cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </header>

        {/* Pane Body */}
        <div className="p-6 flex-1 max-w-5xl w-full mx-auto space-y-6">
          
          {loading ? (
            <div className="flex flex-col items-center justify-center py-24 space-y-3">
              <RefreshCw className="w-8 h-8 text-red-500 animate-spin" />
              <p className="text-xs font-mono font-bold text-slate-400 uppercase tracking-widest">Loading administrative records...</p>
            </div>
          ) : (
            <div className="space-y-6">

              {/* TAB 1: REPORTS QUEUE (PRIMARY MODERATION TOOL) */}
              {activeTab === "reports" && (
                <div className="space-y-5">
                  
                  <div className="bg-red-500/5 border border-red-500/10 rounded-2xl p-4 flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <AlertTriangle className="w-5 h-5 text-red-500" />
                      <div>
                        <h4 className="text-xs font-bold text-slate-100 uppercase font-mono">Launch Moderation Queue</h4>
                        <p className="text-[10px] text-slate-400 mt-0.5">
                          Review user-submitted reports for copyright, harassment, explicit content, or spam.
                        </p>
                      </div>
                    </div>

                    {/* Localhost-only sandbox trigger */}
                    {isLocalhost && (
                      <button 
                        onClick={handleTriggerLocalhostMockReport}
                        className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-400 hover:text-white rounded-xl text-[10px] font-mono font-bold uppercase transition-all"
                        title="Available only on localhost"
                      >
                        [Localhost Sandbox Test]
                      </button>
                    )}
                  </div>

                  {/* Reports list */}
                  <div className="bg-slate-950 border border-slate-900 rounded-3xl overflow-hidden shadow-lg">
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs font-mono">
                        <thead className="bg-[#0a0c10] text-slate-400 border-b border-slate-900 font-bold">
                          <tr>
                            <th className="p-4 uppercase text-[9px] tracking-wider">Reported Clip</th>
                            <th className="p-4 uppercase text-[9px] tracking-wider">Author</th>
                            <th className="p-4 uppercase text-[9px] tracking-wider">Reporter</th>
                            <th className="p-4 uppercase text-[9px] tracking-wider">Reason</th>
                            <th className="p-4 uppercase text-[9px] tracking-wider">Reported Time</th>
                            <th className="p-4 uppercase text-[9px] tracking-wider text-right">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-900/60 text-slate-300">
                          {reportsList.length === 0 ? (
                            <tr>
                              <td colSpan={6} className="p-12 text-center text-slate-500 font-sans">
                                🛡️ Moderation queue is empty. No open violation reports.
                              </td>
                            </tr>
                          ) : (
                            reportsList.map((report) => {
                              const clip = report.clip;
                              const isVideo = clip?.mediaUrl?.endsWith(".mp4") || clip?.mediaUrl?.endsWith(".webm") || clip?.mediaUrl?.includes("mixkit-");
                              return (
                                <tr key={report.id} className="hover:bg-slate-900/30 transition-colors">
                                  
                                  {/* Reported Content preview */}
                                  <td className="p-4">
                                    {clip ? (
                                      <div className="flex items-center gap-3">
                                        <div className="w-14 h-11 bg-slate-900 rounded-lg overflow-hidden border border-slate-800 shrink-0 relative flex items-center justify-center reax-protected-media" onContextMenu={blockMediaEvent}>
                                          {isVideo ? (
                                            <video {...protectedMediaProps} controlsList="nodownload noremoteplayback" disablePictureInPicture src={clip.mediaUrl} className="w-full h-full object-cover reax-protected-media select-none" muted />
                                          ) : (
                                            <img {...protectedMediaProps} src={clip.mediaUrl} className="w-full h-full object-cover reax-protected-media select-none" referrerPolicy="no-referrer" />
                                          )}
                                        </div>
                                        <div className="min-w-0 max-w-[180px]">
                                          {clip.overlayText && (
                                            <span className="text-[10px] text-white block truncate font-bold">"{clip.overlayText}"</span>
                                          )}
                                          {clip.voiceText && (
                                            <span className="text-[9px] text-indigo-400 block truncate italic">🎙️ "{clip.voiceText}"</span>
                                          )}
                                          {clip.deleted && (
                                            <span className="text-[8px] text-red-500 uppercase font-bold block mt-0.5">● Soft-Deleted</span>
                                          )}
                                        </div>
                                      </div>
                                    ) : (
                                      <span className="text-slate-500 italic">[Clip Unavailable]</span>
                                    )}
                                  </td>

                                  {/* Author */}
                                  <td className="p-4 font-bold text-red-400">
                                    {clip ? `@${clip.authorName}` : "—"}
                                  </td>

                                  {/* Reporter */}
                                  <td className="p-4 text-slate-400 font-medium">
                                    {report.reporter}
                                  </td>

                                  {/* Reason */}
                                  <td className="p-4">
                                    <span className="px-2 py-0.5 bg-red-500/10 border border-red-500/20 text-red-400 rounded font-bold text-[9px] uppercase">
                                      ⚠️ {report.reason}
                                    </span>
                                  </td>

                                  {/* Time */}
                                  <td className="p-4 text-[10px] text-slate-500">
                                    {new Date(report.createdAt).toLocaleDateString()} <br />
                                    <span className="text-[9px] text-slate-600">
                                      {new Date(report.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                    </span>
                                  </td>

                                  {/* Actions */}
                                  <td className="p-4 text-right space-x-1.5 whitespace-nowrap">
                                    <button 
                                      onClick={() => handleDismissReport(report.id)}
                                      className="px-2.5 py-1 bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 hover:text-white rounded-lg text-[9px] font-bold uppercase transition-all cursor-pointer"
                                      title="Dismiss report"
                                    >
                                      Dismiss
                                    </button>

                                    {clip && !clip.deleted && (
                                      <button 
                                        onClick={() => handleDeleteClip(clip.id)}
                                        className="px-2.5 py-1 bg-red-600 hover:bg-red-500 text-white font-bold text-[9px] rounded-lg transition-all uppercase cursor-pointer"
                                        title="Soft delete clip"
                                      >
                                        Delete Clip
                                      </button>
                                    )}

                                    {clip && clip.deleted && (
                                      <div className="inline-flex items-center gap-1.5">
                                        <button 
                                          onClick={() => handleRestoreClip(clip.id)}
                                          className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-[9px] rounded-lg transition-all uppercase cursor-pointer"
                                          title="Restore clip"
                                        >
                                          Restore
                                        </button>
                                        <button 
                                          onClick={() => handlePurgeClip(clip)}
                                          className="px-2.5 py-1 bg-red-950/40 hover:bg-red-900/60 border border-red-800/50 hover:border-red-600 text-red-300 hover:text-white font-bold text-[9px] rounded-lg transition-all uppercase cursor-pointer"
                                          title="Delete forever"
                                        >
                                          Delete forever
                                        </button>
                                      </div>
                                    )}
                                  </td>

                                </tr>
                              );
                            })
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>

                </div>
              )}

              {/* TAB 2: CONTENT BROWSER */}
              {activeTab === "content" && (
                <div className="space-y-5">
                  
                  {/* Search and filter toolbar */}
                  <div className="flex flex-col sm:flex-row gap-3">
                    <div className="flex-1 relative">
                      <input 
                        type="text" 
                        placeholder="Search clips by author, caption, voice text..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full bg-slate-950 border border-slate-900 rounded-xl px-4 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-red-500/40 transition-colors font-mono"
                      />
                      {searchQuery && (
                        <button 
                          onClick={() => setSearchQuery("")}
                          className="absolute right-3 top-2.5 text-slate-500 hover:text-slate-300 font-mono text-[10px] uppercase font-bold"
                        >
                          Clear
                        </button>
                      )}
                    </div>

                    {/* Quick status filter */}
                    <div className="flex items-center gap-1 bg-slate-950 border border-slate-900 rounded-xl p-1 shrink-0 font-mono text-[10px]">
                      {(["all", "live", "deleted", "reported"] as const).map((filterKey) => (
                        <button
                          key={filterKey}
                          onClick={() => setStatusFilter(filterKey)}
                          className={`px-2.5 py-1.5 rounded-lg capitalize transition-colors cursor-pointer font-bold ${
                            statusFilter === filterKey 
                              ? "bg-slate-850 text-red-400 border border-slate-800" 
                              : "text-slate-500 hover:text-slate-300"
                          }`}
                        >
                          {filterKey === "all" ? "All Posts" : filterKey}
                        </button>
                      ))}
                    </div>

                    {/* Sort selector */}
                    <div className="flex items-center gap-1.5 bg-slate-950 border border-slate-900 rounded-xl px-3 shrink-0">
                      <span className="text-[10px] text-slate-500 font-mono font-bold uppercase whitespace-nowrap">Sort:</span>
                      <select 
                        value={sortBy}
                        onChange={(e) => setSortBy(e.target.value as any)}
                        className="bg-transparent text-xs text-red-400 font-mono font-bold focus:outline-none cursor-pointer py-2 pr-2"
                      >
                        <option value="newest" className="bg-[#050608] text-slate-300">Newest</option>
                        <option value="likes" className="bg-[#050608] text-slate-300">Most Liked</option>
                        <option value="reactions" className="bg-[#050608] text-slate-300">Most Reacted</option>
                        <option value="reported" className="bg-[#050608] text-slate-300">Most Reported</option>
                      </select>
                    </div>

                    {selectedUserFilter && (
                      <div className="bg-red-500/10 border border-red-500/20 rounded-xl px-3 py-2 flex items-center justify-between text-xs font-mono text-red-400">
                        <span>Showing user: <strong>@{selectedUserFilter}</strong></span>
                        <button 
                          onClick={() => setSelectedUserFilter(null)}
                          className="ml-3 text-slate-500 hover:text-white cursor-pointer"
                        >
                          ✕
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Content browser table layout */}
                  <div className="bg-slate-950 border border-slate-900 rounded-3xl overflow-hidden shadow-lg">
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs font-mono">
                        <thead className="bg-[#0a0c10] text-slate-400 border-b border-slate-900 font-bold">
                          <tr>
                            <th className="p-4 uppercase text-[9px] tracking-wider">Preview</th>
                            <th className="p-4 uppercase text-[9px] tracking-wider">Author</th>
                            <th className="p-4 uppercase text-[9px] tracking-wider">Created</th>
                            <th className="p-4 uppercase text-[9px] tracking-wider text-center">Engagement</th>
                            <th className="p-4 uppercase text-[9px] tracking-wider">Moderation Status</th>
                            <th className="p-4 uppercase text-[9px] tracking-wider text-right">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-900/60 text-slate-300">
                          {filteredClips.length === 0 ? (
                            <tr>
                              <td colSpan={6} className="p-12 text-center text-slate-500 font-sans">
                                No clips match your active search or status filter.
                              </td>
                            </tr>
                          ) : (
                            filteredClips.map((clip) => {
                              const isVideo = clip.mediaUrl.endsWith(".mp4") || clip.mediaUrl.endsWith(".webm") || clip.mediaUrl.includes("mixkit-");
                              return (
                                <tr key={clip.id} className={`hover:bg-slate-900/30 transition-colors ${clip.deleted ? "bg-red-950/5" : ""}`}>
                                  
                                  {/* Preview media */}
                                  <td className="p-4 min-w-[120px]">
                                    <div className="w-16 h-12 bg-slate-900 rounded-lg overflow-hidden border border-slate-800 relative flex items-center justify-center reax-protected-media" onContextMenu={blockMediaEvent}>
                                      {isVideo ? (
                                        <video {...protectedMediaProps} controlsList="nodownload noremoteplayback" disablePictureInPicture src={clip.mediaUrl} className="w-full h-full object-cover reax-protected-media select-none" muted />
                                      ) : (
                                        <img {...protectedMediaProps} src={clip.mediaUrl} className="w-full h-full object-cover reax-protected-media select-none" referrerPolicy="no-referrer" />
                                      )}
                                      {clip.overlayText && (
                                        <span className="absolute bottom-0 inset-x-0 bg-black/60 text-[7px] text-center uppercase tracking-tight py-0.5 font-bold block truncate">
                                          {clip.overlayText}
                                        </span>
                                      )}
                                    </div>
                                  </td>

                                  {/* Author */}
                                  <td className="p-4 font-bold">
                                    <button 
                                      onClick={() => setSelectedUserFilter(clip.authorName)}
                                      className="text-red-400 hover:underline hover:text-red-300 cursor-pointer"
                                    >
                                      @{clip.authorName}
                                    </button>
                                  </td>

                                  {/* Date */}
                                  <td className="p-4 text-[10px] text-slate-500">
                                    {new Date(clip.createdAt).toLocaleDateString()} <br />
                                    <span className="text-[9px] text-slate-600">
                                      {new Date(clip.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                    </span>
                                  </td>

                                  {/* Engagement counts */}
                                  <td className="p-4 text-center">
                                    <div className="flex justify-center items-center gap-3">
                                      <span title="Likes">❤️ {clip.likesCount || 0}</span>
                                      <span title="Reports">🚩 {clip.reportCount || 0}</span>
                                    </div>
                                    {clip.voiceText && (
                                      <div className="text-[8px] text-indigo-400 mt-1 max-w-[140px] truncate mx-auto" title={clip.voiceText}>
                                        🎙️ "{clip.voiceText}"
                                      </div>
                                    )}
                                  </td>

                                  {/* Moderation Status */}
                                  <td className="p-4">
                                    {clip.deleted ? (
                                      <span className="px-2 py-0.5 bg-red-500/10 border border-red-500/20 text-red-400 rounded text-[9px] uppercase font-black">
                                        ● Soft-Deleted
                                      </span>
                                    ) : (
                                      <span className="px-2 py-0.5 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded text-[9px] uppercase font-black">
                                        ● Live
                                      </span>
                                    )}
                                  </td>

                                  {/* Action buttons */}
                                  <td className="p-4 text-right space-x-1.5 whitespace-nowrap">
                                    <button 
                                      onClick={() => onSelectThread(clip.parentId || clip.id)}
                                      className="p-1.5 bg-slate-900 hover:bg-slate-800 border border-slate-800 hover:border-slate-700 text-slate-400 hover:text-white rounded-lg transition-colors cursor-pointer inline-flex items-center"
                                      title="View Thread"
                                    >
                                      <Eye className="w-3.5 h-3.5" />
                                    </button>

                                    {clip.deleted ? (
                                      <div className="inline-flex items-center gap-1.5">
                                        <button 
                                          onClick={() => handleRestoreClip(clip.id)}
                                          className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-[9px] rounded-lg transition-all cursor-pointer uppercase"
                                          title="Restore clip"
                                        >
                                          Restore
                                        </button>
                                        <button 
                                          onClick={() => handlePurgeClip(clip)}
                                          className="px-2.5 py-1 bg-red-950/40 hover:bg-red-900/60 border border-red-800/50 hover:border-red-600 text-red-300 hover:text-white font-bold text-[9px] rounded-lg transition-all cursor-pointer uppercase"
                                          title="Delete forever"
                                        >
                                          Delete forever
                                        </button>
                                      </div>
                                    ) : (
                                      <button 
                                        onClick={() => handleDeleteClip(clip.id)}
                                        className="px-2.5 py-1 bg-red-600 hover:bg-red-500 text-white font-bold text-[9px] rounded-lg transition-all uppercase cursor-pointer inline-flex items-center gap-1"
                                        title="Soft Delete Clip (Hide from feed)"
                                      >
                                        <Trash2 className="w-3 h-3" />
                                        <span>Delete</span>
                                      </button>
                                    )}
                                  </td>

                                </tr>
                              );
                            })
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>

                </div>
              )}

              {/* TAB 3: DASHBOARD (REAL COUNT OVERVIEW) */}
              {activeTab === "dashboard" && stats && (
                <div className="space-y-6">
                  
                  {/* Real Counts Overview Row */}
                  <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
                    {[
                      { 
                        label: "Total Clips", 
                        value: stats.overview?.totalClips !== undefined ? stats.overview.totalClips : "—", 
                        color: "text-white", 
                        desc: "Real count of database clips" 
                      },
                      { 
                        label: "Root Threads", 
                        value: stats.overview?.totalRootThreads !== undefined ? stats.overview.totalRootThreads : "—", 
                        color: "text-rose-400", 
                        desc: "Top-level conversation starters" 
                      },
                      { 
                        label: "Cascade Replies", 
                        value: stats.overview?.totalReplies !== undefined ? stats.overview.totalReplies : "—", 
                        color: "text-amber-400", 
                        desc: "Threaded video responses" 
                      },
                      { 
                        label: "Open Reports", 
                        value: stats.overview?.openReports !== undefined ? stats.overview.openReports : "—", 
                        color: "text-red-400", 
                        desc: "Pending moderation tickets" 
                      },
                    ].map((card, idx) => (
                      <div key={idx} className="bg-slate-950 border border-slate-900 rounded-2xl p-4 flex flex-col justify-between shadow-lg relative overflow-hidden">
                        <span className="text-[10px] font-mono font-bold text-slate-500 uppercase tracking-wider">{card.label}</span>
                        <span className={`text-2xl font-sans font-black mt-2 tracking-tight ${card.color}`}>
                          {card.value}
                        </span>
                        <span className="text-[8px] text-slate-600 font-mono mt-1 uppercase tracking-wider">{card.desc}</span>
                      </div>
                    ))}
                  </div>

                  {/* Registered users card (shown only if real user profiles exist) */}
                  {stats.overview?.totalUsers !== undefined && stats.overview.totalUsers > 0 && (
                    <div className="bg-slate-950 border border-slate-900 rounded-2xl p-4 flex items-center justify-between">
                      <div>
                        <span className="text-[10px] font-mono font-bold text-slate-500 uppercase tracking-wider block">Auth-Backed User Profiles</span>
                        <span className="text-xl font-sans font-black text-emerald-400 tracking-tight mt-0.5 block">
                          {stats.overview.totalUsers} registered account{stats.overview.totalUsers !== 1 ? "s" : ""}
                        </span>
                      </div>
                      <span className="text-[10px] font-mono text-emerald-500 font-bold bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-1 rounded-lg">
                        Real user_profiles
                      </span>
                    </div>
                  )}

                  {/* Real Content Breakdown */}
                  {stats.breakdown && (
                    <div className="bg-slate-950 border border-slate-900 rounded-3xl p-5 space-y-4">
                      <h3 className="text-xs font-sans font-black text-slate-200 uppercase tracking-widest flex items-center gap-2">
                        <Tv className="w-4 h-4 text-red-500" />
                        Content Format Distribution (Real Counts)
                      </h3>
                      
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-1">
                        {[
                          { label: "Voice Audio", val: stats.breakdown.voiceReactions ?? "—", desc: "Voice note attached", emoji: "🎙️" },
                          { label: "Silent Clips", val: stats.breakdown.silentReactions ?? "—", desc: "Captions / video only", emoji: "💬" },
                          { label: "Video Media", val: stats.breakdown.videoReactions ?? "—", desc: "MP4 / WebM video loops", emoji: "🎥" },
                          { label: "Static Visuals", val: stats.breakdown.imageReactions ?? "—", desc: "Static visual clips", emoji: "📸" },
                        ].map((item, idx) => (
                          <div key={idx} className="bg-slate-900/40 border border-slate-800/40 rounded-2xl p-4 text-center">
                            <span className="text-xl block mb-2">{item.emoji}</span>
                            <span className="text-[10px] text-slate-400 block font-bold uppercase tracking-wide">{item.label}</span>
                            <span className="text-2xl font-sans font-black text-white mt-1.5 block tracking-tight">{item.val}</span>
                            <span className="text-[9px] text-slate-500 mt-1 block">{item.desc}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                </div>
              )}

              {/* TAB 4: USERS MANAGER (SHOWN ONLY IF REAL USER PROFILES EXIST) */}
              {activeTab === "users" && usersList.length > 0 && (
                <div className="space-y-4">
                  
                  {/* Category Pills & Search Toolbar */}
                  <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-slate-950 border border-slate-900 p-3 rounded-2xl">
                    {/* Category Filter Pills */}
                    <div className="flex items-center gap-1.5 bg-[#0a0c10] p-1 rounded-xl border border-slate-900 overflow-x-auto">
                      <button
                        type="button"
                        onClick={() => setUserCategoryFilter("confirmed")}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
                          userCategoryFilter === "confirmed"
                            ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 shadow-sm"
                            : "text-slate-400 hover:text-slate-200 hover:bg-slate-900 border border-transparent"
                        }`}
                      >
                        <Check className="w-3.5 h-3.5 text-emerald-400" />
                        <span>Confirmed Accounts</span>
                        <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-mono font-bold ${
                          userCategoryFilter === "confirmed" ? "bg-emerald-500/30 text-emerald-200" : "bg-slate-800 text-slate-400"
                        }`}>
                          {confirmedUsersCount}
                        </span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setUserCategoryFilter("all")}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
                          userCategoryFilter === "all"
                            ? "bg-slate-800 text-white border border-slate-700 shadow-sm"
                            : "text-slate-400 hover:text-slate-200 hover:bg-slate-900 border border-transparent"
                        }`}
                      >
                        <span>All Accounts</span>
                        <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-mono font-bold ${
                          userCategoryFilter === "all" ? "bg-slate-700 text-slate-200" : "bg-slate-800 text-slate-400"
                        }`}>
                          {usersList.length}
                        </span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setUserCategoryFilter("guests")}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
                          userCategoryFilter === "guests"
                            ? "bg-slate-800 text-slate-300 border border-slate-700 shadow-sm"
                            : "text-slate-400 hover:text-slate-200 hover:bg-slate-900 border border-transparent"
                        }`}
                      >
                        <span>Guest Sessions</span>
                        <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-mono font-bold ${
                          userCategoryFilter === "guests" ? "bg-slate-700 text-slate-200" : "bg-slate-800 text-slate-400"
                        }`}>
                          {guestUsersCount}
                        </span>
                      </button>
                    </div>

                    {/* Sync Supabase Auth & Search Bar */}
                    <div className="flex items-center gap-2 flex-1 sm:max-w-md justify-end">
                      <button
                        type="button"
                        onClick={handleSyncAuthUsers}
                        disabled={isSyncingAuth}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 text-xs font-bold transition-all cursor-pointer disabled:opacity-50 whitespace-nowrap shrink-0"
                        title="Synchronize registered accounts from Supabase Authentication"
                      >
                        <RefreshCw className={`w-3.5 h-3.5 text-cyan-400 ${isSyncingAuth ? "animate-spin" : ""}`} />
                        <span>{isSyncingAuth ? "Syncing..." : "Sync Auth Users"}</span>
                      </button>

                      {/* Search Bar */}
                      <div className="relative flex-1">
                        <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                        <input
                          type="text"
                          value={userSearchQuery}
                          onChange={(e) => setUserSearchQuery(e.target.value)}
                          placeholder="Search username or email..."
                          className="w-full pl-8 pr-8 py-1.5 bg-[#0a0c10] border border-slate-900 rounded-xl text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-slate-700 font-mono"
                        />
                        {userSearchQuery && (
                          <button
                            type="button"
                            onClick={() => setUserSearchQuery("")}
                            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 text-xs"
                          >
                            ✕
                          </button>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Supabase Auth Discrepancy Clarification Banner */}
                  <div className="bg-cyan-950/20 border border-cyan-500/20 rounded-2xl p-3.5 text-xs text-slate-300 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                    <div className="flex items-start sm:items-center gap-2.5">
                      <Shield className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5 sm:mt-0" />
                      <div>
                        <span className="font-bold text-white mr-1.5">User Count Insight:</span>
                        <span className="text-slate-300">
                          Supabase stores authentication credentials in <code className="text-cyan-300 font-mono bg-cyan-950/60 px-1 py-0.5 rounded">auth.users</code>, whereas the app tracks profile records in <code className="text-cyan-300 font-mono bg-cyan-950/60 px-1 py-0.5 rounded">public.user_profiles</code>. 
                          The <strong>"Confirmed Accounts"</strong> tab specifically filters for accounts with email verification ({confirmedUsersCount}).
                        </span>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowSyncSqlModal(true)}
                      className="text-cyan-400 hover:text-cyan-300 font-bold underline cursor-pointer text-xs whitespace-nowrap self-end sm:self-auto"
                    >
                      View SQL Sync Script
                    </button>
                  </div>
                  
                  <div className="bg-slate-950 border border-slate-900 rounded-3xl overflow-hidden shadow-lg">
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs font-mono">
                        <thead className="bg-[#0a0c10] text-slate-400 border-b border-slate-900 font-bold">
                          <tr>
                            <th className="p-4 uppercase text-[9px] tracking-wider">Account / Username</th>
                            <th className="p-4 uppercase text-[9px] tracking-wider">Email Address</th>
                            <th className="p-4 uppercase text-[9px] tracking-wider">Joined</th>
                            <th className="p-4 uppercase text-[9px] tracking-wider text-center">Reactions</th>
                            <th className="p-4 uppercase text-[9px] tracking-wider">Last Active</th>
                            <th className="p-4 uppercase text-[9px] tracking-wider">Status & Strikes</th>
                            <th className="p-4 uppercase text-[9px] tracking-wider text-right">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-900/60 text-slate-300">
                          {filteredUsersList.length === 0 ? (
                            <tr>
                              <td colSpan={7} className="p-8 text-center text-slate-500">
                                <p className="text-sm font-bold text-slate-400 mb-1">No users found</p>
                                <p className="text-xs">
                                  {userCategoryFilter === "confirmed"
                                    ? "No confirmed email accounts match your criteria."
                                    : "No accounts found matching your query."}
                                </p>
                                {(userCategoryFilter !== "all" || userSearchQuery) && (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setUserCategoryFilter("all");
                                      setUserSearchQuery("");
                                    }}
                                    className="mt-3 px-3 py-1 bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 text-xs rounded-lg font-mono cursor-pointer"
                                  >
                                    Reset Filters
                                  </button>
                                )}
                              </td>
                            </tr>
                          ) : (
                            filteredUsersList.map((user) => {
                              const isConfirmed = Boolean(user.isConfirmed || (user.email && user.email.includes("@")));
                              return (
                                <tr key={user.username} className={`hover:bg-slate-900/30 transition-colors ${user.suspended ? "bg-red-950/5" : ""}`}>
                                  
                                  {/* Username & Verification Badge */}
                                  <td className="p-4 font-bold text-slate-200">
                                    <div className="flex items-center gap-2">
                                      <span className={`w-2 h-2 rounded-full shrink-0 ${user.suspended ? "bg-red-500" : "bg-emerald-400"}`} />
                                      <div className="flex items-center gap-1.5 flex-wrap">
                                        <Avatar url={user.avatarUrl} name={user.username} size={20} />
                                        <span className="font-mono text-xs">@{user.username}</span>
                                        {isConfirmed ? (
                                          <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[9px] font-bold uppercase tracking-wide">
                                            <Check className="w-2.5 h-2.5" /> Confirmed
                                          </span>
                                        ) : (
                                          <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-slate-800/60 border border-slate-800 text-slate-500 text-[9px] uppercase font-mono">
                                            Guest
                                          </span>
                                        )}
                                      </div>
                                    </div>
                                  </td>

                                  {/* Email */}
                                  <td className="p-4">
                                    {user.email ? (
                                      <div className="flex items-center gap-1.5 text-slate-300 font-mono text-[11px]">
                                        <Mail className="w-3 h-3 text-emerald-400 shrink-0" />
                                        <span className="select-all">{user.email}</span>
                                      </div>
                                    ) : (
                                      <span className="text-slate-600 text-[10px] italic">None (Guest Session)</span>
                                    )}
                                  </td>

                                  {/* Created */}
                                  <td className="p-4 text-[10px] text-slate-500">
                                    {new Date(user.createdAt).toLocaleDateString()}
                                  </td>

                                  {/* Count */}
                                  <td className="p-4 text-center font-bold">
                                    {user.reactionCount || 0}
                                  </td>

                                  {/* Last Active */}
                                  <td className="p-4 text-[10px] text-slate-400">
                                    {new Date(user.lastActive).toLocaleDateString()}
                                  </td>

                                  {/* Real Strikes */}
                                  <td className="p-4">
                                    <div className="flex items-center gap-2">
                                      {user.suspended ? (
                                        <span className="px-2 py-0.5 bg-red-500/10 border border-red-500/20 text-red-400 rounded text-[9px] uppercase font-black">
                                          Suspended
                                        </span>
                                      ) : (
                                        <span className="px-2 py-0.5 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded text-[9px] uppercase font-black">
                                          Active
                                        </span>
                                      )}
                                      <span className="text-[10px] text-slate-400 font-bold">
                                        ⚠️ {user.strikes || 0} strike{user.strikes !== 1 ? "s" : ""}
                                      </span>
                                    </div>
                                  </td>

                                  {/* Actions */}
                                  <td className="p-4 text-right space-x-1.5 whitespace-nowrap">
                                    <button 
                                      onClick={() => {
                                        setSelectedUserFilter(user.username);
                                        setActiveTab("content");
                                      }}
                                      className="px-2 py-1 bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 hover:text-white rounded-lg text-[9px] font-bold uppercase transition-all cursor-pointer"
                                      title="View user posts"
                                    >
                                      Clips
                                    </button>

                                    {user.avatarUrl && (
                                      <button 
                                        onClick={() => handleClearAvatar(user.id)}
                                        className="px-2 py-1 bg-slate-900 hover:bg-slate-800 border border-slate-800 text-rose-400 hover:text-rose-300 rounded-lg text-[9px] font-bold uppercase transition-all cursor-pointer"
                                        title="Clear avatar"
                                      >
                                        Clear avatar
                                      </button>
                                    )}

                                    <button 
                                      onClick={() => handleIssueStrike(user.username)}
                                      className="px-2 py-1 bg-yellow-500/10 hover:bg-yellow-500/20 border border-yellow-500/20 text-yellow-400 rounded-lg text-[9px] font-bold uppercase transition-all cursor-pointer"
                                      title="Issue formal warning strike"
                                    >
                                      +1 Strike
                                    </button>

                                    {user.suspended ? (
                                      <button 
                                        onClick={() => handleUnsuspendUser(user.username)}
                                        className="px-2 py-1 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-[9px] rounded-lg transition-all uppercase cursor-pointer"
                                      >
                                        Unsuspend
                                      </button>
                                    ) : (
                                      <button 
                                        onClick={() => handleSuspendUser(user.username)}
                                        className="px-2 py-1 bg-red-950/40 hover:bg-red-900 text-red-400 hover:text-white border border-red-900/30 rounded-lg text-[9px] font-bold transition-all uppercase cursor-pointer"
                                      >
                                        Suspend
                                      </button>
                                    )}
                                  </td>

                                </tr>
                              );
                            })
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Sync SQL Script Modal */}
                  <AnimatePresence>
                    {showSyncSqlModal && (
                      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
                        <motion.div
                          initial={{ opacity: 0, scale: 0.95 }}
                          animate={{ opacity: 1, scale: 1 }}
                          exit={{ opacity: 0, scale: 0.95 }}
                          className="bg-slate-950 border border-slate-800 rounded-3xl p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto space-y-4 shadow-2xl"
                        >
                          <div className="flex items-center justify-between pb-3 border-b border-slate-900">
                            <div className="flex items-center gap-2 text-cyan-400 font-bold text-sm">
                              <Database className="w-4 h-4 text-cyan-400" />
                              <span>Supabase Auth & Profiles Synchronization</span>
                            </div>
                            <button
                              type="button"
                              onClick={() => setShowSyncSqlModal(false)}
                              className="p-1 rounded-lg hover:bg-slate-900 text-slate-400 hover:text-slate-200 cursor-pointer"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          </div>

                          <div className="space-y-3 text-xs text-slate-300">
                            <p>
                              In Supabase, user accounts created via email signup reside in <code className="text-cyan-300 font-mono bg-slate-900 px-1 py-0.5 rounded">auth.users</code>. 
                              The application stores public display names and reaction counts in <code className="text-cyan-300 font-mono bg-slate-900 px-1 py-0.5 rounded">public.user_profiles</code>.
                            </p>
                            <p>
                              If users signed up directly in Supabase or before profile triggers were set, their email addresses can be synchronized into <code className="text-cyan-300 font-mono bg-slate-900 px-1 py-0.5 rounded">user_profiles</code> by executing this 10-second script in your Supabase SQL Editor:
                            </p>
                          </div>

                          <div className="relative">
                            <pre className="p-4 bg-[#0a0c10] border border-slate-900 rounded-2xl text-[11px] font-mono text-slate-300 overflow-x-auto max-h-64 leading-relaxed select-all">
                              {SYNC_AUTH_SQL}
                            </pre>
                            <button
                              type="button"
                              onClick={() => {
                                navigator.clipboard.writeText(SYNC_AUTH_SQL);
                                setCopiedSyncSql(true);
                                setTimeout(() => setCopiedSyncSql(false), 2000);
                              }}
                              className="absolute top-3 right-3 flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-white rounded-lg text-xs font-bold transition-all shadow-md cursor-pointer"
                            >
                              {copiedSyncSql ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                              <span>{copiedSyncSql ? "Copied!" : "Copy SQL"}</span>
                            </button>
                          </div>

                          <div className="flex items-center justify-between pt-2">
                            <span className="text-[11px] text-slate-500 font-mono">
                              💡 Once run, click "Sync Auth Users" or refresh this page.
                            </span>
                            <button
                              type="button"
                              onClick={() => setShowSyncSqlModal(false)}
                              className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-slate-200 rounded-xl text-xs font-bold cursor-pointer transition-colors"
                            >
                              Close
                            </button>
                          </div>
                        </motion.div>
                      </div>
                    )}
                  </AnimatePresence>
                </div>
              )}

              {/* TAB: BADGES MANAGER */}
              {activeTab === "badges" && (
                <BadgesTab
                  adminFetch={adminFetch}
                  showToast={showToast}
                  onRefreshClips={onRefreshClips}
                  onSyncAuth={handleSyncAuthUsers}
                  isSyncingAuth={isSyncingAuth}
                />
              )}

              {activeTab === "packs" && <PacksTab adminFetch={adminFetch} />}

              {/* TAB 5: SETTINGS (REAL DATABASE CONNECTIVITY DIAGNOSTICS ONLY) */}
              {activeTab === "settings" && (
                <div className="max-w-2xl bg-slate-950 border border-slate-900 rounded-3xl p-6 space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-sans font-black text-slate-200 uppercase tracking-widest flex items-center gap-2">
                      <Database className="w-4 h-4 text-emerald-500" />
                      Database Connectivity & Diagnostics
                    </h3>
                    <button
                      onClick={loadDbStatus}
                      disabled={loadingDbStatus}
                      className="p-1 text-slate-400 hover:text-slate-200 hover:bg-slate-900 rounded-lg transition-colors cursor-pointer"
                      title="Re-test Database Connectivity"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${loadingDbStatus ? "animate-spin text-emerald-500" : ""}`} />
                    </button>
                  </div>

                  <div className="space-y-4 pt-1">
                    {loadingDbStatus && !dbStatus ? (
                      <div className="flex flex-col items-center justify-center py-6 text-slate-500 font-mono text-xs">
                        <RefreshCw className="w-5 h-5 animate-spin mb-2 text-emerald-500" />
                        Testing database connection...
                      </div>
                    ) : dbStatus ? (
                      <div className="space-y-3">
                        {/* Connection Status Banner */}
                        <div className={`p-4 rounded-2xl border text-xs font-mono leading-normal ${
                          dbStatus.configured && dbStatus.tableExists && !dbStatus.connectionError
                            ? "bg-emerald-950/20 border-emerald-500/20 text-emerald-300"
                            : dbStatus.configured && dbStatus.connectionError?.includes("deleted")
                            ? "bg-amber-950/20 border-amber-500/20 text-amber-300"
                            : "bg-red-950/20 border-red-500/20 text-red-300"
                        }`}>
                          <div className="flex items-start gap-2.5">
                            {dbStatus.configured && dbStatus.tableExists && !dbStatus.connectionError ? (
                              <CheckCircle className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                            ) : (
                              <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                            )}
                            <div className="space-y-1">
                              <span className="font-bold uppercase tracking-wide block">
                                {dbStatus.configured && dbStatus.tableExists && !dbStatus.connectionError
                                  ? "Database Connected & Fully Operational"
                                  : dbStatus.configured
                                  ? "Database Connected (Schema Check Pending)"
                                  : "Local In-Memory Mode / Environment Config Required"}
                              </span>
                              <span className="text-[10px] text-slate-400 block font-sans">
                                {dbStatus.connectionError || "Connected successfully to remote database repository."}
                              </span>
                            </div>
                          </div>
                        </div>

                        {/* Quick Specs */}
                        <div className="grid grid-cols-2 gap-2 text-[10px] font-mono">
                          <div className="bg-slate-900/60 border border-slate-900 rounded-xl p-3">
                            <span className="text-slate-500 block uppercase text-[9px] mb-1">Environment Config</span>
                            <span className={`font-bold ${dbStatus.configured ? "text-emerald-400" : "text-slate-400"}`}>
                              {dbStatus.configured ? "✓ Remote Store Configured" : "In-Memory Store (Dev)"}
                            </span>
                          </div>
                          <div className="bg-slate-900/60 border border-slate-900 rounded-xl p-3">
                            <span className="text-slate-500 block uppercase text-[9px] mb-1">Clips Repository</span>
                            <span className={`font-bold ${dbStatus.tableExists ? "text-emerald-400" : "text-slate-400"}`}>
                              {dbStatus.tableExists ? "✓ Table Verified" : "Active"}
                            </span>
                          </div>
                        </div>

                        {dbStatus.supabaseUrl && (
                          <div className="bg-slate-900/40 border border-slate-900 rounded-xl p-3 font-mono text-[9px] text-slate-400 truncate">
                            <span className="text-slate-500 block uppercase text-[9px] mb-0.5">Database Endpoint</span>
                            {dbStatus.supabaseUrl}
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="text-xs text-slate-500 font-mono py-4 text-center">
                        Database status verification unavailable.
                      </div>
                    )}
                  </div>
                </div>
              )}

            </div>
          )}

        </div>

      </div>

      {/* Dedicated In-App Confirmation Modal for Delete Forever */}
      <AnimatePresence>
        {clipToPurge && (
          <div 
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
            onClick={() => {
              if (!isPurging) setClipToPurge(null);
            }}
          >
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-slate-900 border border-red-900/60 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4 text-left relative"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-red-950/60 border border-red-800/50 rounded-xl text-red-400">
                  <ShieldAlert className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white tracking-tight">Delete Forever</h3>
                  <p className="text-xs text-red-300 font-mono">Permanent wipe of media assets & database record</p>
                </div>
              </div>

              <div className="p-3 bg-slate-950/80 border border-slate-800/80 rounded-xl flex items-center gap-3">
                {clipToPurge.mediaUrl ? (
                  <img 
                    {...protectedMediaProps}
                    src={clipToPurge.mediaUrl} 
                    alt="Preview" 
                    className="w-14 h-14 rounded-lg object-cover border border-slate-700 bg-slate-900 shrink-0 reax-protected-media select-none" 
                    onError={(e) => {
                      (e.target as HTMLElement).style.display = 'none';
                    }}
                  />
                ) : (
                  <div className="w-14 h-14 rounded-lg bg-slate-800 flex items-center justify-center text-[10px] text-slate-500 font-mono shrink-0">
                    NO MEDIA
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-bold text-slate-200 truncate">{clipToPurge.authorName || "Anonymous"}</p>
                  <p className="text-[11px] text-slate-400 italic line-clamp-1">{clipToPurge.overlayText || clipToPurge.voiceText || "No text"}</p>
                  <p className="text-[9px] text-slate-500 font-mono mt-0.5">ID: {clipToPurge.id.slice(0, 8)}...</p>
                </div>
              </div>

              <p className="text-xs text-slate-400 leading-relaxed">
                Are you sure you want to permanently delete this clip forever? This will delete media and voice files from storage and remove the clip record from the database. <strong className="text-red-300">This cannot be undone.</strong>
              </p>

              <div className="flex items-center justify-end gap-2.5 pt-2">
                <button
                  type="button"
                  disabled={isPurging}
                  onClick={() => setClipToPurge(null)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-slate-300 font-semibold text-xs rounded-xl transition-all cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={isPurging}
                  onClick={executePurge}
                  className="px-4 py-2 bg-red-600 hover:bg-red-500 disabled:opacity-60 text-white font-bold text-xs rounded-xl shadow-lg shadow-red-950/50 transition-all flex items-center gap-1.5 cursor-pointer"
                >
                  {isPurging ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>Deleting forever...</span>
                    </>
                  ) : (
                    <>
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Delete forever</span>
                    </>
                  )}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

    </div>
  );
}

// ----------------------------------------------------
// Phone-friendly BadgesTab Component
// ----------------------------------------------------
interface BadgesTabProps {
  adminFetch: (url: string, options?: any) => Promise<Response>;
  showToast: (msg: string) => void;
  onRefreshClips: () => void;
  onSyncAuth: () => Promise<void>;
  isSyncingAuth: boolean;
}

interface BadgeAuditEntry {
  id: string;
  user_id: string;
  username: string;
  old_badge: string | null;
  new_badge: string | null;
  changed_by: string;
  note: string | null;
  created_at: string;
}

interface BadgeUserResult {
  id: string;
  user_id?: string;
  username: string;
  email?: string | null;
  badge_type?: string | null;
  is_official?: boolean;
  avatar_url?: string | null;
  created_at?: string;
  last_active?: string;
}

function BadgesTab({ adminFetch, showToast, onRefreshClips, onSyncAuth, isSyncingAuth }: BadgesTabProps) {
  const [query, setQuery] = useState("");
  const [searchResults, setSearchResults] = useState<BadgeUserResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [selectedUser, setSelectedUser] = useState<BadgeUserResult | null>(null);

  // Note and confirmation modal
  const [note, setNote] = useState("");
  const [pendingBadge, setPendingBadge] = useState<"verified_business" | null | undefined>(undefined);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Audit history
  const [auditLog, setAuditLog] = useState<BadgeAuditEntry[]>([]);
  const [isLoadingAudit, setIsLoadingAudit] = useState(false);

  const searchRequestIdRef = React.useRef(0);
  const debounceTimerRef = React.useRef<any>(null);

  // Fetch recent audit entries
  const loadRecentAudit = async () => {
    setIsLoadingAudit(true);
    try {
      // Prompt notes: GET /api/admin/badge-audit or user audit
      const res = await adminFetch("/api/admin/badge-audit");
      if (res.ok) {
        const data = await res.json();
        setAuditLog(Array.isArray(data?.audit) ? data.audit : Array.isArray(data) ? data : []);
      }
    } catch (err) {
      console.warn("Failed to fetch badge audit log:", err);
    } finally {
      setIsLoadingAudit(false);
    }
  };

  useEffect(() => {
    loadRecentAudit();
  }, []);

  // Search executor
  const performSearch = async (rawSearch: string) => {
    const clean = rawSearch.trim().replace(/^@+/, "");
    if (!clean) {
      setSearchResults([]);
      setIsSearching(false);
      setHasSearched(false);
      return;
    }

    const currentRequestId = ++searchRequestIdRef.current;
    setIsSearching(true);
    setHasSearched(true);

    try {
      const res = await adminFetch(`/api/admin/users/search?q=${encodeURIComponent(clean)}`);
      if (currentRequestId !== searchRequestIdRef.current) return; // Stale response

      if (res.ok) {
        const data = await res.json();
        const users = Array.isArray(data?.users) ? data.users : Array.isArray(data) ? data : [];
        setSearchResults(users);
      } else {
        setSearchResults([]);
      }
    } catch (err) {
      if (currentRequestId === searchRequestIdRef.current) {
        setSearchResults([]);
        showToast("Error searching users.");
      }
    } finally {
      if (currentRequestId === searchRequestIdRef.current) {
        setIsSearching(false);
      }
    }
  };

  // Handle typing input with debounce
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setQuery(val);

    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    const clean = val.trim().replace(/^@+/, "");
    if (clean.length >= 2) {
      debounceTimerRef.current = setTimeout(() => {
        performSearch(clean);
      }, 350);
    } else if (clean.length === 0) {
      setSearchResults([]);
      setHasSearched(false);
    }
  };

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    performSearch(query);
  };

  const handleSelectUser = (user: BadgeUserResult) => {
    setSelectedUser(user);
    setNote("");
  };

  // Trigger Confirmation Modal
  const requestBadgeChange = (badgeToSet: "verified_business" | null) => {
    setPendingBadge(badgeToSet);
    setShowConfirmModal(true);
  };

  // Execute badge RPC
  const confirmBadgeChange = async () => {
    if (!selectedUser) return;
    setIsSubmitting(true);
    try {
      const userId = selectedUser.id || selectedUser.user_id;
      const res = await adminFetch(`/api/admin/users/${userId}/badge`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          badge: pendingBadge,
          note: note.trim() || undefined
        })
      });

      const data = await res.json().catch(() => ({}));

      if (res.ok && (data.success || data.badge !== undefined)) {
        const newBadge = data.badge !== undefined ? data.badge : pendingBadge;
        // Update selectedUser state
        setSelectedUser(prev => prev ? { ...prev, badge_type: newBadge, is_official: newBadge === "official" } : null);

        // Update in searchResults list
        setSearchResults(prev => prev.map(u => {
          if ((u.id || u.user_id) === userId) {
            return { ...u, badge_type: newBadge, is_official: newBadge === "official" };
          }
          return u;
        }));

        showToast(newBadge === "verified_business" ? "Verified badge applied!" : "Badge removed.");
        setShowConfirmModal(false);
        setNote("");

        // Refresh feed / clips & audits
        onRefreshClips();
        await loadRecentAudit();
      } else {
        showToast(data.error || "Failed to update badge.");
      }
    } catch (err: any) {
      showToast(err?.message || "Error updating badge.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6 max-w-3xl w-full mx-auto">
      {/* Search Header Form */}
      <div className="bg-slate-950 border border-slate-900 rounded-3xl p-4 sm:p-6 space-y-4">
        <div>
          <h2 className="text-base font-bold text-white flex items-center gap-2">
            <Building2 className="w-5 h-5 text-amber-400" />
            <span>Search & Manage Badges</span>
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Search users by username or email to grant or revoke Verified Business or Official badges.
          </p>
        </div>

        <form onSubmit={handleFormSubmit} className="flex flex-col sm:flex-row items-stretch gap-2.5">
          <div className="relative flex-1">
            <input
              type="search"
              inputMode="search"
              enterKeyHint="search"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              placeholder="Username or email"
              value={query}
              onChange={handleInputChange}
              className="text-base h-12 w-full rounded-xl bg-[#0a0c10] border border-slate-800 focus:border-amber-500/50 focus:ring-1 focus:ring-amber-500/30 text-white px-4 placeholder:text-slate-500 outline-none transition-all"
            />
          </div>
          <button
            type="submit"
            disabled={isSearching}
            className="h-12 min-w-[88px] px-5 rounded-xl bg-amber-500 hover:bg-amber-450 active:scale-95 text-slate-950 font-bold text-sm transition-all flex items-center justify-center gap-2 cursor-pointer shadow-md shadow-amber-950/20 disabled:opacity-60"
          >
            {isSearching ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
            <span>{isSearching ? "Searching…" : "Search"}</span>
          </button>
        </form>

        {/* Searching indicator */}
        {isSearching && (
          <div className="flex items-center gap-2 text-xs font-mono text-amber-400 py-2">
            <RefreshCw className="w-3.5 h-3.5 animate-spin" />
            <span>Searching…</span>
          </div>
        )}

        {/* Empty state with sync button */}
        {!isSearching && hasSearched && searchResults.length === 0 && (
          <div className="p-4 rounded-2xl bg-[#0a0c10] border border-slate-900 text-center space-y-3">
            <p className="text-xs text-slate-300">
              No account found for &ldquo;{query}&rdquo;. If they just signed up, a sync might be needed.
            </p>
            <button
              type="button"
              onClick={onSyncAuth}
              disabled={isSyncingAuth}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 text-xs font-bold text-white transition-all cursor-pointer disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isSyncingAuth ? "animate-spin text-amber-400" : ""}`} />
              <span>{isSyncingAuth ? "Syncing accounts…" : "Sync Auth Users"}</span>
            </button>
          </div>
        )}

        {/* Search Results List */}
        {!isSearching && searchResults.length > 0 && (
          <div className="space-y-2 pt-2">
            <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-slate-500">
              Results ({searchResults.length})
            </span>
            <div className="divide-y divide-slate-900/60 rounded-2xl border border-slate-900 bg-[#0a0c10] overflow-hidden">
              {searchResults.map((user) => {
                const uid = user.id || user.user_id || "";
                const isSelected = (selectedUser?.id || selectedUser?.user_id) === uid;
                const bType = user.badge_type || (user.is_official ? "official" : null);

                return (
                  <div
                    key={uid}
                    onClick={() => handleSelectUser(user)}
                    className={`p-3 sm:p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 cursor-pointer transition-colors ${
                      isSelected ? "bg-amber-500/10 border-l-4 border-l-amber-500" : "hover:bg-slate-900/40"
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <Avatar
                        name={user.username}
                        url={user.avatar_url || null}
                        size={36}
                        className="shrink-0"
                      />
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-bold text-white truncate">@{user.username}</span>
                          {bType === "verified_business" && (
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-amber-500 border border-amber-300/60 text-slate-950 font-bold font-mono text-[9px]">
                              <Building2 className="w-2.5 h-2.5" />
                              <span>Verified</span>
                            </span>
                          )}
                          {bType === "official" && (
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-indigo-600 border border-indigo-400/60 text-white font-bold font-mono text-[9px]">
                              <BadgeCheck className="w-2.5 h-2.5" />
                              <span>Official</span>
                            </span>
                          )}
                        </div>
                        {user.email && (
                          <span className="text-xs text-slate-400 block truncate mt-0.5">{user.email}</span>
                        )}
                        <span className="text-[10px] font-mono text-slate-600 block mt-0.5">ID: {uid.slice(0, 8)}...</span>
                      </div>
                    </div>

                    <div className="shrink-0 self-end sm:self-center">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleSelectUser(user);
                        }}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                          isSelected
                            ? "bg-amber-500 text-slate-950 shadow-sm"
                            : "bg-slate-900 text-slate-300 hover:text-white hover:bg-slate-800"
                        }`}
                      >
                        {isSelected ? "Selected" : "Select"}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Badge Management Panel for Selected User */}
      {selectedUser && (
        <div className="bg-slate-950 border border-amber-500/30 rounded-3xl p-4 sm:p-6 space-y-5 shadow-lg shadow-amber-950/10">
          <div className="flex items-start justify-between gap-4 pb-4 border-b border-slate-900">
            <div className="flex items-center gap-3 min-w-0">
              <Avatar
                name={selectedUser.username}
                url={selectedUser.avatar_url || null}
                size={44}
                className="shrink-0"
              />
              <div className="min-w-0">
                <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-amber-400 block">Active Account</span>
                <h3 className="text-lg font-black text-white truncate">@{selectedUser.username}</h3>
                {selectedUser.email && <p className="text-xs text-slate-400 truncate">{selectedUser.email}</p>}
              </div>
            </div>
            <button
              type="button"
              onClick={() => setSelectedUser(null)}
              className="p-1.5 bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-white rounded-lg transition-colors cursor-pointer"
              title="Deselect user"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Current Badge Status */}
          <div className="bg-[#0a0c10] border border-slate-900 rounded-2xl p-4 flex items-center justify-between gap-3">
            <div>
              <span className="text-[10px] font-mono text-slate-500 uppercase font-bold block">Current Badge Status</span>
              <div className="mt-1 flex items-center gap-2">
                {selectedUser.badge_type === "verified_business" ? (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-500 border border-amber-300/60 text-slate-950 font-bold font-mono text-xs shadow-sm shadow-amber-900/40">
                    <Building2 className="w-3.5 h-3.5" />
                    <span>Verified</span>
                  </span>
                ) : selectedUser.badge_type === "official" || selectedUser.is_official ? (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-indigo-600 border border-indigo-400/60 text-white font-bold font-mono text-xs shadow-sm shadow-indigo-900/40">
                    <BadgeCheck className="w-3.5 h-3.5" />
                    <span>Official</span>
                  </span>
                ) : (
                  <span className="text-xs text-slate-400 italic">No badge assigned</span>
                )}
              </div>
            </div>
          </div>

          {/* Optional Note Field */}
          <div className="space-y-1.5">
            <label className="block text-xs font-bold text-slate-300">
              Audit Note <span className="text-slate-500 font-normal">(optional, stored in badge_audit)</span>
            </label>
            <input
              type="text"
              placeholder="e.g. Registered LLC verified via support ticket #123"
              maxLength={500}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="w-full h-11 rounded-xl bg-[#0a0c10] border border-slate-800 text-white text-xs px-3 placeholder:text-slate-600 outline-none focus:border-amber-500/50"
            />
          </div>

          {/* Action Buttons */}
          {(selectedUser.badge_type === "official" || selectedUser.is_official) ? (
            <div className="flex items-center gap-2.5 pt-1">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-indigo-600 border border-indigo-400/60 text-white font-bold font-mono text-xs shadow-sm shadow-indigo-900/40">
                <BadgeCheck className="w-3.5 h-3.5 text-white" />
                <span>Official</span>
              </span>
              <span className="text-xs text-slate-400 font-medium">
                Official account — can&apos;t be changed here
              </span>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-2.5 pt-1">
              <button
                type="button"
                onClick={() => requestBadgeChange("verified_business")}
                className="flex-1 min-w-[140px] h-11 px-4 rounded-xl bg-amber-500 hover:bg-amber-400 active:scale-95 text-slate-950 font-bold text-xs transition-all flex items-center justify-center gap-2 cursor-pointer shadow-md shadow-amber-950/30"
              >
                <Building2 className="w-4 h-4" />
                <span>Give Verified</span>
              </button>

              <button
                type="button"
                onClick={() => requestBadgeChange(null)}
                className="h-11 px-4 rounded-xl bg-red-950/40 hover:bg-red-900 border border-red-900/40 text-red-300 hover:text-white font-bold text-xs transition-all flex items-center justify-center gap-2 cursor-pointer"
              >
                <Trash2 className="w-4 h-4" />
                <span>Remove badge</span>
              </button>
            </div>
          )}
        </div>
      )}

      {/* Confirmation Modal */}
      <AnimatePresence>
        {showConfirmModal && selectedUser && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-slate-950 border border-slate-800 rounded-3xl p-6 max-w-md w-full space-y-4 shadow-2xl text-slate-100"
            >
              <div className="flex items-center gap-3 pb-3 border-b border-slate-900">
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                  pendingBadge === "verified_business" ? "bg-amber-500/20 text-amber-400" : "bg-red-500/20 text-red-400"
                }`}>
                  {pendingBadge === "verified_business" ? <Building2 className="w-5 h-5" /> : <Trash2 className="w-5 h-5" />}
                </div>
                <div>
                  <h3 className="font-sans font-bold text-base text-white">
                    {pendingBadge === "verified_business" ? "Confirm Verified Badge" : "Confirm Badge Removal"}
                  </h3>
                  <span className="text-[10px] font-mono text-slate-400">Database RPC Action</span>
                </div>
              </div>

              <div className="text-xs text-slate-300 space-y-2">
                <p>
                  Target user: <strong className="text-white">@{selectedUser.username}</strong>
                </p>
                <p>
                  New badge state:{" "}
                  <strong className={pendingBadge === "verified_business" ? "text-amber-400" : "text-red-400"}>
                    {pendingBadge === "verified_business" ? "Verified business" : "None (Remove)"}
                  </strong>
                </p>
                {note.trim() && (
                  <p className="text-[11px] text-slate-400 italic bg-[#0a0c10] p-2.5 rounded-xl border border-slate-900">
                    &ldquo;{note.trim()}&rdquo;
                  </p>
                )}
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-3">
                <button
                  type="button"
                  disabled={isSubmitting}
                  onClick={() => setShowConfirmModal(false)}
                  className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-slate-300 text-xs font-bold rounded-xl transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={isSubmitting}
                  onClick={confirmBadgeChange}
                  className={`px-4 py-2 text-xs font-bold rounded-xl transition-all flex items-center gap-1.5 cursor-pointer ${
                    pendingBadge === "verified_business"
                      ? "bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold"
                      : "bg-red-600 hover:bg-red-500 text-white"
                  }`}
                >
                  {isSubmitting && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                  <span>{isSubmitting ? "Applying…" : "Confirm & Save"}</span>
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Badge Audit Log */}
      <div className="bg-slate-950 border border-slate-900 rounded-3xl p-4 sm:p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Shield className="w-4 h-4 text-slate-400" />
              <span>Recent Badge Audit Log</span>
            </h3>
            <p className="text-[11px] text-slate-400 mt-0.5">
              Historical record of all badge assignments and revocations.
            </p>
          </div>
          <button
            type="button"
            onClick={loadRecentAudit}
            disabled={isLoadingAudit}
            className="p-1.5 bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-400 hover:text-white rounded-lg transition-colors cursor-pointer"
            title="Refresh audit log"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoadingAudit ? "animate-spin text-amber-400" : ""}`} />
          </button>
        </div>

        {isLoadingAudit ? (
          <div className="flex items-center justify-center py-8 text-xs text-slate-500 gap-2">
            <RefreshCw className="w-4 h-4 animate-spin text-slate-400" />
            <span>Loading audit log…</span>
          </div>
        ) : auditLog.length === 0 ? (
          <div className="p-6 text-center text-xs text-slate-500 bg-[#0a0c10] border border-slate-900 rounded-2xl">
            No badge changes recorded in audit history yet.
          </div>
        ) : (
          <div className="divide-y divide-slate-900/60 rounded-2xl border border-slate-900 bg-[#0a0c10] overflow-hidden">
            {auditLog.map((entry) => (
              <div key={entry.id} className="p-3 sm:p-4 text-xs space-y-1">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-bold text-white">@{entry.username || "user"}</span>
                    <span className="text-[10px] text-slate-500 font-mono">
                      {entry.old_badge || "none"} →{" "}
                      <span className={entry.new_badge === "verified_business" ? "text-amber-400 font-bold" : entry.new_badge === "official" ? "text-indigo-400 font-bold" : "text-slate-400"}>
                        {entry.new_badge || "none"}
                      </span>
                    </span>
                  </div>
                  <span className="text-[10px] font-mono text-slate-500">
                    {entry.created_at ? new Date(entry.created_at).toLocaleString() : ""}
                  </span>
                </div>
                {entry.note && (
                  <p className="text-[11px] text-slate-400 italic">
                    Note: &ldquo;{entry.note}&rdquo;
                  </p>
                )}
                <div className="text-[9px] font-mono text-slate-600">
                  Changed by: {entry.changed_by || "admin"}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ----------------------------------------------------
// Reaction Packs admin tab: Founding 100, codes, grants
// ----------------------------------------------------
interface PacksFounderRow {
  userId: string;
  foundingNumber: number;
  source: string;
  username: string | null;
  email: string | null;
  codeLast4: string | null;
  emailedAt: string | null;
  redeemedPackId: string | null;
  redeemedAt: string | null;
}
interface PacksOverview {
  limit: number;
  stats: { foundersAssigned: number; codesEmailed: number; redeemed: number };
  interest: Record<string, number>;
  owners: Record<string, number>;
  founders: PacksFounderRow[];
  contestBatches: Array<{ label: string; total: number; redeemed: number; packId: string | null }>;
  emailConfigured: boolean;
}

const adminPackName = (id: string | null | undefined) => REACTION_PACKS.find((p) => p.id === id)?.name || id || "Any one";

function PacksTab({ adminFetch }: { adminFetch: (url: string, options?: any) => Promise<Response> }) {
  const [data, setData] = useState<PacksOverview | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [sendResults, setSendResults] = useState<Array<{ foundingNumber: number; username: string | null; sent: boolean; error: string | null }> | null>(null);
  const [grantUser, setGrantUser] = useState("");
  const [grantPack, setGrantPack] = useState(REACTION_PACKS[0]?.id || "");
  const [batchLabel, setBatchLabel] = useState("");
  const [batchCount, setBatchCount] = useState(1);
  const [batchPack, setBatchPack] = useState("");
  const [batchCodes, setBatchCodes] = useState<string[] | null>(null);

  const load = async () => {
    setLoadError(null);
    try {
      const res = await adminFetch("/api/admin/packs/overview");
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
      setData(json);
    } catch (err: any) {
      setLoadError(err?.message || "Could not load packs data");
    }
  };

  useEffect(() => {
    load();
  }, []);

  const post = async (key: string, url: string, body?: any) => {
    setBusy(key);
    setMessage(null);
    try {
      const res = await adminFetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body || {}),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
      return json;
    } catch (err: any) {
      setMessage({ ok: false, text: err?.message || "Request failed" });
      return null;
    } finally {
      setBusy(null);
    }
  };

  const pending = (data?.founders || []).filter((f) => !f.emailedAt && !f.redeemedPackId);

  const handleSendAll = async () => {
    if (pending.length === 0) return;
    if (!window.confirm(`Email founder codes to ${pending.length} founder${pending.length === 1 ? "" : "s"} from support@getreax.com? Each gets a new code.`)) return;
    const json = await post("sendAll", "/api/admin/packs/send-founder-codes");
    if (json) {
      setSendResults(json.results || []);
      setMessage({ ok: json.sent === json.attempted, text: `Sent ${json.sent} of ${json.attempted}.` });
      load();
    }
  };

  const handleResend = async (f: PacksFounderRow) => {
    if (!window.confirm(`Send Founding #${f.foundingNumber} (@${f.username || "?"}) a new code? Their old code stops working.`)) return;
    const json = await post(`resend-${f.userId}`, `/api/admin/packs/founders/${f.userId}/resend`);
    if (json) {
      setMessage({ ok: json.sent, text: json.sent ? `New code emailed to @${f.username}.` : `Code created but not emailed: ${json.error}` });
      load();
    }
  };

  const handleGrant = async (action: "grant" | "revoke") => {
    if (!grantUser.trim()) return;
    if (action === "revoke" && !window.confirm(`Remove the ${adminPackName(grantPack)} Pack from @${grantUser.replace(/^@/, "")}?`)) return;
    const json = await post(action, `/api/admin/packs/${action}`, { username: grantUser, packId: grantPack });
    if (json) {
      setMessage({ ok: true, text: `${action === "grant" ? "Granted" : "Removed"} the ${adminPackName(json.packId)} Pack ${action === "grant" ? "to" : "from"} @${json.username}.` });
      load();
    }
  };

  const handleBatch = async () => {
    const json = await post("batch", "/api/admin/packs/contest-codes", { label: batchLabel, count: batchCount, packId: batchPack || null });
    if (json) {
      setBatchCodes(json.codes || []);
      load();
    }
  };

  const card = "bg-slate-950 border border-slate-900 rounded-2xl p-4 space-y-3";
  const input = "px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-red-500";
  const btn = "px-3 py-2 rounded-xl text-xs font-bold border transition-all active:scale-95 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed";

  if (loadError) {
    return (
      <div className={card}>
        <p className="text-xs text-rose-300 font-mono">Could not load packs data: {loadError}</p>
        <p className="text-[11px] text-slate-400">If this says a table or function is missing, run the step 2 SQL in Supabase.</p>
        <button onClick={load} className={`${btn} bg-slate-900 border-slate-800 text-slate-200`}>Try again</button>
      </div>
    );
  }
  if (!data) return <p className="text-xs text-slate-500 font-mono">Loading packs…</p>;

  return (
    <div className="max-w-4xl space-y-4">
      {message && (
        <p className={`text-xs font-mono rounded-xl px-3 py-2 border ${message.ok ? "text-emerald-300 bg-emerald-950/30 border-emerald-800/50" : "text-rose-300 bg-rose-950/30 border-rose-800/50"}`}>{message.text}</p>
      )}
      {!data.emailConfigured && (
        <p className="text-xs font-mono rounded-xl px-3 py-2 border text-amber-300 bg-amber-950/30 border-amber-800/50">
          Email isn't set up on the server (SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS in Vercel). Codes are still created and founders can claim in the app, but nothing is emailed.
        </p>
      )}

      <div className="grid grid-cols-3 gap-3">
        {[
          ["Founders", `${data.stats.foundersAssigned}/${data.limit}`],
          ["Codes emailed", data.stats.codesEmailed],
          ["Redeemed", data.stats.redeemed],
        ].map(([label, value]) => (
          <div key={String(label)} className={card}>
            <span className="text-[10px] font-mono text-slate-500 uppercase tracking-wider block">{label}</span>
            <span className="text-2xl font-black text-white">{value}</span>
          </div>
        ))}
      </div>

      <div className={card}>
        <h3 className="text-xs font-black text-slate-200 uppercase tracking-widest">Per pack</h3>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
          {REACTION_PACKS.map((p) => (
            <div key={p.id} className="rounded-xl bg-slate-900 border border-slate-800 p-2">
              <span className="text-xs font-bold text-white block">{p.name}</span>
              <span className="text-[10px] font-mono text-slate-400 block">Notify me: {data.interest[p.id] || 0}</span>
              <span className="text-[10px] font-mono text-slate-400 block">Owners: {data.owners[p.id] || 0}</span>
            </div>
          ))}
        </div>
      </div>

      <div className={card}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-xs font-black text-slate-200 uppercase tracking-widest">Founders</h3>
          <button onClick={handleSendAll} disabled={busy !== null || pending.length === 0} className={`${btn} bg-red-600 border-red-500 text-white`}>
            {busy === "sendAll" ? "Sending…" : `Send founder codes to current users (${pending.length})`}
          </button>
        </div>
        {sendResults && sendResults.length > 0 && (
          <ul className="text-[11px] font-mono space-y-0.5">
            {sendResults.map((r) => (
              <li key={r.foundingNumber} className={r.sent ? "text-emerald-300" : "text-rose-300"}>
                #{r.foundingNumber} @{r.username || "?"}: {r.sent ? "sent" : `not sent (${r.error})`}
              </li>
            ))}
          </ul>
        )}
        {data.founders.length === 0 ? (
          <p className="text-xs text-slate-500">No founders yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[11px] font-mono">
              <thead>
                <tr className="text-slate-500 text-left">
                  <th className="py-1 pr-2">#</th><th className="pr-2">User</th><th className="pr-2">Email</th><th className="pr-2">Code</th><th className="pr-2">Emailed</th><th className="pr-2">Pack</th><th></th>
                </tr>
              </thead>
              <tbody>
                {data.founders.map((f) => (
                  <tr key={f.userId} className="border-t border-slate-900 text-slate-300">
                    <td className="py-1.5 pr-2 font-bold text-amber-300">{String(f.foundingNumber).padStart(3, "0")}</td>
                    <td className="pr-2">@{f.username || "?"}</td>
                    <td className="pr-2 truncate max-w-[160px]">{f.email || "none"}</td>
                    <td className="pr-2">{f.codeLast4 ? `…${f.codeLast4}` : "none"}</td>
                    <td className="pr-2">{f.emailedAt ? new Date(f.emailedAt).toLocaleDateString() : "no"}</td>
                    <td className="pr-2">{f.redeemedPackId ? adminPackName(f.redeemedPackId) : "not yet"}</td>
                    <td>
                      {!f.redeemedPackId && (
                        <button onClick={() => handleResend(f)} disabled={busy !== null} className={`${btn} py-1 bg-slate-900 border-slate-800 text-slate-200`}>
                          {busy === `resend-${f.userId}` ? "…" : f.emailedAt ? "Resend" : "Send"}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className={card}>
        <h3 className="text-xs font-black text-slate-200 uppercase tracking-widest">Grant or remove a pack</h3>
        <div className="flex flex-wrap gap-2">
          <input value={grantUser} onChange={(e) => setGrantUser(e.target.value)} placeholder="@username" className={`${input} flex-1 min-w-[140px]`} />
          <select value={grantPack} onChange={(e) => setGrantPack(e.target.value)} className={input}>
            {REACTION_PACKS.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <button onClick={() => handleGrant("grant")} disabled={busy !== null || !grantUser.trim()} className={`${btn} bg-emerald-700 border-emerald-600 text-white`}>Grant</button>
          <button onClick={() => handleGrant("revoke")} disabled={busy !== null || !grantUser.trim()} className={`${btn} bg-slate-900 border-slate-800 text-rose-300`}>Remove</button>
        </div>
      </div>

      <div className={card}>
        <h3 className="text-xs font-black text-slate-200 uppercase tracking-widest">Contest codes</h3>
        <p className="text-[11px] text-slate-400">Single-use codes for giveaways. Each works once, on whichever account redeems it first, and one per account per contest. You'll see the codes only once, so copy them now.</p>
        <div className="flex flex-wrap gap-2">
          <input value={batchLabel} onChange={(e) => setBatchLabel(e.target.value)} placeholder="Contest name, e.g. Halloween witch" className={`${input} flex-1 min-w-[180px]`} />
          <input type="number" min={1} max={100} value={batchCount} onChange={(e) => setBatchCount(Math.max(1, Math.min(100, Number(e.target.value) || 1)))} className={`${input} w-20`} />
          <select value={batchPack} onChange={(e) => setBatchPack(e.target.value)} className={input}>
            <option value="">Winner picks any pack</option>
            {REACTION_PACKS.map((p) => <option key={p.id} value={p.id}>{p.name} only</option>)}
          </select>
          <button onClick={handleBatch} disabled={busy !== null || !batchLabel.trim()} className={`${btn} bg-red-600 border-red-500 text-white`}>
            {busy === "batch" ? "Making…" : "Make codes"}
          </button>
        </div>
        {batchCodes && (
          <div className="space-y-2">
            <textarea readOnly value={batchCodes.join("\n")} rows={Math.min(10, batchCodes.length)} className={`${input} w-full font-mono`} />
            <button onClick={() => navigator.clipboard.writeText(batchCodes.join("\n")).then(() => setMessage({ ok: true, text: "Codes copied." }), (err) => setMessage({ ok: false, text: `Copy failed: ${err?.message || err}` }))} className={`${btn} bg-slate-900 border-slate-800 text-slate-200`}>
              Copy codes
            </button>
          </div>
        )}
        {data.contestBatches.length > 0 && (
          <ul className="text-[11px] font-mono text-slate-400 space-y-0.5">
            {data.contestBatches.map((b) => (
              <li key={b.label}>{b.label}: {b.redeemed}/{b.total} redeemed · {adminPackName(b.packId)}</li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
