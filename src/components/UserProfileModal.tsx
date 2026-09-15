import React, { useState, useMemo } from "react";
import { motion, AnimatePresence } from "motion/react";
import { 
  X, User, Heart, MessageCircle, Sparkles, Film, 
  CornerDownRight, Mic, Calendar, Flame, ChevronRight, ExternalLink
} from "lucide-react";
import { Clip } from "../types";

export interface UserProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  username: string | null;
  allClips: Clip[];
  onSelectClip: (clipId: string) => void;
  onRespondToClip?: (clip: Clip) => void;
}

export default function UserProfileModal({
  isOpen,
  onClose,
  username,
  allClips,
  onSelectClip,
  onRespondToClip
}: UserProfileModalProps) {
  const [filterTab, setFilterTab] = useState<"all" | "roots" | "replies">("all");

  // Clean target username
  const cleanTarget = (username || "").trim().replace(/^@/, "");
  const targetLower = cleanTarget.toLowerCase();

  // Find all clips authored by this user
  const userClips = useMemo(() => {
    if (!cleanTarget) return [];
    return allClips.filter((clip) => {
      const author = (clip.authorName || "").trim().toLowerCase().replace(/^~/, "");
      const search = targetLower.replace(/^~/, "");
      return author === search || author === targetLower;
    }).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [cleanTarget, targetLower, allClips]);

  // Aggregate stats
  const stats = useMemo(() => {
    const totalClips = userClips.length;
    const totalLikes = userClips.reduce((acc, c) => acc + (c.likesCount || 0), 0);
    const totalLaughs = userClips.reduce((acc, c) => acc + (c.laughsCount || 0), 0);
    
    // Most used tone
    const toneCounts: Record<string, number> = {};
    userClips.forEach(c => {
      if (c.tone) {
        toneCounts[c.tone] = (toneCounts[c.tone] || 0) + 1;
      }
    });
    let topTone = "funny";
    let maxCount = 0;
    Object.entries(toneCounts).forEach(([tone, count]) => {
      if (count > maxCount) {
        maxCount = count;
        topTone = tone;
      }
    });

    const rootPosts = userClips.filter(c => c.parentId === null).length;
    const reactions = userClips.filter(c => c.parentId !== null).length;

    // Earliest post date
    const earliest = userClips.length > 0 
      ? new Date(Math.min(...userClips.map(c => new Date(c.createdAt).getTime())))
      : null;

    return {
      totalClips,
      totalLikes,
      totalLaughs,
      topTone,
      rootPosts,
      reactions,
      earliest
    };
  }, [userClips]);

  // Filtered list based on active tab
  const filteredClips = useMemo(() => {
    if (filterTab === "roots") {
      return userClips.filter(c => c.parentId === null);
    }
    if (filterTab === "replies") {
      return userClips.filter(c => c.parentId !== null);
    }
    return userClips;
  }, [userClips, filterTab]);

  if (!isOpen || !username) return null;

  const isGuest = cleanTarget.startsWith("~") || targetLower === "guest";

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-md">
        <motion.div
          initial={{ opacity: 0, scale: 0.96, y: 12 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: 12 }}
          transition={{ duration: 0.2, ease: "easeOut" }}
          className="bg-slate-900 border border-slate-800 rounded-2xl sm:rounded-3xl max-w-2xl w-full max-h-[90vh] flex flex-col shadow-2xl overflow-hidden"
        >
          {/* Header Banner */}
          <div className="relative bg-gradient-to-r from-indigo-950 via-slate-900 to-slate-950 p-5 sm:p-6 border-b border-slate-800">
            <button
              onClick={onClose}
              className="absolute top-4 right-4 p-2 text-slate-400 hover:text-white bg-slate-800/60 hover:bg-slate-800 rounded-full transition-colors cursor-pointer"
              title="Close"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="flex items-center gap-4">
              {/* User Avatar Initial */}
              <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 text-white font-bold font-mono text-xl sm:text-2xl flex items-center justify-center shadow-lg border-2 border-indigo-400/30 flex-shrink-0">
                {cleanTarget[0]?.toUpperCase() || "U"}
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className="text-lg sm:text-xl font-bold text-white font-sans truncate">
                    @{cleanTarget}
                  </h2>
                  {isGuest ? (
                    <span className="text-[10px] px-2 py-0.5 bg-slate-800 border border-slate-700 rounded-full text-slate-400 font-mono font-bold">
                      GUEST
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 bg-emerald-500/15 border border-emerald-500/30 rounded-full text-emerald-400 font-mono font-bold">
                      <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-pulse" />
                      MEMBER
                    </span>
                  )}
                </div>

                <p className="text-xs text-slate-400 mt-1 flex items-center gap-2">
                  <span>Community Creator</span>
                  {stats.earliest && (
                    <>
                      <span>•</span>
                      <span className="text-[11px] text-slate-500 font-mono">
                        Active since {stats.earliest.toLocaleDateString([], { month: "short", year: "numeric" })}
                      </span>
                    </>
                  )}
                </p>
              </div>
            </div>

            {/* Quick Metrics Bar */}
            <div className="grid grid-cols-3 gap-2 mt-4 pt-4 border-t border-slate-800/80 text-center">
              <div className="bg-slate-900/60 border border-slate-800/80 rounded-xl p-2">
                <span className="block text-base sm:text-lg font-bold text-white font-mono">
                  {stats.totalClips}
                </span>
                <span className="text-[10px] font-mono text-slate-400 uppercase tracking-wider">
                  Reactions
                </span>
              </div>
              <div className="bg-slate-900/60 border border-slate-800/80 rounded-xl p-2">
                <span className="block text-base sm:text-lg font-bold text-rose-400 font-mono">
                  {stats.totalLikes}
                </span>
                <span className="text-[10px] font-mono text-slate-400 uppercase tracking-wider">
                  Likes
                </span>
              </div>
              <div className="bg-slate-900/60 border border-slate-800/80 rounded-xl p-2">
                <span className="block text-base sm:text-lg font-bold text-amber-400 font-mono">
                  {stats.topTone === "funny" ? "🎭 Funny" :
                   stats.topTone === "dramatic" ? "🎬 Drama" :
                   stats.topTone === "sarcastic" ? "🙄 Sarcasm" :
                   stats.topTone === "chill" ? "🌊 Chill" : "⚡ Chaos"}
                </span>
                <span className="text-[10px] font-mono text-slate-400 uppercase tracking-wider">
                  Top Tone
                </span>
              </div>
            </div>
          </div>

          {/* Sub-Tabs: All / Threads / Reactions */}
          <div className="flex items-center gap-2 px-5 py-3 border-b border-slate-800 bg-slate-950/40 text-xs font-mono">
            <button
              onClick={() => setFilterTab("all")}
              className={`px-3 py-1.5 rounded-lg transition-colors cursor-pointer ${
                filterTab === "all"
                  ? "bg-indigo-600 text-white font-bold"
                  : "text-slate-400 hover:text-white hover:bg-slate-800"
              }`}
            >
              All ({stats.totalClips})
            </button>
            <button
              onClick={() => setFilterTab("roots")}
              className={`px-3 py-1.5 rounded-lg transition-colors cursor-pointer ${
                filterTab === "roots"
                  ? "bg-indigo-600 text-white font-bold"
                  : "text-slate-400 hover:text-white hover:bg-slate-800"
              }`}
            >
              Loops ({stats.rootPosts})
            </button>
            <button
              onClick={() => setFilterTab("replies")}
              className={`px-3 py-1.5 rounded-lg transition-colors cursor-pointer ${
                filterTab === "replies"
                  ? "bg-indigo-600 text-white font-bold"
                  : "text-slate-400 hover:text-white hover:bg-slate-800"
              }`}
            >
              Reactions ({stats.reactions})
            </button>
          </div>

          {/* Clips List / Grid */}
          <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-3">
            {filteredClips.length === 0 ? (
              <div className="text-center py-12 space-y-2 text-slate-500">
                <Film className="w-8 h-8 mx-auto opacity-40 text-slate-400" />
                <p className="text-xs">No reactions found in this category.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {filteredClips.map((clip) => {
                  const isVideo = clip.mediaUrl.endsWith(".mp4") || clip.mediaUrl.endsWith(".webm") || clip.mediaUrl.includes("mixkit-");
                  const hasVoice = Boolean(clip.voiceAudioUrl || clip.voiceAudioData || clip.mediaType === "audio");
                  const isReply = clip.parentId !== null;
                  const parentClip = isReply ? allClips.find(c => c.id === clip.parentId) : null;

                  return (
                    <div
                      key={clip.id}
                      className="bg-slate-950/60 border border-slate-800/80 hover:border-indigo-500/50 rounded-2xl p-3 flex flex-col justify-between gap-2.5 transition-all hover:bg-slate-950 group"
                    >
                      {/* Media Preview & Badges */}
                      <div 
                        onClick={() => {
                          onClose();
                          onSelectClip(clip.id);
                        }}
                        className="w-full aspect-video rounded-xl bg-slate-900 overflow-hidden relative border border-slate-800/80 cursor-pointer"
                      >
                        {isVideo ? (
                          <video src={clip.mediaUrl} className="w-full h-full object-cover" muted playsInline />
                        ) : (
                          <img src={clip.mediaUrl} className="w-full h-full object-cover" alt="" referrerPolicy="no-referrer" />
                        )}

                        {/* Tone Badge */}
                        <div className="absolute top-2 left-2 px-1.5 py-0.5 bg-black/70 backdrop-blur-md rounded text-[8px] font-mono uppercase text-white font-bold border border-white/10">
                          {clip.tone}
                        </div>

                        {/* Voice indicator */}
                        {hasVoice && (
                          <div className="absolute top-2 right-2 px-1.5 py-0.5 bg-emerald-950/80 backdrop-blur-md rounded text-[8px] font-mono text-emerald-300 font-bold border border-emerald-500/30 flex items-center gap-1">
                            <Mic className="w-2.5 h-2.5" />
                            <span>Voice</span>
                          </div>
                        )}

                        {/* Play Hover Overlay */}
                        <div className="absolute inset-0 bg-indigo-950/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                          <span className="px-2.5 py-1 rounded-lg bg-indigo-600 text-white text-[11px] font-mono font-bold shadow-lg flex items-center gap-1">
                            <span>Open Thread</span>
                            <ChevronRight className="w-3 h-3" />
                          </span>
                        </div>
                      </div>

                      {/* Content details */}
                      <div className="space-y-1 min-w-0">
                        {isReply && (
                          <p className="text-[10px] font-mono text-indigo-400/90 truncate flex items-center gap-1">
                            <CornerDownRight className="w-2.5 h-2.5" />
                            <span>Replying to {parentClip ? `@${parentClip.authorName}` : "reaction"}</span>
                          </p>
                        )}

                        {(clip.overlayText || clip.voiceText) && (
                          <p className="text-xs text-slate-200 line-clamp-2 italic">
                            "{clip.overlayText || (clip.voiceText && !clip.voiceText.startsWith("audio_url:") ? clip.voiceText : "Visual reaction")}"
                          </p>
                        )}

                        <div className="flex items-center justify-between pt-1 text-[10px] font-mono text-slate-500 border-t border-slate-900">
                          <div className="flex items-center gap-2 text-slate-400">
                            <span className="flex items-center gap-1">
                              <Heart className="w-3 h-3 text-rose-500 fill-rose-500/20" />
                              {clip.likesCount || 0}
                            </span>
                            <span>•</span>
                            <span>{new Date(clip.createdAt).toLocaleDateString([], { month: "short", day: "numeric" })}</span>
                          </div>

                          <button
                            onClick={() => {
                              onClose();
                              onSelectClip(clip.id);
                            }}
                            className="text-indigo-400 hover:text-indigo-300 font-bold hover:underline flex items-center gap-0.5 cursor-pointer"
                          >
                            <span>View</span>
                            <ChevronRight className="w-2.5 h-2.5" />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Footer Notice */}
          <div className="p-3 bg-slate-950/80 border-t border-slate-800/80 text-center">
            <p className="text-[10px] font-mono text-slate-500">
              Only public screen names and reactions are visible. User emails and private account data are never displayed.
            </p>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
