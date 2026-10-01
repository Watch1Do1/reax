import React, { useState, useEffect, useRef, useMemo } from "react";
import { motion, AnimatePresence } from "motion/react";
import { 
  X, Heart, Volume2, Plus, ChevronRight, ArrowLeft, 
  CornerDownRight, Play, Pause, VolumeX, Volume1, Star, Trash2, Mic, 
  Flame, ListOrdered, ChevronDown, ChevronUp, Radio, Check
} from "lucide-react";
import { Clip, SavedReaction } from "../types";
import { speakText, playFilteredAudio, stopAllFilteredAudio } from "../utils/audio";
import { generateUniqueId, loadAndSanitizeReactions } from "../utils/keyUtils";

interface ThreadViewProps {
  key?: string;
  rootClipId: string;
  clips: Clip[];
  onClose: () => void;
  onLaugh: (id: string) => void;
  onLike: (id: string) => void;
  onUnlike?: (id: string) => void;
  onUnlaugh?: (id: string) => void;
  onDelete?: (id: string) => void;
  onRespond: (clip: Clip) => void;
  onRespondWithTone: (clip: Clip, tone: Clip["tone"]) => void;
  onRespondWithSaved?: (clip: Clip, reax: SavedReaction) => void;
  onViewUser?: (username: string) => void;
}

