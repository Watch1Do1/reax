import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { 
  X, Shield, Users, Flag, FileText, Settings, Trash2, 
  RefreshCw, Play, Pause, Eye, UserX, UserCheck, Check, 
  AlertTriangle, TrendingUp, BarChart2, Tv, Activity, ArrowRight,
  Sparkles, ShieldCheck, ShieldAlert, Database, Copy, CheckCircle, HelpCircle
} from "lucide-react";
import { Clip } from "../types";

interface AdminPanelProps {
  key?: string | number | null;
  onClose: () => void;
  allClips: Clip[];
  onRefreshClips: () => void;
  onSelectThread: (id: string) => void;
}

type AdminTab = "dashboard" | "content" | "reports" | "users" | "settings";

type AdminStats = {
  overview: {
    totalUsers: number;
    guestUsers: number;
    registeredUsers: number;
    totalReactions: number;
    totalRootThreads: number;
    totalReplies: number;
  };
  breakdown: {
    voiceReactions: number;
    silentReactions: number;
    videoReactions: number;
    imageReactions: number;
  };
  today: {
    newUsers: number;
    newThreads: number;
    newReactions: number;
    voiceReactions: number;
  };
  funnel: {
    visitors: number;
    started_reaction: number;
    posted_reaction: number;
    posted_voice_reaction: number;
  };
  founderMetrics?: {
    postsToday: number;
    postsThisWeek: number;
    storageUsedMB: number;
    storageLimitMB: number;
    audioAdoptionPercent: number;
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

export default function AdminPanel({ onClose, allClips, onRefreshClips, onSelectThread }: AdminPanelProps) {
  const [activeTab, setActiveTab] = useState<AdminTab>("dashboard");
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [clipsList, setClipsList] = useState<Clip[]>([]);
  const [reportsList, setReportsList] = useState<AdminReport[]>([]);
  const [usersList, setUsersList] = useState<AdminUser[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedUserFilter, setSelectedUserFilter] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<"newest" | "likes" | "reactions">("newest");

  // Supabase Database Connection & Schema diagnostics state
  const [dbStatus, setDbStatus] = useState<any>(null);
  const [loadingDbStatus, setLoadingDbStatus] = useState(false);
  const [copiedSql, setCopiedSql] = useState(false);

  // Secure wrapper for admin fetch requests
  const adminFetch = (url: string, options: any = {}) => {
    const passcode = localStorage.getItem("reax_admin_passcode") || "";
    return fetch(url, {
      ...options,
      headers: {
        ...options.headers,
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

  // Load Admin Data
  const loadAdminData = async () => {
    setLoading(true);
    try {
      const [statsRes, clipsRes, reportsRes, usersRes] = await Promise.all([
        adminFetch("/api/admin/stats"),
        adminFetch("/api/admin/clips"),
        adminFetch("/api/admin/reports"),
        adminFetch("/api/admin/users")
      ]);

      if (statsRes.ok) setStats(await statsRes.json());
      if (clipsRes.ok) setClipsList(await clipsRes.json());
      if (reportsRes.ok) setReportsList(await reportsRes.json());
      if (usersRes.ok) setUsersList(await usersRes.json());
    } catch (err) {
      console.error("Failed to fetch admin data", err);
      showToast("Error loading panel data. Fallback active.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAdminData();
    loadDbStatus();
  }, []);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  const handleCopySql = (sql: string) => {
    navigator.clipboard.writeText(sql);
    setCopiedSql(true);
    setTimeout(() => setCopiedSql(false), 2000);
  };

  // Soft Delete Clip
  const handleDeleteClip = async (clipId: string) => {
    try {
      const res = await adminFetch(`/api/admin/clips/${clipId}/delete`, { method: "POST" });
      if (res.ok) {
        showToast("Post soft-deleted successfully.");
        // Sync local clips list state
        setClipsList(prev => prev.map(c => c.id === clipId ? { ...c, deleted: true } : c));
        // Refresh global feed
        onRefreshClips();
        // Reload stats
        const statsRes = await adminFetch("/api/admin/stats");
        if (statsRes.ok) setStats(await statsRes.json());
      } else {
        throw new Error("Delete API failed");
      }
    } catch (err) {
      showToast("Failed to delete post.");
    }
  };

  // Restore Soft-Deleted Clip
  const handleRestoreClip = async (clipId: string) => {
    try {
      const res = await adminFetch(`/api/admin/clips/${clipId}/restore`, { method: "POST" });
      if (res.ok) {
        showToast("Post restored successfully.");
        setClipsList(prev => prev.map(c => c.id === clipId ? { ...c, deleted: false } : c));
        onRefreshClips();
        const statsRes = await adminFetch("/api/admin/stats");
        if (statsRes.ok) setStats(await statsRes.json());
      } else {
        throw new Error("Restore API failed");
      }
    } catch (err) {
      showToast("Failed to restore post.");
    }
  };

  // Dismiss report
  const handleDismissReport = async (reportId: string) => {
    try {
      const res = await adminFetch(`/api/admin/reports/${reportId}/dismiss`, { method: "POST" });
      if (res.ok) {
        showToast("Report dismissed.");
        setReportsList(prev => prev.filter(r => r.id !== reportId));
        // Reload clips and reports
        const clipsRes = await adminFetch("/api/admin/clips");
        if (clipsRes.ok) setClipsList(await clipsRes.json());
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
        setUsersList(prev => prev.map(u => u.username === username ? { ...u, suspended: true } : u));
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
        setUsersList(prev => prev.map(u => u.username === username ? { ...u, suspended: false } : u));
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
        
        setUsersList(prev => prev.map(u => u.username === username ? { ...u, strikes: strikesCount, suspended: autoSuspended ? true : u.suspended } : u));
      } else {
        throw new Error("Strike API failed");
      }
    } catch (err) {
      showToast("Failed to issue strike.");
    }
  };

  // Create a reported clip seed to showcase report queue
  const handleTriggerMockReport = async () => {
    if (clipsList.length === 0) {
      showToast("No posts available to report.");
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
          reporter: "MemePatrol_" + Math.floor(Math.random() * 100),
          reason: randomReason
        })
      });
      if (res.ok) {
        showToast(`Created custom test report for post by @${targetClip.authorName}!`);
        // Reload report data
        const reportsRes = await adminFetch("/api/admin/reports");
        if (reportsRes.ok) setReportsList(await reportsRes.json());
        const clipsRes = await adminFetch("/api/admin/clips");
        if (clipsRes.ok) setClipsList(await clipsRes.json());
      }
    } catch (e) {
      showToast("Failed to create mock report.");
    }
  };

  // Filter and sort content posts
  const filteredClips = React.useMemo(() => {
    const filtered = clipsList.filter(c => {
      const matchesSearch = c.authorName.toLowerCase().includes(searchQuery.toLowerCase()) || 
                            (c.voiceText || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
                            (c.overlayText || "").toLowerCase().includes(searchQuery.toLowerCase());
      const matchesUser = selectedUserFilter ? c.authorName.toLowerCase() === selectedUserFilter.toLowerCase() : true;
      return matchesSearch && matchesUser;
    });

    return [...filtered].sort((a, b) => {
      if (sortBy === "likes") {
        return (b.likesCount || 0) - (a.likesCount || 0);
      } else if (sortBy === "reactions") {
        const repliesA = clipsList.filter(c => c.parentId === a.id).length;
        const repliesB = clipsList.filter(c => c.parentId === b.id).length;
        return repliesB - repliesA;
      } else {
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      }
    });
  }, [clipsList, searchQuery, selectedUserFilter, sortBy]);

  return (
    <div id="admin-panel-overlay" className="fixed inset-0 z-50 bg-[#050608]/95 backdrop-blur-md flex flex-col md:flex-row text-slate-100 font-sans">
      
      {/* Toast Alert */}
      <AnimatePresence>
        {toastMessage && (
          <motion.div 
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="fixed top-4 left-1/2 transform -translate-x-1/2 z-50 px-4 py-2.5 bg-red-500 border border-red-400 text-white font-mono font-bold text-xs rounded-xl shadow-lg flex items-center gap-2"
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
          <div className="flex items-center gap-2">
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
          {[
            { id: "dashboard", label: "📊 Dashboard", desc: "Performance & analytics" },
            { id: "content", label: "📝 Content Browser", desc: "Soft-delete posts" },
            { id: "reports", label: "🚩 Reports Queue", desc: "Moderation queue", badge: reportsList.length },
            { id: "users", label: "👥 Users Manager", desc: "Suspensions & strikes" },
            { id: "settings", label: "⚙️ Settings", desc: "Sandbox environment" },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => {
                setActiveTab(tab.id as AdminTab);
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
            System Live: Port 3000
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button 
              onClick={onClose}
              className="py-2 bg-slate-900 hover:bg-slate-850 border border-slate-800 text-slate-300 hover:text-white rounded-xl text-[10px] font-mono font-bold transition-all active:scale-95 uppercase tracking-wider cursor-pointer"
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
              {activeTab === "dashboard" && "📊 Dashboard Analytics"}
              {activeTab === "content" && "📝 Content Browser"}
              {activeTab === "reports" && "🚩 Moderation Reports Queue"}
              {activeTab === "users" && "👥 Community User Directory"}
              {activeTab === "settings" && "⚙️ System Configuration"}
            </h1>
          </div>
          <div className="flex items-center gap-3">
            <button 
              onClick={loadAdminData}
              className="p-2 bg-slate-900 hover:bg-slate-800 border border-slate-800 hover:border-slate-700 text-slate-400 hover:text-white rounded-xl transition-all active:scale-95"
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
              <p className="text-xs font-mono font-bold text-slate-400 uppercase tracking-widest">Loading terminal records...</p>
            </div>
          ) : (
            <div className="space-y-6">

              {/* TAB 1: DASHBOARD */}
              {activeTab === "dashboard" && stats && (
                <div className="space-y-6">
                  
                  {/* Heartbeat Metrics Row */}
                  <div className="grid grid-cols-2 lg:grid-cols-5 gap-3.5">
                    {[
                      { label: "Total Users", value: stats.overview.totalUsers, color: "text-white", desc: "User base count" },
                      { label: "Total Reactions", value: stats.overview.totalReactions, color: "text-emerald-400", desc: "Meme responses" },
                      { label: "Root Threads", value: stats.overview.totalRootThreads, color: "text-rose-400", desc: "Original clips" },
                      { label: "Replies", value: stats.overview.totalReplies, color: "text-amber-400", desc: "Cascade replies" },
                      { label: "Voice Reactions", value: stats.breakdown.voiceReactions, color: "text-indigo-400", desc: "Audio enabled" },
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

                  {/* Founder Priority Metrics Rows */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    
                    {/* Block 1: New Content Tracking */}
                    <div className="bg-gradient-to-b from-slate-950 to-slate-950/60 border border-slate-900 rounded-3xl p-5 space-y-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Activity className="w-4 h-4 text-emerald-500 animate-pulse" />
                          <h3 className="text-xs font-sans font-black text-slate-200 uppercase tracking-widest">Growth Velocity</h3>
                        </div>
                        <span className="text-[9px] font-mono text-slate-500 uppercase font-bold">Today & Week</span>
                      </div>

                      <div className="space-y-4">
                        <div className="bg-slate-950/80 border border-slate-900/60 rounded-2xl p-4 flex items-center justify-between">
                          <div>
                            <span className="text-[10px] text-slate-400 font-mono uppercase tracking-wider block">Posts Today</span>
                            <span className="text-3xl font-sans font-black text-white tracking-tight mt-1 block">
                              {stats.founderMetrics?.postsToday ?? stats.today.newReactions}
                            </span>
                          </div>
                          <span className="text-xs font-mono text-emerald-500 font-bold bg-emerald-500/10 border border-emerald-500/20 px-2 py-1 rounded-lg">
                            +{(stats.founderMetrics?.postsToday ?? stats.today.newReactions)} today
                          </span>
                        </div>

                        <div className="bg-slate-950/80 border border-slate-900/60 rounded-2xl p-4 flex items-center justify-between">
                          <div>
                            <span className="text-[10px] text-slate-400 font-mono uppercase tracking-wider block">Posts This Week</span>
                            <span className="text-3xl font-sans font-black text-indigo-400 tracking-tight mt-1 block">
                              {stats.founderMetrics?.postsThisWeek ?? (stats.overview.totalRootThreads + stats.overview.totalReplies)}
                            </span>
                          </div>
                          <span className="text-xs font-mono text-indigo-400 font-bold bg-indigo-400/10 border border-indigo-500/20 px-2 py-1 rounded-lg">
                            This week
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Block 2: Media Storage Usage (Founder Expense Watcher) */}
                    <div className="bg-gradient-to-b from-slate-950 to-slate-950/60 border border-slate-900 rounded-3xl p-5 space-y-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Tv className="w-4 h-4 text-amber-500" />
                          <h3 className="text-xs font-sans font-black text-slate-200 uppercase tracking-widest">Media Storage Used</h3>
                        </div>
                        <span className="text-[9px] font-mono text-amber-500/80 uppercase font-bold">Expense Watcher</span>
                      </div>

                      <div className="space-y-3.5 pt-1">
                        <div className="flex items-end justify-between">
                          <div>
                            <span className="text-[10px] text-slate-500 font-mono uppercase tracking-wider block">Storage Used</span>
                            <span className="text-3xl font-sans font-black text-amber-400 tracking-tight mt-1 block">
                              {typeof stats.founderMetrics?.storageUsedMB === 'number' 
                                ? (stats.founderMetrics.storageUsedMB >= 1000 
                                    ? `${(stats.founderMetrics.storageUsedMB / 1000).toFixed(2)} GB` 
                                    : `${stats.founderMetrics.storageUsedMB} MB`)
                                : "1.30 GB"}
                            </span>
                          </div>
                          <div className="text-right text-[10px] font-mono text-slate-400">
                            Limit: <span className="text-slate-200 font-bold">5.0 GB</span>
                          </div>
                        </div>

                        {/* Progress bar */}
                        {(() => {
                          const mbUsed = stats.founderMetrics?.storageUsedMB ?? 1300;
                          const pct = Math.min(100, Math.round((mbUsed / 5000) * 100));
                          return (
                            <div className="space-y-1.5">
                              <div className="h-2.5 bg-slate-900 border border-slate-800 rounded-full overflow-hidden">
                                <div className="h-full bg-amber-500 rounded-full transition-all duration-500" style={{ width: `${pct}%` }} />
                              </div>
                              <div className="flex justify-between items-center text-[9px] font-mono text-slate-500">
                                <span>{pct}% Capacity reached</span>
                                <span>{(5 - (mbUsed / 1000)).toFixed(2)} GB remaining</span>
                              </div>
                            </div>
                          );
                        })()}

                        <p className="text-[9px] text-slate-500 leading-normal font-sans pt-1">
                          ✓ Once users start uploading images, videos, and custom recorded audios, storage becomes a real expense. Track this daily for runway forecasting.
                        </p>
                      </div>
                    </div>

                    {/* Block 3: Audio Adoption % (Core Business Thesis Validation) */}
                    <div className="bg-gradient-to-b from-slate-950 to-slate-950/60 border border-slate-900 rounded-3xl p-5 space-y-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Activity className="w-4 h-4 text-indigo-400" />
                          <h3 className="text-xs font-sans font-black text-indigo-400 uppercase tracking-widest">Audio Adoption %</h3>
                        </div>
                        <span className="text-[9px] font-mono text-indigo-400 uppercase font-bold">Thesis Metric</span>
                      </div>

                      {(() => {
                        const voicePct = stats.founderMetrics?.audioAdoptionPercent ?? 47;
                        const silentPct = 100 - voicePct;
                        return (
                          <div className="space-y-4">
                            <div className="flex items-center justify-between gap-4 pt-1">
                              <div className="space-y-0.5">
                                <span className="text-[10px] text-slate-500 font-mono uppercase tracking-wider block font-bold">Voice Reactions</span>
                                <span className="text-3xl font-sans font-black text-indigo-400 block tracking-tight">{voicePct}%</span>
                              </div>
                              <div className="text-right space-y-0.5">
                                <span className="text-[10px] text-slate-500 font-mono uppercase tracking-wider block font-bold">Silent</span>
                                <span className="text-3xl font-sans font-black text-slate-400 block tracking-tight">{silentPct}%</span>
                              </div>
                            </div>

                            {/* Double styled split bar */}
                            <div className="h-3 rounded-full overflow-hidden flex border border-slate-950 shadow-inner">
                              <div className="bg-indigo-500 h-full transition-all duration-500" style={{ width: `${voicePct}%` }} title={`Voice: ${voicePct}%`} />
                              <div className="bg-slate-800 h-full transition-all duration-500" style={{ width: `${silentPct}%` }} title={`Silent: ${silentPct}%`} />
                            </div>

                            <p className="text-[9px] text-slate-400 leading-relaxed font-sans">
                              Your current business bet is: <strong>"People want to create audio memes"</strong> rather than generic replies. Track this aggressively to prove your product-market fit.
                            </p>
                          </div>
                        );
                      })()}
                    </div>

                  </div>

                  {/* Content Breakdown Radar */}
                  <div className="bg-slate-950 border border-slate-900 rounded-3xl p-5 space-y-4">
                    <h3 className="text-xs font-sans font-black text-slate-200 uppercase tracking-widest flex items-center gap-2">
                      <Tv className="w-4 h-4 text-red-500" />
                      Content breakdown
                    </h3>
                    
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-2">
                      {[
                        { label: "🎤 Voice Reactions", val: stats.breakdown.voiceReactions, desc: "Audio enabled", emoji: "🎙️" },
                        { label: "🤫 Silent Reactions", val: stats.breakdown.silentReactions, desc: "Captions/Video only", emoji: "💬" },
                        { label: "🎬 Video Reactions", val: stats.breakdown.videoReactions, desc: "Loops / Mixkit MP4", emoji: "🎥" },
                        { label: "🖼️ Image Reactions", val: stats.breakdown.imageReactions, desc: "Static visual assets", emoji: "📸" },
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

                  {/* Algorithms Inspector view */}
                  <div className="bg-gradient-to-br from-indigo-950/15 to-transparent border border-indigo-500/10 rounded-3xl p-5 flex flex-col md:flex-row items-center justify-between gap-5 shadow-xl">
                    <div className="space-y-1 text-center md:text-left">
                      <h4 className="text-xs font-sans font-black text-indigo-300 uppercase tracking-widest flex items-center justify-center md:justify-start gap-1.5">
                        <Sparkles className="w-4 h-4" /> Highly tuned meme algorithms
                      </h4>
                      <p className="text-[10px] text-slate-400 max-w-xl">
                        Your curation formula operates directly in Express to organize threads based on real-time participant replies velocity. Toggle tabs inside the Content Browser to analyze curated subsets!
                      </p>
                    </div>
                    <button 
                      onClick={() => setActiveTab("content")} 
                      className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-mono font-bold text-xs rounded-xl tracking-wider uppercase transition-all duration-250 hover:shadow-lg active:scale-95 cursor-pointer shrink-0"
                    >
                      Browse Content →
                    </button>
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
                        placeholder="Search posts by author, overlay text, voice caption..."
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

                    <div className="flex items-center gap-1.5 bg-slate-950 border border-slate-900 rounded-xl px-3 shrink-0">
                      <span className="text-[10px] text-slate-500 font-mono font-bold uppercase whitespace-nowrap">Sort By:</span>
                      <select 
                        value={sortBy}
                        onChange={(e) => setSortBy(e.target.value as any)}
                        className="bg-transparent text-xs text-red-400 font-mono font-bold focus:outline-none cursor-pointer py-2 pr-2"
                      >
                        <option value="newest" className="bg-[#050608] text-slate-300">Newest</option>
                        <option value="likes" className="bg-[#050608] text-slate-300">Most Liked</option>
                        <option value="reactions" className="bg-[#050608] text-slate-300">Most Reacted</option>
                      </select>
                    </div>

                    {selectedUserFilter && (
                      <div className="bg-red-500/10 border border-red-500/20 rounded-xl px-3 py-2 flex items-center justify-between text-xs font-mono text-red-400">
                        <span>Showing user: <strong>@{selectedUserFilter}</strong></span>
                        <button 
                          onClick={() => setSelectedUserFilter(null)}
                          className="ml-3 text-slate-500 hover:text-white"
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
                                No loops match your active search filter
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
                                      className="text-red-400 hover:underline hover:text-red-300"
                                    >
                                      @{clip.authorName}
                                    </button>
                                  </td>

                                  {/* Date */}
                                  <td className="p-4 text-[10px] text-slate-500">
                                    {new Date(clip.createdAt).toLocaleDateString()} <br />
                                    {new Date(clip.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                  </td>

                                  {/* Stats counts */}
                                  <td className="p-4 text-center">
                                    <div className="flex justify-center items-center gap-3">
                                      <span title="Likes">❤️ {clip.likesCount}</span>
                                      <span title="Report count">🚩 {clip.reportCount || 0}</span>
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
                                        ● Deleted
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
                                      <button 
                                        onClick={() => handleRestoreClip(clip.id)}
                                        className="px-2 py-1 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-[9px] rounded-lg transition-all"
                                      >
                                        Restore
                                      </button>
                                    ) : (
                                      <button 
                                        onClick={() => handleDeleteClip(clip.id)}
                                        className="p-1.5 bg-red-950/20 hover:bg-red-500/10 border border-red-900/30 hover:border-red-500/40 text-red-400 rounded-lg transition-colors cursor-pointer inline-flex items-center"
                                        title="Soft Delete"
                                      >
                                        <Trash2 className="w-3.5 h-3.5" />
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

              {/* TAB 3: REPORTS QUEUE */}
              {activeTab === "reports" && (
                <div className="space-y-5">
                  
                  <div className="bg-red-500/5 border border-red-500/10 rounded-2xl p-4 flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <AlertTriangle className="w-5 h-5 text-red-500 animate-pulse" />
                      <div>
                        <h4 className="text-xs font-bold text-slate-100 uppercase font-mono">Launch Moderation Queue</h4>
                        <p className="text-[10px] text-slate-400 mt-0.5">Manage user reported pornography, harassment, copyright material, or spam.</p>
                      </div>
                    </div>
                    <button 
                      onClick={handleTriggerMockReport}
                      className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 hover:text-white rounded-xl text-[10px] font-mono font-bold uppercase transition-all"
                    >
                      + Seed Test Report
                    </button>
                  </div>

                  {/* Reports list */}
                  <div className="bg-slate-950 border border-slate-900 rounded-3xl overflow-hidden shadow-lg">
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs font-mono">
                        <thead className="bg-[#0a0c10] text-slate-400 border-b border-slate-900 font-bold">
                          <tr>
                            <th className="p-4 uppercase text-[9px] tracking-wider">Reported Content</th>
                            <th className="p-4 uppercase text-[9px] tracking-wider">Reporter</th>
                            <th className="p-4 uppercase text-[9px] tracking-wider">Violation Reason</th>
                            <th className="p-4 uppercase text-[9px] tracking-wider">Report Date</th>
                            <th className="p-4 uppercase text-[9px] tracking-wider">Active Status</th>
                            <th className="p-4 uppercase text-[9px] tracking-wider text-right">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-900/60 text-slate-300">
                          {reportsList.length === 0 ? (
                            <tr>
                              <td colSpan={6} className="p-12 text-center text-slate-500 font-sans">
                                🛡️ Moderation queue empty. Your community is in pristine condition.
                              </td>
                            </tr>
                          ) : (
                            reportsList.map((report) => {
                              const clip = report.clip;
                              const isVideo = clip?.mediaUrl.endsWith(".mp4") || clip?.mediaUrl.endsWith(".webm") || clip?.mediaUrl.includes("mixkit-");
                              return (
                                <tr key={report.id} className="hover:bg-slate-900/30 transition-colors">
                                  
                                  {/* Reported Content summary */}
                                  <td className="p-4">
                                    {clip ? (
                                      <div className="flex items-center gap-3">
                                        <div className="w-12 h-10 bg-slate-900 rounded overflow-hidden border border-slate-800 shrink-0 relative flex items-center justify-center">
                                          {isVideo ? (
                                            <video src={clip.mediaUrl} className="w-full h-full object-cover" muted />
                                          ) : (
                                            <img src={clip.mediaUrl} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                                          )}
                                        </div>
                                        <div className="min-w-0 max-w-[180px]">
                                          <span className="text-[10px] text-red-400 block font-bold truncate">@{clip.authorName}</span>
                                          {clip.voiceText ? (
                                            <span className="text-[9px] text-slate-400 block truncate italic">🎙️ "{clip.voiceText}"</span>
                                          ) : clip.overlayText ? (
                                            <span className="text-[9px] text-slate-400 block truncate">💬 "{clip.overlayText}"</span>
                                          ) : (
                                            <span className="text-[8px] text-slate-500 block truncate">{clip.id}</span>
                                          )}
                                        </div>
                                      </div>
                                    ) : (
                                      <span className="text-slate-500 italic">[Original Post Deleted]</span>
                                    )}
                                  </td>

                                  {/* Reporter */}
                                  <td className="p-4 font-bold text-slate-400">
                                    {report.reporter}
                                  </td>

                                  {/* Reason */}
                                  <td className="p-4">
                                    <span className="px-2 py-0.5 bg-red-500/10 border border-red-500/20 text-red-400 rounded font-bold text-[9px] uppercase">
                                      ⚠️ {report.reason}
                                    </span>
                                  </td>

                                  {/* Date */}
                                  <td className="p-4 text-[10px] text-slate-500">
                                    {new Date(report.createdAt).toLocaleDateString()}
                                  </td>

                                  {/* Status */}
                                  <td className="p-4">
                                    {clip?.deleted ? (
                                      <span className="text-[9px] text-red-500 uppercase font-black tracking-wide">Removed</span>
                                    ) : (
                                      <span className="text-[9px] text-yellow-500 uppercase font-black tracking-wide">Pending Review</span>
                                    )}
                                  </td>

                                  {/* Actions */}
                                  <td className="p-4 text-right space-x-1 whitespace-nowrap">
                                    <button 
                                      onClick={() => handleDismissReport(report.id)}
                                      className="px-2.5 py-1 bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 hover:text-white rounded-lg text-[9px] font-bold uppercase transition-all"
                                      title="Dismiss report as benign"
                                    >
                                      Dismiss
                                    </button>

                                    {clip && !clip.deleted && (
                                      <>
                                        <button 
                                          onClick={() => handleDeleteClip(clip.id)}
                                          className="px-2.5 py-1 bg-red-600 hover:bg-red-500 text-white font-bold text-[9px] rounded-lg transition-all uppercase"
                                          title="Soft Delete Content"
                                        >
                                          Delete Post
                                        </button>
                                        <button 
                                          onClick={() => handleSuspendUser(clip.authorName)}
                                          className="p-1 bg-red-950/20 hover:bg-red-900 border border-red-900/40 text-red-400 hover:text-white rounded-lg transition-colors inline-flex items-center"
                                          title="Suspend Author Profile"
                                        >
                                          <UserX className="w-3.5 h-3.5" />
                                        </button>
                                      </>
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

              {/* TAB 4: USERS MANAGER */}
              {activeTab === "users" && (
                <div className="space-y-5">
                  
                  {/* Users overview */}
                  <div className="bg-slate-950 border border-slate-900 rounded-3xl overflow-hidden shadow-lg">
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs font-mono">
                        <thead className="bg-[#0a0c10] text-slate-400 border-b border-slate-900 font-bold">
                          <tr>
                            <th className="p-4 uppercase text-[9px] tracking-wider">Username</th>
                            <th className="p-4 uppercase text-[9px] tracking-wider">Account Created</th>
                            <th className="p-4 uppercase text-[9px] tracking-wider text-center">Reactions Count</th>
                            <th className="p-4 uppercase text-[9px] tracking-wider">Last Active</th>
                            <th className="p-4 uppercase text-[9px] tracking-wider">Violations Status</th>
                            <th className="p-4 uppercase text-[9px] tracking-wider text-right">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-900/60 text-slate-300">
                          {usersList.length === 0 ? (
                            <tr>
                              <td colSpan={6} className="p-12 text-center text-slate-500 font-sans">
                                No registered users found
                              </td>
                            </tr>
                          ) : (
                            usersList.map((user) => (
                              <tr key={user.username} className={`hover:bg-slate-900/30 transition-colors ${user.suspended ? "bg-red-950/5" : ""}`}>
                                
                                {/* Username */}
                                <td className="p-4 font-bold text-slate-200">
                                  <div className="flex items-center gap-1.5">
                                    <span className="w-2 h-2 rounded-full bg-emerald-400" />
                                    <span>@{user.username}</span>
                                    {user.username.startsWith("~") && (
                                      <span className="px-1 bg-slate-900 border border-slate-800 text-slate-500 rounded text-[7px] uppercase font-bold">Guest</span>
                                    )}
                                  </div>
                                </td>

                                {/* Created */}
                                <td className="p-4 text-[10px] text-slate-500">
                                  {new Date(user.createdAt).toLocaleDateString()}
                                </td>

                                {/* Count */}
                                <td className="p-4 text-center font-bold">
                                  {user.reactionCount} loops
                                </td>

                                {/* Last Active */}
                                <td className="p-4 text-[10px] text-slate-400">
                                  {new Date(user.lastActive).toLocaleDateString()} <br />
                                  <span className="text-[8px] text-slate-500 font-normal">
                                    {new Date(user.lastActive).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                  </span>
                                </td>

                                {/* Strikes */}
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
                                      ⚠️ {user.strikes || 0}/3 strike{user.strikes !== 1 ? "s" : ""}
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
                                    className="px-2 py-1 bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 hover:text-white rounded-lg text-[9px] font-bold uppercase transition-all"
                                    title="View all posts by user"
                                  >
                                    View Loops
                                  </button>

                                  <button 
                                    onClick={() => handleIssueStrike(user.username)}
                                    className="px-2 py-1 bg-yellow-500/10 hover:bg-yellow-500/20 border border-yellow-500/20 text-yellow-400 rounded-lg text-[9px] font-bold uppercase transition-all"
                                    title="Issue 1 formal warning strike (3 strikes auto-suspends)"
                                  >
                                    Strike +1
                                  </button>

                                  {user.suspended ? (
                                    <button 
                                      onClick={() => handleUnsuspendUser(user.username)}
                                      className="px-2 py-1 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-[9px] rounded-lg transition-all uppercase"
                                    >
                                      Unsuspend
                                    </button>
                                  ) : (
                                    <button 
                                      onClick={() => handleSuspendUser(user.username)}
                                      className="px-2 py-1 bg-red-950/40 hover:bg-red-900 text-red-400 hover:text-white border border-red-900/30 rounded-lg text-[9px] font-bold transition-all uppercase"
                                    >
                                      Suspend
                                    </button>
                                  )}
                                </td>

                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>

                </div>
              )}

              {/* TAB 5: SETTINGS */}
              {activeTab === "settings" && (
                <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 items-start">
                  
                  {/* Left Column: Database Config & Diagnostics */}
                  <div className="bg-slate-950 border border-slate-900 rounded-3xl p-6 space-y-4">
                    <div className="flex items-center justify-between">
                      <h3 className="text-xs font-sans font-black text-slate-200 uppercase tracking-widest flex items-center gap-2">
                        <Database className="w-4 h-4 text-emerald-500" />
                        Database Config & Diagnostics
                      </h3>
                      <button
                        onClick={loadDbStatus}
                        disabled={loadingDbStatus}
                        className="p-1 text-slate-400 hover:text-slate-200 hover:bg-slate-900 rounded-lg transition-colors"
                        title="Re-test Database Connectivity"
                      >
                        <RefreshCw className={`w-3.5 h-3.5 ${loadingDbStatus ? "animate-spin text-emerald-500" : ""}`} />
                      </button>
                    </div>

                    <div className="space-y-4 pt-1">
                      {loadingDbStatus && !dbStatus ? (
                        <div className="flex flex-col items-center justify-center py-6 text-slate-500 font-mono text-xs">
                          <RefreshCw className="w-5 h-5 animate-spin mb-2 text-emerald-500" />
                          Testing Supabase connection...
                        </div>
                      ) : dbStatus ? (
                        <div className="space-y-3">
                          {/* Connection Status Banner */}
                          <div className={`p-3 rounded-2xl border text-xs font-mono leading-normal ${
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
                                <AlertTriangle className={`w-4 h-4 shrink-0 mt-0.5 ${dbStatus.connectionError?.includes("deleted") ? "text-amber-500" : "text-red-500"}`} />
                              )}
                              <div className="space-y-1">
                                <span className="font-bold uppercase tracking-wide block">
                                  {dbStatus.configured && dbStatus.tableExists && !dbStatus.connectionError
                                    ? "Supabase Connected & Fully Operational"
                                    : dbStatus.connectionError?.includes("deleted")
                                    ? "Database Active (Missing Schema Columns)"
                                    : "Database Offline / Setup Required"}
                                </span>
                                <span className="text-[10px] text-slate-400 block font-sans">
                                  {dbStatus.connectionError || "Connected successfully to remote clips repository with correct schema columns."}
                                </span>
                              </div>
                            </div>
                          </div>

                          {/* Quick Specs */}
                          <div className="grid grid-cols-2 gap-2 text-[10px] font-mono">
                            <div className="bg-slate-900/60 border border-slate-900 rounded-xl p-2.5">
                              <span className="text-slate-500 block uppercase">Integration Setup</span>
                              <span className={`font-bold ${dbStatus.configured ? "text-emerald-400" : "text-slate-400"}`}>
                                {dbStatus.configured ? "✓ Configured" : "⚠️ Missing env variables"}
                              </span>
                            </div>
                            <div className="bg-slate-900/60 border border-slate-900 rounded-xl p-2.5">
                              <span className="text-slate-500 block uppercase">Clips Table Status</span>
                              <span className={`font-bold ${dbStatus.tableExists ? "text-emerald-400" : "text-amber-400"}`}>
                                {dbStatus.tableExists ? "✓ Table Exists" : "⚠️ Needs Creation"}
                              </span>
                            </div>
                          </div>

                          {dbStatus.supabaseUrl && (
                            <div className="bg-slate-900/40 border border-slate-900 rounded-xl p-2.5 font-mono text-[9px] text-slate-400 truncate">
                              <span className="text-slate-500 block uppercase text-[10px] mb-0.5">Supabase Endpoint</span>
                              {dbStatus.supabaseUrl}
                            </div>
                          )}

                          {/* Schema Fix SQL / Initialization Code Box */}
                          <div className="space-y-1.5 pt-1">
                            <span className="text-[10px] text-slate-300 font-bold block uppercase flex items-center justify-between">
                              <span>Database SQL Schema / Migration</span>
                              <button
                                onClick={() => handleCopySql(dbStatus.schemaSql)}
                                className="px-2 py-0.5 bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded text-[9px] font-mono text-slate-400 hover:text-slate-200 transition-all flex items-center gap-1"
                              >
                                {copiedSql ? (
                                  <>
                                    <Check className="w-3 h-3 text-emerald-500" />
                                    Copied!
                                  </>
                                ) : (
                                  <>
                                    <Copy className="w-3 h-3" />
                                    Copy SQL
                                  </>
                                )}
                              </button>
                            </span>
                            <div className="p-3 bg-slate-950 border border-slate-900 rounded-xl max-h-40 overflow-y-auto font-mono text-[9px] text-slate-400 leading-relaxed whitespace-pre select-all scrollbar-thin">
                              {dbStatus.schemaSql}
                            </div>
                            <span className="text-[8.5px] text-slate-500 font-sans block leading-normal">
                              💡 <strong>How to apply:</strong> Copy the SQL above, navigate to your <strong>Supabase Dashboard</strong> &rarr; <strong>SQL Editor</strong>, paste it, and click <strong>Run</strong>. This will automatically create or update your columns, enabling full persistent storage!
                            </span>
                          </div>
                        </div>
                      ) : (
                        <div className="text-xs text-slate-500 font-mono py-4 text-center">
                          Failed to check database connection status.
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Right Column: Sandbox Tools & Safety Matrix */}
                  <div className="space-y-6">
                    {/* Sandbox Tools */}
                    <div className="bg-slate-950 border border-slate-900 rounded-3xl p-5 space-y-4">
                      <h3 className="text-xs font-sans font-black text-slate-200 uppercase tracking-widest flex items-center gap-2">
                        <Settings className="w-4 h-4 text-red-500" />
                        System Controls
                      </h3>
                      
                      <div className="space-y-4 pt-1">
                        {/* Seed a report action */}
                        <div className="space-y-1">
                          <span className="text-[10px] text-slate-300 font-bold block uppercase">Pre-seed Violation Report</span>
                          <p className="text-[9px] text-slate-500 leading-tight">Generate a dummy abuse report dynamically targeting a random loop to test moderation flow queues.</p>
                          <button 
                            onClick={handleTriggerMockReport}
                            className="mt-2 px-3 py-1.5 bg-red-500/10 hover:bg-red-500/20 border border-red-500/25 text-red-400 hover:text-red-300 rounded-xl text-[10px] font-mono font-bold uppercase transition-colors"
                          >
                            Trigger Test Report
                          </button>
                        </div>

                        <div className="w-full h-[1px] bg-slate-900" />

                        {/* Content Auto-Moderation cost-warning note */}
                        <div className="p-3.5 bg-red-950/10 border border-red-950/20 rounded-2xl">
                          <span className="text-[10px] text-slate-300 font-bold block uppercase mb-1">AI Auto-Moderation</span>
                          <p className="text-[9px] text-slate-500 leading-relaxed font-mono">
                            ⚠️ AI automatic scanning of media is disabled to optimize operational costs and prevent unneeded model invocation fees. All content moderation is currently handled manually via the Reports Queue.
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* Community Safety Guide */}
                    <div className="bg-slate-950 border border-slate-900 rounded-3xl p-5 space-y-4">
                      <h3 className="text-xs font-sans font-black text-slate-200 uppercase tracking-widest flex items-center gap-2">
                        <ShieldCheck className="w-4 h-4 text-red-500" />
                        Community Safety Guide
                      </h3>
                      
                      <div className="space-y-3 pt-1 text-[10px] text-slate-400 leading-relaxed font-sans">
                        <p>
                          Our launch moderation matrix centers soft-deletes and account limits to preserve a welcoming, hilarious ecosystem for audio creators.
                        </p>
                        
                        <div className="space-y-2 border-l-2 border-red-500/20 pl-3">
                          <div>
                            <strong className="text-slate-200 block">✓ Soft-deletes are safe:</strong>
                            <span>Setting `deleted: true` allows administrators to dismiss abusive posts in seconds, preserving database keys in case of accidents or appeals.</span>
                          </div>
                          <div>
                            <strong className="text-slate-200 block">✓ Simple Strikes policy:</strong>
                            <span>We automate safety by enforcing suspensions as soon as any account registers 3 moderation strikes. Strikes can be revoked or added manually.</span>
                          </div>
                          <div>
                            <strong className="text-slate-200 block">✓ Abuse category matrix:</strong>
                            <span>We organize reports by: Pornography, Copyright, Harassment, Spam, Violence, and Other to filter critical tickets first.</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                </div>
              )}

            </div>
          )}

        </div>

      </div>

    </div>
  );
}
