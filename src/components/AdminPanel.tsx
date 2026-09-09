import React, { useState, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "motion/react";
import { 
  X, Shield, Users, Settings, Trash2, 
  RefreshCw, Eye, UserX, AlertTriangle, 
  Tv, CheckCircle, Database, ShieldAlert
} from "lucide-react";
import { Clip } from "../types";
import { getAuthToken } from "../utils/supabaseClient";

interface AdminPanelProps {
  key?: string | number | null;
  onClose: () => void;
  allClips: Clip[];
  onRefreshClips: () => void;
  onSelectThread: (id: string) => void;
}

type AdminTab = "reports" | "content" | "dashboard" | "users" | "settings";

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
  username: string;
  createdAt: string;
  lastActive: string;
  reactionCount: number;
  suspended: boolean;
  strikes: number;
};

export default function AdminPanel({ onClose, onRefreshClips, onSelectThread }: AdminPanelProps) {
  const [activeTab, setActiveTab] = useState<AdminTab>("reports");
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [clipsList, setClipsList] = useState<Clip[]>([]);
  const [reportsList, setReportsList] = useState<AdminReport[]>([]);
  const [usersList, setUsersList] = useState<AdminUser[]>([]);
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

  // Check if running on localhost for optional developer sandbox tooling
  const isLocalhost = typeof window !== "undefined" && 
    (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1");

  // Secure wrapper for admin fetch requests with cache-busting
  const adminFetch = async (url: string, options: any = {}) => {
    let token = "";
    try {
      token = await getAuthToken();
    } catch {}
    const passcode = localStorage.getItem("reax_admin_passcode") || "MvscReaxSRO2026!$";
    const cacheBuster = url.includes("?") ? `&_t=${Date.now()}` : `?_t=${Date.now()}`;
    const finalUrl = options.method && options.method !== "GET" ? url : `${url}${cacheBuster}`;

    return fetch(finalUrl, {
      ...options,
      cache: "no-store",
      headers: {
        "Cache-Control": "no-cache, no-store, must-revalidate",
        "Pragma": "no-cache",
        ...options.headers,
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        "X-Admin-Passcode": passcode
      }
    });
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

  // Dynamic Navigation Tabs
  const navTabs: Array<{ id: AdminTab; label: string; desc: string; badge?: number }> = [
    { id: "reports", label: "🚩 Reports Queue", desc: "Open reports queue", badge: reportsList.length },
    { id: "content", label: "📝 Content Browser", desc: "Clips & moderation" },
    { id: "dashboard", label: "📊 Dashboard", desc: "Real count overview" },
    ...(usersList.length > 0 ? [{ id: "users" as AdminTab, label: "👥 Users Manager", desc: "Auth-backed profiles" }] : []),
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
                                        <div className="w-14 h-11 bg-slate-900 rounded-lg overflow-hidden border border-slate-800 shrink-0 relative flex items-center justify-center">
                                          {isVideo ? (
                                            <video src={clip.mediaUrl} className="w-full h-full object-cover" muted />
                                          ) : (
                                            <img src={clip.mediaUrl} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
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
                                    <div className="w-16 h-12 bg-slate-900 rounded-lg overflow-hidden border border-slate-800 relative flex items-center justify-center">
                                      {isVideo ? (
                                        <video src={clip.mediaUrl} className="w-full h-full object-cover" muted />
                                      ) : (
                                        <img src={clip.mediaUrl} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
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
                <div className="space-y-5">
                  
                  <div className="bg-slate-950 border border-slate-900 rounded-3xl overflow-hidden shadow-lg">
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs font-mono">
                        <thead className="bg-[#0a0c10] text-slate-400 border-b border-slate-900 font-bold">
                          <tr>
                            <th className="p-4 uppercase text-[9px] tracking-wider">Username</th>
                            <th className="p-4 uppercase text-[9px] tracking-wider">Joined</th>
                            <th className="p-4 uppercase text-[9px] tracking-wider text-center">Reactions</th>
                            <th className="p-4 uppercase text-[9px] tracking-wider">Last Active</th>
                            <th className="p-4 uppercase text-[9px] tracking-wider">Status & Strikes</th>
                            <th className="p-4 uppercase text-[9px] tracking-wider text-right">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-900/60 text-slate-300">
                          {usersList.map((user) => (
                            <tr key={user.username} className={`hover:bg-slate-900/30 transition-colors ${user.suspended ? "bg-red-950/5" : ""}`}>
                              
                              {/* Username */}
                              <td className="p-4 font-bold text-slate-200">
                                <div className="flex items-center gap-1.5">
                                  <span className={`w-2 h-2 rounded-full ${user.suspended ? "bg-red-500" : "bg-emerald-400"}`} />
                                  <span>@{user.username}</span>
                                </div>
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
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                </div>
              )}

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
                    src={clipToPurge.mediaUrl} 
                    alt="Preview" 
                    className="w-14 h-14 rounded-lg object-cover border border-slate-700 bg-slate-900 shrink-0" 
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