export default function ThreadView({ 
  rootClipId, 
  clips, 
  onClose, 
  onLaugh,
  onLike, 
  onUnlike,
  onUnlaugh,
  onDelete,
  onRespond, 
  onRespondWithTone,
  onRespondWithSaved,
  onViewUser
}: ThreadViewProps) {
  
  // 1. Resolve Ultimate Root Clip
  const ultimateRoot = useMemo<Clip | undefined>(() => {
    const target = clips.find(c => c.id === rootClipId);
    if (!target) return undefined;
    let current = target;
    while (current.parentId !== null) {
      const parent = clips.find(c => c.id === current.parentId);
      if (!parent) break;
      current = parent;
    }
    return current;
  }, [clips, rootClipId]);

  // Focused clip tracking (default to root or requested clip)
  const [focusedClipId, setFocusedClipId] = useState<string>(() => {
    return rootClipId || ultimateRoot?.id || "";
  });

  useEffect(() => {
    if (rootClipId) {
      setFocusedClipId(rootClipId);
    }
  }, [rootClipId]);

  const focusedClip = useMemo(() => {
    return clips.find(c => c.id === focusedClipId) || ultimateRoot;
  }, [clips, focusedClipId, ultimateRoot]);

  // 2. Breadcrumb calculation: Real authors in chain (Original → @parent → @author)
  const breadcrumbChain = useMemo<Clip[]>(() => {
    if (!focusedClip || !ultimateRoot) return [];
    if (focusedClip.id === ultimateRoot.id) return [ultimateRoot];

    const chain: Clip[] = [];
    let curr: Clip | undefined = focusedClip;
    while (curr) {
      chain.unshift(curr);
      if (curr.id === ultimateRoot.id || !curr.parentId) break;
      curr = clips.find(c => c.id === curr.parentId);
    }
    if (chain.length > 0 && chain[0].id !== ultimateRoot.id) {
      chain.unshift(ultimateRoot);
    }
    return chain;
  }, [focusedClip, ultimateRoot, clips]);

  // 3. Ranking Direct Reax (Client-side only, thread view only)
  // Formula: createdAt decay, likesCount, laughsCount, and capped child count (max 3). No depth sorting.
  const directReaxList = useMemo<Clip[]>(() => {
    if (!ultimateRoot) return [];
    const direct = clips.filter(c => c.parentId === ultimateRoot.id);

    return [...direct].sort((a, b) => {
      // Child count under this direct Reax (capped at 3)
      const childCountA = clips.filter(c => c.parentId === a.id).length;
      const childCountB = clips.filter(c => c.parentId === b.id).length;
      const cappedChildrenA = Math.min(childCountA, 3);
      const cappedChildrenB = Math.min(childCountB, 3);

      // CreatedAt decay (hours since post)
      const ageHoursA = Math.max(0, (Date.now() - new Date(a.createdAt).getTime()) / (1000 * 60 * 60));
      const ageHoursB = Math.max(0, (Date.now() - new Date(b.createdAt).getTime()) / (1000 * 60 * 60));
      const decayScoreA = 20 / (ageHoursA + 1);
      const decayScoreB = 20 / (ageHoursB + 1);

      const scoreA = (a.likesCount * 2) + ((a.laughsCount || 0) * 3) + (cappedChildrenA * 4) + decayScoreA;
      const scoreB = (b.likesCount * 2) + ((b.laughsCount || 0) * 3) + (cappedChildrenB * 4) + decayScoreB;

      return scoreB - scoreA;
    });
  }, [clips, ultimateRoot]);

  // 4. Branch Riffs & Collapsed State (Depth > 2 collapsed behind "X more riffs")
  const [expandedBranches, setExpandedBranches] = useState<Record<string, boolean>>({});

  const toggleExpandBranch = (directReaxId: string) => {
    setExpandedBranches(prev => ({
      ...prev,
      [directReaxId]: !prev[directReaxId]
    }));
  };

  // Helper: Get all descendants of a clip up to max depth 4
  const getBranchRiffs = (directReaxId: string) => {
    // Level 2 (Riffs directly on direct Reax)
    const level2 = clips.filter(c => c.parentId === directReaxId);

    // Level 3+ (Deeper riffs whose parent is in level 2 or further)
    const deeper: Clip[] = [];
    const queue = [...level2];
    const visited = new Set<string>(level2.map(c => c.id));

    while (queue.length > 0) {
      const current = queue.shift()!;
      const children = clips.filter(c => c.parentId === current.id);
      for (const child of children) {
        if (!visited.has(child.id)) {
          visited.add(child.id);
          deeper.push(child);
          queue.push(child);
        }
      }
    }

    return { level2, deeper, totalDescendants: level2.length + deeper.length };
  };

  // 5. Playback Controller: Single player active at a time, no autoplay sound
  const [activePlayingId, setActivePlayingId] = useState<string | null>(null);
  const [activePlayingAudioUrl, setActivePlayingAudioUrl] = useState<string | null>(null);
  const [branchPlayback, setBranchPlayback] = useState<{
    directId: string;
    queue: Clip[];
    currentIndex: number;
  } | null>(null);

  const branchTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Stop branch playback
  const stopBranchPlayback = () => {
    if (branchTimerRef.current) {
      clearTimeout(branchTimerRef.current);
      branchTimerRef.current = null;
    }
    setBranchPlayback(null);
    stopAllFilteredAudio();
    setActivePlayingAudioUrl(null);
  };

  // Play audio for a specific clip safely
  const playClipAudio = (clip: Clip) => {
    stopAllFilteredAudio();

    // Resolve audio URL or voiceText
    let audioUrl = clip.voiceAudioUrl;
    if (!audioUrl && clip.voiceText) {
      if (clip.voiceText.startsWith("audio_url:")) {
        audioUrl = clip.voiceText.split("|||")[0].replace(/^audio_url:/, "");
      } else if (clip.voiceText.startsWith("http") && (clip.voiceText.includes("/storage/") || clip.voiceText.includes(".webm") || clip.voiceText.includes(".mp4"))) {
        audioUrl = clip.voiceText;
      }
    }
    if (!audioUrl && clip.mediaType === "audio") {
      audioUrl = clip.mediaUrl;
    }

    if (audioUrl) {
      setActivePlayingAudioUrl(clip.id);
      playFilteredAudio(audioUrl, clip.voiceStyle || "normal")
        .catch(() => setActivePlayingAudioUrl(null))
        .finally(() => {
          setTimeout(() => {
            setActivePlayingAudioUrl(null);
          }, 5000);
        });
    } else if (clip.voiceAudioData) {
      setActivePlayingAudioUrl(clip.id);
      playFilteredAudio(clip.voiceAudioData, clip.voiceStyle || "normal")
        .catch(() => setActivePlayingAudioUrl(null))
        .finally(() => {
          setTimeout(() => {
            setActivePlayingAudioUrl(null);
          }, 5000);
        });
    } else if (clip.voiceText && clip.voiceText.trim() !== "" && !clip.voiceText.includes("Voice Reaction") && !clip.voiceText.startsWith("audio_url:")) {
      setActivePlayingAudioUrl(clip.id);
      speakText(clip.voiceText, clip.tone, clip.voiceStyle);
      setTimeout(() => {
        setActivePlayingAudioUrl(null);
      }, 3000);
    }
  };

  // "Play this branch": plays the selected direct Reax, then its visible riffs in order
  const handlePlayBranch = (directReaxClip: Clip, visibleRiffs: Clip[]) => {
    stopBranchPlayback();

    const queue = [directReaxClip, ...visibleRiffs];
    if (queue.length === 0) return;

    setBranchPlayback({
      directId: directReaxClip.id,
      queue,
      currentIndex: 0
    });

    setActivePlayingId(queue[0].id);
    playClipAudio(queue[0]);

    // Schedule advancing through the queue (5-second limit per clip)
    let currentIdx = 0;
    const advance = () => {
      currentIdx += 1;
      if (currentIdx < queue.length) {
        setBranchPlayback(prev => prev ? { ...prev, currentIndex: currentIdx } : null);
        setActivePlayingId(queue[currentIdx].id);
        playClipAudio(queue[currentIdx]);
        branchTimerRef.current = setTimeout(advance, 5000);
      } else {
        stopBranchPlayback();
      }
    };

    branchTimerRef.current = setTimeout(advance, 5000);
  };

  // Clean up timers on unmount
  useEffect(() => {
    return () => {
      if (branchTimerRef.current) clearTimeout(branchTimerRef.current);
      stopAllFilteredAudio();
    };
  }, []);

  // 6. Likes and Laughs Sync
  const getStoredIds = (key: string): string[] => {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  };

  const logged = typeof window !== "undefined" && localStorage.getItem("reax_is_logged_in") === "true";

  const handleLike = (clipId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!logged) {
      window.dispatchEvent(new CustomEvent("reax_upgrade_trigger", { detail: { reason: "save_reaction" } }));
      return;
    }
    const currentLiked = getStoredIds("reax_liked_ids").includes(clipId);
    let ids = getStoredIds("reax_liked_ids");
    if (!currentLiked) {
      ids.push(clipId);
      onLike(clipId);
    } else {
      ids = ids.filter(id => id !== clipId);
      onUnlike?.(clipId);
    }
    localStorage.setItem("reax_liked_ids", JSON.stringify(ids));
    window.dispatchEvent(new Event("reax_likes_changed"));
  };

  const handleLaugh = (clipId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!logged) {
      window.dispatchEvent(new CustomEvent("reax_upgrade_trigger", { detail: { reason: "save_reaction" } }));
      return;
    }
    const currentLaughed = getStoredIds("reax_laughed_ids").includes(clipId);
    let ids = getStoredIds("reax_laughed_ids");
    if (!currentLaughed) {
      ids.push(clipId);
      onLaugh(clipId);
    } else {
      ids = ids.filter(id => id !== clipId);
      onUnlaugh?.(clipId);
    }
    localStorage.setItem("reax_laughed_ids", JSON.stringify(ids));
    window.dispatchEvent(new Event("reax_likes_changed"));
  };

  // Saved Reactions Tray State
  const [activeSavedTargetClip, setActiveSavedTargetClip] = useState<Clip | null>(null);
  const [savedReactions, setSavedReactions] = useState<SavedReaction[]>([]);

  useEffect(() => {
    setSavedReactions(loadAndSanitizeReactions());
  }, []);

  if (!ultimateRoot) return null;

  return (
    <div className="fixed inset-0 z-40 bg-black/85 backdrop-blur-md overflow-y-auto p-3 sm:p-6 md:p-8 flex items-center justify-center animate-fade-in">
      <div className="w-full max-w-2xl bg-[#08090c]/95 backdrop-blur-2xl border border-slate-800/60 rounded-3xl relative flex flex-col max-h-[92vh] shadow-[0_24px_64px_rgba(0,0,0,0.7)] overflow-hidden">
        
        {/* Top Header Bar */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-800/80 bg-slate-950/80 flex-shrink-0 z-20">
          <div>
            <span className="text-[9px] font-mono font-black tracking-widest text-indigo-400 uppercase">
              CONVERSATION THREAD
            </span>
            <h3 className="text-sm font-sans font-black text-white leading-tight uppercase flex items-center gap-2 mt-0.5">
              <span>Thread Reactions</span>
              <span className="text-[10px] bg-indigo-500/10 border border-indigo-500/25 text-indigo-300 font-mono px-2 py-0.5 rounded-full font-bold">
                {directReaxList.length} Direct Reax
              </span>
            </h3>
          </div>
          <button 
            type="button"
            onClick={onClose}
            className="p-1.5 hover:bg-slate-800 rounded-full transition-colors text-slate-400 hover:text-white cursor-pointer"
            title="Close Thread"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Real Authors Breadcrumb Chain: Original → @parent → @author */}
        <div className="py-2.5 px-5 bg-slate-950/95 border-b border-slate-800/60 flex-shrink-0 flex items-center gap-1.5 overflow-x-auto text-xs font-mono scrollbar-none z-10">
          <span className="text-slate-500 font-bold uppercase text-[9px] mr-1 flex items-center gap-1">
            CHAIN:
          </span>
          {breadcrumbChain.map((node, i) => {
            const isRootNode = node.id === ultimateRoot.id;
            const isCurrentNode = node.id === focusedClip.id;

            return (
              <React.Fragment key={`breadcrumb-${node.id}`}>
                {i > 0 && <ChevronRight className="w-3 h-3 text-slate-600 flex-shrink-0" />}
                <button
                  type="button"
                  onClick={() => setFocusedClipId(node.id)}
                  className={`flex items-center gap-1 px-2 py-0.5 rounded-md transition-all flex-shrink-0 cursor-pointer ${
                    isCurrentNode
                      ? "bg-indigo-600/25 border border-indigo-500/40 text-indigo-300 font-black shadow-sm"
                      : "text-slate-400 hover:text-slate-200 border border-transparent"
                  }`}
                  title={`Focus @${node.authorName}'s clip`}
                >
                  <span className="font-bold">{isRootNode ? "Original" : `@${node.authorName}`}</span>
                  {isRootNode && <span className="text-[9px] text-slate-500">(@{node.authorName})</span>}
                </button>
              </React.Fragment>
            );
          })}
        </div>

        {/* Branch Playback Active Status Banner */}
        {branchPlayback && (
          <div className="px-5 py-2 bg-gradient-to-r from-indigo-900/60 via-purple-900/60 to-pink-900/60 border-b border-indigo-500/30 flex items-center justify-between text-xs text-white z-10 animate-fade-in">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
              <span className="font-bold font-mono text-[11px]">
                PLAYING BRANCH ({branchPlayback.currentIndex + 1} / {branchPlayback.queue.length})
              </span>
              <span className="text-indigo-200 text-[11px] truncate max-w-[200px]">
                • @{branchPlayback.queue[branchPlayback.currentIndex]?.authorName}
              </span>
            </div>
            <button
              type="button"
              onClick={stopBranchPlayback}
              className="px-2 py-0.5 bg-black/50 hover:bg-black/80 border border-white/20 rounded text-[10px] font-mono font-bold transition-all cursor-pointer"
            >
              Stop
            </button>
          </div>
        )}

        {/* Scrollable Thread Content */}
        <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-5 space-y-6">
          
          {/* ========================================================= */}
          {/* 1. ROOT CLIP: Full Width, Pinned at Top                   */}
          {/* ========================================================= */}
          <div className="w-full bg-slate-900/80 border-2 border-indigo-500/50 rounded-2xl p-4 sm:p-5 shadow-xl relative backdrop-blur-xl">
            {/* Header: Author & Tag */}
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2.5">
                <button
                  type="button"
                  onClick={() => onViewUser?.(ultimateRoot.authorName)}
                  className="w-8 h-8 rounded-full bg-indigo-500/20 border border-indigo-500/40 text-indigo-300 flex items-center justify-center font-mono font-bold text-xs hover:bg-indigo-600 hover:text-white transition-colors cursor-pointer"
                  title={`View @${ultimateRoot.authorName}'s profile`}
                >
                  {ultimateRoot.authorName[0]?.toUpperCase()}
                </button>
                <div>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => onViewUser?.(ultimateRoot.authorName)}
                      className="text-xs font-bold text-white hover:text-indigo-300 transition-colors cursor-pointer"
                    >
                      @{ultimateRoot.authorName}
                    </button>
                    <span className="px-1.5 py-0.2 bg-indigo-500/20 border border-indigo-500/35 rounded text-[8px] font-mono font-black uppercase text-indigo-300 tracking-wider">
                      ROOT
                    </span>
                  </div>
                  <span className="text-[9px] font-mono text-slate-500 block">
                    {new Date(ultimateRoot.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              </div>

              <span className={`px-2.5 py-0.5 rounded-full text-[9px] font-mono font-bold capitalize border ${
                ultimateRoot.tone === "funny" ? "bg-amber-500/10 text-amber-400 border-amber-500/20" :
                ultimateRoot.tone === "dramatic" ? "bg-rose-500/10 text-rose-400 border-rose-500/20" :
                ultimateRoot.tone === "sarcastic" ? "bg-purple-500/10 text-purple-400 border-purple-500/20" :
                ultimateRoot.tone === "chill" ? "bg-sky-500/10 text-sky-400 border-sky-500/20" :
                "bg-orange-500/10 text-orange-400 border-orange-500/20"
              }`}>
                {ultimateRoot.tone}
              </span>
            </div>

            {/* Media Box: Video or Image */}
            <div 
              onClick={() => {
                setActivePlayingId(ultimateRoot.id);
                playClipAudio(ultimateRoot);
              }}
              className={`relative aspect-video rounded-xl bg-black overflow-hidden flex items-center justify-center border border-slate-800 shadow-inner group/media cursor-pointer ${
                activePlayingId === ultimateRoot.id ? "ring-2 ring-indigo-500 shadow-indigo-500/20" : ""
              }`}
            >
              {ultimateRoot.mediaUrl.endsWith(".mp4") || ultimateRoot.mediaUrl.endsWith(".webm") || ultimateRoot.mediaUrl.includes("mixkit-") ? (
                <video 
                  src={ultimateRoot.mediaUrl} 
                  className="w-full h-full object-cover pointer-events-none" 
                  loop 
                  muted={true} 
                  playsInline 
                  preload="metadata" 
                />
              ) : (
                <img 
                  src={ultimateRoot.mediaUrl} 
                  className="w-full h-full object-cover pointer-events-none" 
                  alt="" 
                  referrerPolicy="no-referrer" 
                />
              )}

              {/* Overlay Text */}
              {ultimateRoot.overlayText && (
                <div className="absolute bottom-3 inset-x-0 flex justify-center items-end text-center px-4 z-10 pointer-events-none">
                  <h2 className="font-sans font-black text-base sm:text-lg text-white uppercase drop-shadow-[0_2px_4px_rgba(0,0,0,0.9)] max-w-full leading-tight">
                    {ultimateRoot.overlayText}
                  </h2>
                </div>
              )}

              {/* Audio playing visual indicator */}
              {activePlayingAudioUrl === ultimateRoot.id && (
                <div className="absolute top-2.5 right-2.5 z-20 flex items-center gap-1.5 px-2 py-1 rounded bg-emerald-600 text-white text-[9px] font-mono font-bold shadow-md animate-pulse">
                  <span className="w-1.5 h-1.5 rounded-full bg-white animate-ping" />
                  <span>VOICE ACTIVE</span>
                </div>
              )}
            </div>

            {/* Root Engagement & Primary REAX Action */}
            <div className="flex flex-wrap items-center justify-between gap-3 mt-3.5 pt-3 border-t border-slate-800/60">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={(e) => handleLaugh(ultimateRoot.id, e)}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/25 text-amber-300 text-xs font-mono font-bold transition-all active:scale-95 cursor-pointer"
                  title="Laugh"
                >
                  <span>😂</span>
                  <span>{ultimateRoot.laughsCount ?? 0}</span>
                </button>

                <button
                  type="button"
                  onClick={(e) => handleLike(ultimateRoot.id, e)}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 text-rose-400 text-xs font-mono font-bold transition-all active:scale-95 cursor-pointer"
                  title="Like"
                >
                  <Heart className="w-3.5 h-3.5 fill-rose-500/20" />
                  <span>{ultimateRoot.likesCount}</span>
                </button>

                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setActivePlayingId(ultimateRoot.id);
                    playClipAudio(ultimateRoot);
                  }}
                  className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-mono font-bold border transition-all cursor-pointer ${
                    activePlayingAudioUrl === ultimateRoot.id
                      ? "bg-emerald-600 text-white border-emerald-400 animate-pulse"
                      : "bg-slate-900 hover:bg-slate-800 text-slate-300 border-slate-800"
                  }`}
                  title="Play Voice Audio"
                >
                  <Mic className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Voice</span>
                </button>
              </div>

              {/* PRIMARY ACTION: "Reax" (Always posts with parentId = root.id) */}
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => onRespond(ultimateRoot)}
                  className="flex items-center gap-1.5 px-4 py-2 bg-gradient-to-r from-indigo-600 to-indigo-500 hover:from-indigo-500 hover:to-indigo-400 text-white rounded-xl text-xs font-black shadow-lg shadow-indigo-500/20 transition-all active:scale-95 cursor-pointer uppercase tracking-wider"
                  title="Reax to Original Post (parentId = root)"
                >
                  <CornerDownRight className="w-4 h-4" />
                  <span>Reax to Original</span>
                </button>
              </div>
            </div>

            {/* Quick-Tone Tap Bar for Root (All post with parentId = root.id) */}
            <div className="mt-3 pt-3 border-t border-slate-800/40">
              <span className="block text-[9px] font-mono font-black text-slate-400 uppercase tracking-widest mb-1.5">
                ⚡ QUICK REAX TO ORIGINAL:
              </span>
              <div className="grid grid-cols-6 gap-1.5">
                {[
                  { id: "funny" as const, emoji: "🎭", label: "Funny", color: "hover:border-amber-400 text-amber-300" },
                  { id: "dramatic" as const, emoji: "🎬", label: "Drama", color: "hover:border-rose-400 text-rose-300" },
                  { id: "sarcastic" as const, emoji: "🙄", label: "Sarcasm", color: "hover:border-purple-400 text-purple-300" },
                  { id: "chill" as const, emoji: "🌊", label: "Chill", color: "hover:border-sky-400 text-sky-300" },
                  { id: "chaotic" as const, emoji: "⚡", label: "Chaos", color: "hover:border-orange-400 text-orange-300" }
                ].map(toneItem => (
                  <button
                    key={`root-tone-${toneItem.id}`}
                    type="button"
                    onClick={() => onRespondWithTone(ultimateRoot, toneItem.id)}
                    className={`flex flex-col items-center justify-center py-2 px-1 bg-slate-950/80 border border-slate-800/80 rounded-xl transition-all active:scale-95 cursor-pointer ${toneItem.color}`}
                    title={`Reax with ${toneItem.label} tone`}
                  >
                    <span className="text-sm">{toneItem.emoji}</span>
                    <span className="text-[8px] font-bold mt-0.5">{toneItem.label}</span>
                  </button>
                ))}

                {/* Vault saved pick button */}
                <button
                  type="button"
                  onClick={() => setActiveSavedTargetClip(activeSavedTargetClip?.id === ultimateRoot.id ? null : ultimateRoot)}
                  className={`flex flex-col items-center justify-center py-2 px-1 bg-slate-950/80 border rounded-xl transition-all active:scale-95 cursor-pointer text-amber-400 ${
                    activeSavedTargetClip?.id === ultimateRoot.id
                      ? "border-amber-400 bg-amber-500/10 shadow-sm"
                      : "border-slate-800/80 hover:border-amber-400"
                  }`}
                  title="Reax with Saved Reaction"
                >
                  <span className="text-sm">⭐</span>
                  <span className="text-[8px] font-bold mt-0.5">Saved</span>
                </button>
              </div>

              {/* Saved Tray Selector for Root */}
              {activeSavedTargetClip?.id === ultimateRoot.id && (
                <div className="mt-2.5 p-2.5 bg-slate-950 border border-amber-500/30 rounded-xl space-y-1.5 animate-fade-in">
                  <span className="text-[8px] font-mono font-black text-amber-400 uppercase tracking-widest block">
                    ⭐ SELECT SAVED REACTION TO REAX (PARENT = ROOT):
                  </span>
                  {savedReactions.length === 0 ? (
                    <p className="text-[10px] text-slate-500 italic py-2 text-center">No saved reactions found in your Vault.</p>
                  ) : (
                    <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-thin">
                      {savedReactions.map(saved => (
                        <button
                          key={`root-saved-${saved.id}`}
                          type="button"
                          onClick={() => {
                            onRespondWithSaved?.(ultimateRoot, saved);
                            setActiveSavedTargetClip(null);
                          }}
                          className="flex-shrink-0 w-24 bg-slate-900 border border-slate-800 hover:border-amber-400 rounded-lg p-1 text-left transition-all active:scale-95 cursor-pointer"
                        >
                          <div className="aspect-video w-full rounded bg-black overflow-hidden mb-1">
                            <img src={saved.mediaUrl} className="w-full h-full object-cover" alt="" />
                          </div>
                          <span className="text-[8px] font-bold text-slate-300 block truncate">{saved.overlayText || saved.tone}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>


          {/* ========================================================= */}
          {/* 2. DIRECT REAX: Vertical List, Same-Size Cards            */}
          {/* ========================================================= */}
          <div className="space-y-4">
            <div className="flex items-center justify-between px-1">
              <span className="text-[10px] font-mono font-black text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-pulse" />
                DIRECT REAX ({directReaxList.length})
              </span>
              <span className="text-[9px] font-mono text-slate-500 uppercase">
                Ranked by Recency & Velocity
              </span>
            </div>

            {directReaxList.length === 0 ? (
              <div className="text-center py-10 bg-slate-950/40 border border-slate-800/40 rounded-2xl p-6 space-y-2">
                <p className="text-xs text-slate-400 font-medium">No direct reactions yet.</p>
                <p className="text-[10px] text-slate-600">Be the first to hit "Reax to Original" above!</p>
              </div>
            ) : (
              <div className="space-y-6">
                {directReaxList.map(directReax => {
                  const { level2, deeper, totalDescendants } = getBranchRiffs(directReax.id);
                  const isExpanded = !!expandedBranches[directReax.id];
                  const visibleRiffs = isExpanded ? [...level2, ...deeper] : level2;
                  const isCurrentlyPlayingThisCard = activePlayingId === directReax.id;

                  return (
                    <div 
                      key={`direct-${directReax.id}`} 
                      className={`w-full bg-slate-900/60 border rounded-2xl p-4 sm:p-5 shadow-lg transition-all ${
                        isCurrentlyPlayingThisCard
                          ? "border-indigo-500 shadow-indigo-500/20 ring-1 ring-indigo-500"
                          : "border-slate-800/80 hover:border-slate-700"
                      }`}
                    >
                      {/* Direct Reax Header */}
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => onViewUser?.(directReax.authorName)}
                            className="w-7 h-7 rounded-full bg-slate-800 text-slate-300 flex items-center justify-center font-mono font-bold text-xs hover:bg-indigo-600 hover:text-white transition-colors cursor-pointer"
                          >
                            {directReax.authorName[0]?.toUpperCase()}
                          </button>
                          <div>
                            <button
                              type="button"
                              onClick={() => onViewUser?.(directReax.authorName)}
                              className="text-xs font-bold text-slate-200 hover:text-indigo-300 transition-colors block text-left cursor-pointer"
                            >
                              @{directReax.authorName}
                            </button>
                            <span className="text-[9px] font-mono text-slate-500 block">
                              {new Date(directReax.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </span>
                          </div>
                        </div>

                        <span className={`px-2 py-0.5 rounded text-[9px] font-mono font-semibold capitalize border ${
                          directReax.tone === "funny" ? "bg-amber-500/10 text-amber-400 border-amber-500/20" :
                          directReax.tone === "dramatic" ? "bg-rose-500/10 text-rose-400 border-rose-500/20" :
                          directReax.tone === "sarcastic" ? "bg-purple-500/10 text-purple-400 border-purple-500/20" :
                          directReax.tone === "chill" ? "bg-sky-500/10 text-sky-400 border-sky-500/20" :
                          "bg-orange-500/10 text-orange-400 border-orange-500/20"
                        }`}>
                          {directReax.tone}
                        </span>
                      </div>

                      {/* Same-size Media Card */}
                      <div 
                        onClick={() => {
                          setActivePlayingId(directReax.id);
                          playClipAudio(directReax);
                        }}
                        className={`relative aspect-video rounded-xl bg-black overflow-hidden flex items-center justify-center border border-slate-900 shadow-inner cursor-pointer ${
                          isCurrentlyPlayingThisCard ? "ring-2 ring-indigo-500" : ""
                        }`}
                      >
                        {directReax.mediaUrl.endsWith(".mp4") || directReax.mediaUrl.endsWith(".webm") || directReax.mediaUrl.includes("mixkit-") ? (
                          <video 
                            src={directReax.mediaUrl} 
                            className="w-full h-full object-cover pointer-events-none" 
                            loop 
                            muted={true} 
                            playsInline 
                            preload="metadata" 
                          />
                        ) : (
                          <img 
                            src={directReax.mediaUrl} 
                            className="w-full h-full object-cover pointer-events-none" 
                            alt="" 
                            referrerPolicy="no-referrer" 
                          />
                        )}

                        {directReax.overlayText && (
                          <div className="absolute bottom-3 inset-x-0 flex justify-center items-end text-center px-3 z-10 pointer-events-none">
                            <h2 className="font-sans font-black text-sm sm:text-base text-white uppercase drop-shadow-[0_2px_4px_rgba(0,0,0,0.9)] max-w-full leading-tight">
                              {directReax.overlayText}
                            </h2>
                          </div>
                        )}

                        {activePlayingAudioUrl === directReax.id && (
                          <div className="absolute top-2.5 right-2.5 z-20 flex items-center gap-1.5 px-2 py-0.5 rounded bg-emerald-600 text-white text-[8px] font-mono font-bold animate-pulse">
                            <span>PLAYING VOICE</span>
                          </div>
                        )}
                      </div>

                      {/* Card Action Row: Like, Laugh, "Play this branch", and "Riff" */}
                      <div className="flex flex-wrap items-center justify-between gap-2.5 mt-3 pt-3 border-t border-slate-800/60">
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={(e) => handleLaugh(directReax.id, e)}
                            className="flex items-center gap-1 px-2 py-0.5 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/25 text-amber-300 text-xs font-mono font-bold transition-all active:scale-95 cursor-pointer"
                          >
                            <span>😂</span>
                            <span>{directReax.laughsCount ?? 0}</span>
                          </button>

                          <button
                            type="button"
                            onClick={(e) => handleLike(directReax.id, e)}
                            className="flex items-center gap-1 px-2 py-0.5 rounded-lg bg-slate-950 hover:bg-slate-800 border border-slate-800 text-rose-400 text-xs font-mono font-bold transition-all active:scale-95 cursor-pointer"
                          >
                            <Heart className="w-3.5 h-3.5 fill-rose-500/20" />
                            <span>{directReax.likesCount}</span>
                          </button>

                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setActivePlayingId(directReax.id);
                              playClipAudio(directReax);
                            }}
                            className={`flex items-center gap-1 px-2 py-0.5 rounded-lg text-xs font-mono font-bold border transition-all cursor-pointer ${
                              activePlayingAudioUrl === directReax.id
                                ? "bg-emerald-600 text-white border-emerald-400"
                                : "bg-slate-950 hover:bg-slate-800 text-slate-300 border-slate-800"
                            }`}
                          >
                            <Mic className="w-3 h-3 text-emerald-400" />
                            <span className="hidden sm:inline">Voice</span>
                          </button>
                        </div>

                        <div className="flex items-center gap-2">
                          {/* "Play this branch" Button */}
                          <button
                            type="button"
                            onClick={() => handlePlayBranch(directReax, visibleRiffs)}
                            className="flex items-center gap-1 px-2.5 py-1.5 bg-slate-950 hover:bg-slate-800 text-indigo-300 border border-indigo-500/30 rounded-xl text-xs font-bold transition-all active:scale-95 cursor-pointer shadow-sm"
                            title="Play this reaction, then its visible riffs in order"
                          >
                            <Play className="w-3 h-3 fill-indigo-400 text-indigo-400" />
                            <span>Play branch</span>
                          </button>

                          {/* "Riff" Action (Posts with parentId = directReax.id) */}
                          <button
                            type="button"
                            onClick={() => onRespond(directReax)}
                            className="flex items-center gap-1 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold transition-all active:scale-95 cursor-pointer shadow-sm"
                            title={`Riff on @${directReax.authorName}'s reaction (parentId = ${directReax.id})`}
                          >
                            <CornerDownRight className="w-3.5 h-3.5" />
                            <span>Riff</span>
                          </button>
                        </div>
                      </div>

                      {/* ========================================================= */}
                      {/* 3. RIFFS: Mini-Cards Under that Card, No Extra Indent      */}
                      {/* ========================================================= */}
                      {totalDescendants > 0 && (
                        <div className="mt-3.5 pt-3 border-t border-slate-800/80 space-y-2.5">
                          <div className="flex items-center justify-between">
                            <span className="text-[9px] font-mono font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1">
                              <span>⚡ RIFFS ({totalDescendants})</span>
                            </span>
                            {deeper.length > 0 && (
                              <button
                                type="button"
                                onClick={() => toggleExpandBranch(directReax.id)}
                                className="text-[9px] font-mono font-bold text-cyan-400 hover:text-cyan-300 flex items-center gap-1 transition-colors cursor-pointer"
                              >
                                {isExpanded ? (
                                  <>
                                    <ChevronUp className="w-3 h-3" /> Hide {deeper.length} deeper riffs
                                  </>
                                ) : (
                                  <>
                                    <ChevronDown className="w-3 h-3" /> {deeper.length} more riffs
                                  </>
                                )}
                              </button>
                            )}
                          </div>

                          {/* Mini-Cards Container (Spanning full width, no extra indent) */}
                          <div className="space-y-2">
                            {visibleRiffs.map(riff => {
                              const isCurrentlyPlayingThisRiff = activePlayingId === riff.id;
                              const isDeeper = riff.parentId !== directReax.id;

                              return (
                                <div
                                  key={`riff-${riff.id}`}
                                  onClick={() => {
                                    setFocusedClipId(riff.id);
                                    setActivePlayingId(riff.id);
                                    playClipAudio(riff);
                                  }}
                                  className={`w-full bg-slate-950/70 border rounded-xl p-2.5 flex items-center justify-between gap-3 transition-all cursor-pointer ${
                                    isCurrentlyPlayingThisRiff
                                      ? "border-indigo-400 bg-indigo-950/20 ring-1 ring-indigo-400 shadow-md"
                                      : "border-slate-800/80 hover:border-slate-700"
                                  }`}
                                >
                                  {/* Left: Thumbnail & Info */}
                                  <div className="flex items-center gap-2.5 min-w-0 flex-1">
                                    <div className="w-14 aspect-video rounded-lg bg-black overflow-hidden flex-shrink-0 relative border border-slate-800">
                                      {riff.mediaUrl.endsWith(".mp4") || riff.mediaUrl.endsWith(".webm") || riff.mediaUrl.includes("mixkit-") ? (
                                        <video src={riff.mediaUrl} className="w-full h-full object-cover" muted playsInline />
                                      ) : (
                                        <img src={riff.mediaUrl} className="w-full h-full object-cover" alt="" referrerPolicy="no-referrer" />
                                      )}
                                      {isDeeper && (
                                        <div className="absolute top-0.5 left-0.5 px-1 bg-purple-500/80 text-[6px] font-mono text-white rounded font-bold">
                                          +1
                                        </div>
                                      )}
                                    </div>

                                    <div className="min-w-0 flex-1">
                                      <div className="flex items-center gap-1.5">
                                        <span className="text-[11px] font-bold text-slate-200 truncate">
                                          @{riff.authorName}
                                        </span>
                                        <span className="text-[8px] font-mono px-1 rounded bg-slate-800 text-slate-400 uppercase">
                                          {riff.tone}
                                        </span>
                                      </div>
                                      <p className="text-[10px] text-slate-400 truncate italic mt-0.5">
                                        "{riff.overlayText || riff.voiceText || "Riff response"}"
                                      </p>
                                    </div>
                                  </div>

                                  {/* Right: Laugh, Voice, and Riff on this mini-card */}
                                  <div className="flex items-center gap-1.5 flex-shrink-0">
                                    <button
                                      type="button"
                                      onClick={(e) => handleLaugh(riff.id, e)}
                                      className="flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-slate-900 border border-slate-800 text-[10px] font-mono text-amber-300"
                                      title="Laugh"
                                    >
                                      <span>😂</span>
                                      <span>{riff.laughsCount ?? 0}</span>
                                    </button>

                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setActivePlayingId(riff.id);
                                        playClipAudio(riff);
                                      }}
                                      className={`p-1 rounded border transition-colors ${
                                        activePlayingAudioUrl === riff.id
                                          ? "bg-emerald-600 text-white border-emerald-400"
                                          : "bg-slate-900 text-slate-400 hover:text-white border-slate-800"
                                      }`}
                                      title="Play audio"
                                    >
                                      <Mic className="w-3 h-3 text-emerald-400" />
                                    </button>

                                    {/* Small Riff Action on this card (posts with parentId = riff.id) */}
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        onRespond(riff);
                                      }}
                                      className="flex items-center gap-0.5 px-2 py-1 bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-200 hover:text-white rounded-lg text-[10px] font-bold transition-all active:scale-95 cursor-pointer"
                                      title={`Riff on @${riff.authorName}'s reaction`}
                                    >
                                      <CornerDownRight className="w-2.5 h-2.5 text-cyan-400" />
                                      <span>Riff</span>
                                    </button>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

        </div>

      </div>
    </div>
  );
}
