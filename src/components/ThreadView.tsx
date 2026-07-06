import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { 
  X, Heart, Volume2, Plus, ChevronRight, ArrowLeft, Sparkles, 
  CornerDownRight, Play, Pause, VolumeX, Volume1, Star
} from "lucide-react";
import { Clip, SavedReaction } from "../types";
import { speakText } from "../utils/audio";
import { generateUniqueId, loadAndSanitizeReactions, detectDuplicateIds } from "../utils/keyUtils";

interface ThreadViewProps {
  key?: string;
  rootClipId: string;
  clips: Clip[];
  onClose: () => void;
  onLike: (id: string) => void;
  onRespond: (clip: Clip) => void;
  onRespondWithTone: (clip: Clip, tone: Clip["tone"]) => void;
  onRespondWithSaved?: (clip: Clip, reax: SavedReaction) => void;
}

export default function ThreadView({ 
  rootClipId, 
  clips, 
  onClose, 
  onLike, 
  onRespond, 
  onRespondWithTone,
  onRespondWithSaved
}: ThreadViewProps) {
  
  // Find ultimate root of this conversation tree
  const getUltimateRootClip = (): Clip | undefined => {
    const target = clips.find(c => c.id === rootClipId);
    if (!target) return undefined;
    let current = target;
    while (current.parentId !== null) {
      const parent = clips.find(c => c.id === current.parentId);
      if (!parent) break;
      current = parent;
    }
    return current;
  };

  const ultimateRoot = getUltimateRootClip();

  // Traversal State - start at the ultimate root of the conversation
  const [focusedClipId, setFocusedClipId] = useState<string>(() => {
    return ultimateRoot?.id || rootClipId;
  });

  // Track video state for focused card
  const [isPlaying, setIsPlaying] = useState(true);
  const [isMuted, setIsMuted] = useState(true);
  const videoRef = React.useRef<HTMLVideoElement | null>(null);

  // Sync focused clip changes
  const focusedClip = clips.find(c => c.id === focusedClipId);

  // Saved state sync
  const [isSaved, setIsSaved] = useState(false);
  const [showSavedFastPick, setShowSavedFastPick] = useState(false);
  const [savedReactions, setSavedReactions] = useState<SavedReaction[]>([]);

  // Load saved list
  const loadSavedList = () => {
    const sanitized = loadAndSanitizeReactions();
    setSavedReactions(sanitized);
  };

  useEffect(() => {
    loadSavedList();
    window.addEventListener("reax_saved_changed", loadSavedList);
    return () => window.removeEventListener("reax_saved_changed", loadSavedList);
  }, []);

  useEffect(() => {
    if (!focusedClip) return;
    try {
      const saved = JSON.parse(localStorage.getItem("reax_saved_reactions") || "[]");
      const exists = saved.some((item: any) => 
        item.mediaUrl === focusedClip.mediaUrl && 
        item.voiceText === focusedClip.voiceText && 
        item.overlayText === focusedClip.overlayText
      );
      setIsSaved(exists);
    } catch (err) {
      console.error(err);
    }
  }, [focusedClip, focusedClipId]);

  const toggleSave = () => {
    if (!focusedClip) return;
    try {
      const saved = JSON.parse(localStorage.getItem("reax_saved_reactions") || "[]");
      let nextSaved;
      if (isSaved) {
        // Remove
        nextSaved = saved.filter((item: any) => 
          !(item.mediaUrl === focusedClip.mediaUrl && 
            item.voiceText === focusedClip.voiceText && 
            item.overlayText === focusedClip.overlayText)
        );
        setIsSaved(false);
        window.dispatchEvent(new CustomEvent("reax_toast", { detail: { message: "Removed from Saved Vault" } }));
      } else {
        // Add
        const newSaved = {
          id: generateUniqueId("saved"),
          mediaUrl: focusedClip.mediaUrl,
          voiceText: focusedClip.voiceText,
          overlayText: focusedClip.overlayText,
          tone: focusedClip.tone,
          effect: focusedClip.effect || "zoom",
          authorName: focusedClip.authorName,
          savedAt: Date.now()
        };
        nextSaved = [...saved, newSaved];
        setIsSaved(true);
        window.dispatchEvent(new CustomEvent("reax_toast", { detail: { message: "⭐ Saved to your Reactions" } }));
        
        const logged = localStorage.getItem("reax_is_logged_in") === "true";
        if (!logged) {
          setTimeout(() => {
            window.dispatchEvent(new CustomEvent("reax_upgrade_trigger", { detail: { reason: "save_reaction" } }));
          }, 1000);
        }
      }
      localStorage.setItem("reax_saved_reactions", JSON.stringify(nextSaved));
      window.dispatchEvent(new Event("reax_saved_changed"));
    } catch (err) {
      console.error(err);
    }
  };

  // If focused clip is deleted or not found, fallback to rootClipId
  useEffect(() => {
    if (!focusedClip && ultimateRoot) {
      setFocusedClipId(ultimateRoot.id);
    }
  }, [focusedClipId, clips, focusedClip, ultimateRoot]);

  // Recursively compute total replies under any clip
  const getChainCount = (clipId: string): number => {
    let count = 0;
    const direct = clips.filter(c => c.parentId === clipId);
    count += direct.length;
    direct.forEach(child => {
      count += getChainCount(child.id);
    });
    return count;
  };

  // Score momentum of a reaction branch
  const getMomentumScore = (clip: Clip): number => {
    const likesScore = clip.likesCount * 3;
    const recursiveCount = getChainCount(clip.id);
    const depthScore = recursiveCount * 6;
    const ageInHours = (Date.now() - new Date(clip.createdAt).getTime()) / (1000 * 60 * 60);
    const recencyScore = ageInHours < 2 ? 15 : (ageInHours < 24 ? 8 : 0);
    return likesScore + depthScore + recencyScore;
  };

  // Find direct replies of current focused node, sorted by momentum
  const directReplies = focusedClip 
    ? clips.filter(c => c.parentId === focusedClip.id)
    : [];
  const sortedReplies = [...directReplies].sort((a, b) => getMomentumScore(b) - getMomentumScore(a));

  // Compute navigation path from ultimate root to current focused clip
  const getNavigationPath = (): Clip[] => {
    if (!focusedClip) return [];
    const path: Clip[] = [];
    let current: Clip | undefined = focusedClip;
    while (current) {
      path.unshift(current);
      if (!current.parentId) break;
      current = clips.find(c => c.id === current.parentId);
    }
    return path;
  };

  const navPath = getNavigationPath();

  // Sound & play handlers for focused card
  const togglePlay = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (videoRef.current) {
      if (isPlaying) {
        videoRef.current.pause();
      } else {
        videoRef.current.play();
      }
      setIsPlaying(!isPlaying);
    }
  };

  const toggleMute = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsMuted(!isMuted);
  };

  if (!focusedClip) return null;

  const totalInChain = ultimateRoot ? getChainCount(ultimateRoot.id) + 1 : 0;
  const isVideo = focusedClip.mediaUrl.endsWith(".mp4") || focusedClip.mediaUrl.endsWith(".webm") || focusedClip.mediaUrl.includes("mixkit-");

  return (
    <div className="fixed inset-0 z-40 bg-black/80 backdrop-blur-md overflow-y-auto p-4 md:p-8 flex items-center justify-center">
      <div className="w-full max-w-2xl bg-[#08090c]/90 backdrop-blur-xl border border-slate-800/40 rounded-3xl p-5 md:p-6 relative flex flex-col max-h-[92vh] shadow-[0_24px_64px_rgba(0,0,0,0.6)] overflow-hidden">
        
        {/* Modal Top Header Bar */}
        <div className="flex items-center justify-between border-b border-slate-800/80 pb-3 flex-shrink-0">
          <div>
            <span className="text-[9px] font-mono font-black tracking-widest text-indigo-400 uppercase">
              ⚡ ACTIVE CASCADE EXPLORER
            </span>
            <h3 className="text-base font-sans font-black text-white leading-tight uppercase flex items-center gap-1.5 mt-0.5">
              <span>Reaction Branches</span> 
              <span className="text-[10px] bg-indigo-500/10 border border-indigo-500/20 text-indigo-300 font-mono px-1.5 py-0.5 rounded font-bold">
                {totalInChain} TOTAL
              </span>
            </h3>
          </div>
          <button 
            onClick={onClose}
            className="p-1.5 hover:bg-slate-800 rounded-full transition-colors text-slate-400 hover:text-white"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Dynamic Interactive Breadcrumbs path */}
        <div className="py-2.5 px-3 bg-slate-950/50 border-b border-slate-800/50 flex-shrink-0 -mx-6 flex items-center gap-1 overflow-x-auto text-xs font-mono scrollbar-none">
          <span className="text-slate-500 font-bold uppercase text-[9px] mr-1">PATHWAY:</span>
          {navPath.map((node, i) => (
            <React.Fragment key={`nav-${node.id}`}>
              {i > 0 && <ChevronRight className="w-3 h-3 text-slate-600 flex-shrink-0" />}
              <button
                onClick={() => setFocusedClipId(node.id)}
                className={`flex items-center gap-1 px-2 py-0.5 rounded transition-all flex-shrink-0 ${
                  node.id === focusedClipId 
                    ? "bg-indigo-600/20 border border-indigo-500/30 text-indigo-300 font-black" 
                    : "text-slate-400 hover:text-slate-200 border border-transparent"
                }`}
              >
                <span>@{node.authorName}</span>
                <span className="text-[9px] opacity-80">
                  {node.tone === "funny" ? "🎭" :
                   node.tone === "dramatic" ? "🎬" :
                   node.tone === "sarcastic" ? "🙄" :
                   node.tone === "chill" ? "🌊" : "⚡"}
                </span>
              </button>
            </React.Fragment>
          ))}
        </div>

        {/* Scrollable Traversal Stage */}
        <div className="flex-1 overflow-y-auto pr-1 space-y-5 py-4">
          
          {/* Back button wrapper if not ultimate root */}
          {focusedClip.parentId && (
            <button
              onClick={() => {
                const parent = clips.find(c => c.id === focusedClip.parentId);
                if (parent) setFocusedClipId(parent.id);
              }}
              className="inline-flex items-center gap-1.5 text-[10px] font-mono font-black text-indigo-400 hover:text-indigo-300 transition-colors uppercase bg-indigo-500/5 border border-indigo-500/10 px-2.5 py-1 rounded-lg"
            >
              <ArrowLeft className="w-3 h-3" /> Go Back to @{clips.find(c => c.id === focusedClip.parentId)?.authorName}
            </button>
          )}

          {/* FOCUSED CARD (With sleek hidden controls on hover) */}
          <div className="w-full max-w-xl mx-auto bg-slate-900/60 border border-indigo-500/40 rounded-2xl p-4 shadow-lg relative group/media-focused transition-all">
            
            {/* Header Meta of focused clip */}
            <div className="flex justify-between items-center mb-3">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 bg-indigo-500/10 text-indigo-400 rounded-full flex items-center justify-center font-mono font-bold text-xs">
                  {focusedClip.authorName[0]?.toUpperCase()}
                </div>
                <div>
                  <div className="flex items-center gap-1.5">
                    <span className="font-semibold text-xs text-slate-200 block">@{focusedClip.authorName}</span>
                    {focusedClip.authorName.startsWith("~") ? (
                      <span className="text-[8px] px-1 bg-slate-950/60 border border-slate-800 rounded text-slate-500 font-bold font-mono uppercase">Guest</span>
                    ) : (
                      <span className="w-2 h-2 bg-emerald-500/20 border border-emerald-500/40 rounded-full flex items-center justify-center" title="Verified Member">
                        <span className="w-0.5 h-0.5 bg-emerald-400 rounded-full" />
                      </span>
                    )}
                  </div>
                  <span className="text-[9px] text-slate-500 block font-mono">
                    {new Date(focusedClip.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-1.5">
                <span className={`px-2 py-0.5 rounded text-[9px] font-mono tracking-wider font-semibold capitalize ${
                  focusedClip.tone === "funny" ? "bg-amber-500/10 text-amber-400 border border-amber-500/20" :
                  focusedClip.tone === "dramatic" ? "bg-rose-500/10 text-rose-400 border border-rose-500/20" :
                  focusedClip.tone === "sarcastic" ? "bg-purple-500/10 text-purple-400 border border-purple-500/20" :
                  focusedClip.tone === "chill" ? "bg-sky-500/10 text-sky-400 border border-sky-500/20" :
                  "bg-orange-500/10 text-orange-400 border border-orange-500/20"
                }`}>
                  {focusedClip.tone}
                </span>
              </div>
            </div>

            {/* Focused Card Media - Minimalist by default, controls on hover */}
            <div className="relative aspect-video rounded-xl bg-black overflow-hidden flex items-center justify-center border border-slate-900 shadow-md">
              <div className={`w-full h-full overflow-hidden flex items-center justify-center ${
                focusedClip.effect === "zoom" ? "animate-zoom" :
                focusedClip.effect === "pan" ? "animate-pan" :
                focusedClip.effect === "bounce" ? "animate-bounce-subtle" :
                focusedClip.effect === "pulse" ? "animate-pulse-subtle" :
                focusedClip.effect === "shake" ? "animate-shake-chaotic" :
                focusedClip.effect === "glitch" ? "animate-glitch" : "animate-zoom"
              }`}>
                {isVideo ? (
                  <video 
                    ref={videoRef}
                    src={focusedClip.mediaUrl} 
                    className="w-full h-full object-cover"
                    autoPlay 
                    loop 
                    muted={isMuted}
                    playsInline
                  />
                ) : (
                  <img 
                    src={focusedClip.mediaUrl} 
                    className="w-full h-full object-cover" 
                    alt=""
                  />
                )}
              </div>

              {focusedClip.overlayText && (
                <div className="absolute inset-0 bg-gradient-to-t from-black/55 via-transparent to-transparent flex items-center justify-center p-3">
                  <h2 className="font-sans font-black text-lg md:text-xl text-white text-center tracking-wider drop-shadow-[0_1.5px_3.5px_rgba(0,0,0,0.85)] uppercase">
                    {focusedClip.overlayText}
                  </h2>
                </div>
              )}

              {/* Mute & Play Controls - Only visible on hover */}
              {isVideo && (
                <div className="absolute bottom-3 right-3 flex items-center gap-1.5 opacity-0 group-hover/media-focused:opacity-100 transition-opacity bg-black/60 backdrop-blur px-2 py-0.5 rounded-lg border border-slate-800/60 z-10">
                  <button 
                    onClick={togglePlay}
                    className="p-1 hover:text-white text-slate-300 transition-colors"
                  >
                    {isPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                  </button>
                  <div className="w-[1px] h-3.5 bg-slate-700" />
                  <button 
                    onClick={toggleMute}
                    className="p-1 hover:text-white text-slate-300 transition-colors"
                  >
                    {isMuted ? <VolumeX className="w-3.5 h-3.5" /> : <Volume1 className="w-3.5 h-3.5" />}
                  </button>
                </div>
              )}

              {/* Focused Caption - Only visible on hover */}
              {focusedClip.voiceText && (
                <div className="absolute bottom-3 left-3 flex items-center gap-1 bg-black/60 backdrop-blur px-2 py-1 rounded-lg border border-slate-800/60 max-w-[70%] opacity-0 group-hover/media-focused:opacity-100 transition-opacity duration-200 z-10">
                  <button 
                    onClick={(e) => {
                      e.stopPropagation();
                      speakText(focusedClip.voiceText || "", focusedClip.tone);
                    }}
                    className="p-0.5 text-slate-300 hover:text-indigo-400 transition-colors"
                  >
                    <Volume2 className="w-3 h-3 text-indigo-400" />
                  </button>
                  <span className="text-[9px] text-slate-200 italic truncate font-sans">
                    "{focusedClip.voiceText}"
                  </span>
                </div>
              )}
            </div>

            {/* Primary Engagement Row */}
            <div className="flex items-center justify-between mt-3 pt-3 border-t border-slate-800/60">
              <div className="flex items-center gap-4">
                <button 
                  onClick={() => onLike(focusedClip.id)}
                  className="flex items-center gap-1.5 text-slate-400 hover:text-rose-400 transition-colors"
                >
                  <Heart className="w-4 h-4 fill-transparent hover:fill-rose-400" />
                  <span className="text-xs font-mono font-bold">{focusedClip.likesCount}</span>
                </button>

                <button 
                  onClick={toggleSave}
                  className={`flex items-center gap-1 text-xs font-mono transition-colors ${
                    isSaved ? "text-amber-400 font-bold" : "text-slate-400 hover:text-amber-400"
                  }`}
                  title={isSaved ? "Remove from my Reactions" : "Save to my Reactions"}
                >
                  <Star className={`w-4 h-4 ${isSaved ? "fill-amber-400 text-amber-400" : "text-slate-400"}`} />
                  <span>{isSaved ? "Saved" : "Save"}</span>
                </button>
              </div>

              <button 
                onClick={() => onRespond(focusedClip)}
                className="inline-flex items-center gap-1 px-3 py-1 bg-indigo-600/10 hover:bg-indigo-600 border border-indigo-500/20 hover:border-indigo-500 text-indigo-400 hover:text-white text-[10px] font-mono font-black uppercase rounded-lg transition-all"
              >
                <Plus className="w-3 h-3" /> React to this branch
              </button>
            </div>

            {/* Direct Quick-Tap reaction options right inside the focus node */}
            <div className="mt-3.5 bg-slate-950/25 p-3 border border-slate-800/80 rounded-xl shadow-inner">
              <span className="block text-[10px] font-mono font-black text-amber-400 tracking-wider uppercase mb-2 text-center sm:text-left">
                ⚡ TAP A TONE TO REACT:
              </span>
              <div className="grid grid-cols-6 gap-2">
                {[
                  { id: "funny" as const, emoji: "🎭", label: "Funny", color: "hover:bg-amber-500/10 text-amber-400 border-amber-500/15 hover:border-amber-400 hover:shadow-[0_0_12px_rgba(245,158,11,0.25)]" },
                  { id: "dramatic" as const, emoji: "🎬", label: "Drama", color: "hover:bg-rose-500/10 text-rose-400 border-rose-500/15 hover:border-rose-400 hover:shadow-[0_0_12px_rgba(244,63,94,0.25)]" },
                  { id: "sarcastic" as const, emoji: "🙄", label: "Sarcasm", color: "hover:bg-purple-500/10 text-purple-400 border-purple-500/15 hover:border-purple-400 hover:shadow-[0_0_12px_rgba(168,85,247,0.25)]" },
                  { id: "chill" as const, emoji: "🌊", label: "Chill", color: "hover:bg-sky-500/10 text-sky-400 border-sky-500/15 hover:border-sky-400 hover:shadow-[0_0_12px_rgba(14,165,233,0.25)]" },
                  { id: "chaotic" as const, emoji: "⚡", label: "Chaos", color: "hover:bg-orange-500/10 text-orange-400 border-orange-500/15 hover:border-orange-400 hover:shadow-[0_0_12px_rgba(249,115,22,0.25)]" }
                ].map((item) => (
                  <button
                    key={item.id}
                    onClick={() => onRespondWithTone(focusedClip, item.id)}
                    className={`flex flex-col items-center justify-center py-2.5 px-1 bg-slate-900/95 border rounded-lg transition-all hover:scale-[1.04] active:scale-95 ${item.color} cursor-pointer`}
                  >
                    <span className="text-base">{item.emoji}</span>
                    <span className="text-[8px] font-bold text-slate-300 mt-1">{item.label}</span>
                  </button>
                ))}

                {/* 6th Option: SAVED ⭐ */}
                <button
                  onClick={() => setShowSavedFastPick(!showSavedFastPick)}
                  className={`flex flex-col items-center justify-center py-2.5 px-1 bg-slate-900/95 border rounded-lg transition-all hover:scale-[1.04] active:scale-95 cursor-pointer ${
                    showSavedFastPick 
                      ? "border-amber-400 bg-amber-500/10 text-amber-400 shadow-[0_0_12px_rgba(245,158,11,0.25)]" 
                      : "border-slate-800 hover:border-amber-400 text-amber-400 hover:shadow-[0_0_12px_rgba(245,158,11,0.2)]"
                  }`}
                >
                  <span className="text-base">⭐</span>
                  <span className="text-[8px] font-bold mt-1">Saved</span>
                </button>
              </div>

              {/* SAVED REACTIONS QUICK TRAY SELECTOR */}
              <AnimatePresence>
                {showSavedFastPick && (
                  <motion.div
                    key="saved-fast-pick-tray"
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="overflow-hidden"
                  >
                    <div className="pt-3.5 mt-3 border-t border-slate-800/60 space-y-2">
                      <div className="flex justify-between items-center px-1">
                        <span className="text-[9px] font-mono font-black text-amber-400 uppercase tracking-widest">
                          ⭐ SELECT A SAVED REACTION TO REPLY INSTANTLY:
                        </span>
                        <span className="text-[8px] text-slate-500 font-mono">
                          {savedReactions.length} AVAILABLE
                        </span>
                      </div>

                      {savedReactions.length === 0 ? (
                        <div className="bg-slate-950/40 p-3 rounded-lg border border-slate-900 text-center py-4">
                          <p className="text-[10px] text-slate-500">Your vault is empty.</p>
                          <p className="text-[9px] text-slate-600">Save reactions from the feed or respondent flow to see them here!</p>
                        </div>
                      ) : (
                        <div className="flex gap-2 overflow-x-auto pb-1.5 pt-0.5 scrollbar-thin scrollbar-thumb-slate-800 scrollbar-track-transparent">
                          {savedReactions.map((reax) => {
                            const isVideo = reax.mediaUrl.endsWith(".mp4") || reax.mediaUrl.endsWith(".webm") || reax.mediaUrl.includes("mixkit-");
                            return (
                              <button
                                key={`thread-${focusedClip.id}-reax-${reax.id}`}
                                onClick={() => {
                                  if (onRespondWithSaved) {
                                    onRespondWithSaved(focusedClip, reax);
                                    setShowSavedFastPick(false);
                                  }
                                }}
                                className="flex-shrink-0 w-28 bg-slate-950/90 border border-slate-800 hover:border-amber-400 rounded-xl overflow-hidden text-left p-1.5 transition-all group active:scale-95 shadow-md hover:shadow-amber-500/5"
                              >
                                <div className="aspect-video w-full rounded-lg bg-slate-900 overflow-hidden relative mb-1">
                                  {isVideo ? (
                                    <video src={reax.mediaUrl} className="w-full h-full object-cover" muted playsInline />
                                  ) : (
                                    <img src={reax.mediaUrl} className="w-full h-full object-cover" alt="" referrerPolicy="no-referrer" />
                                  )}
                                  <div className="absolute top-1 right-1 px-1 bg-black/60 rounded text-[7px] font-mono uppercase text-indigo-300 font-bold">
                                    {reax.tone}
                                  </div>
                                </div>
                                <p className="text-[8px] font-mono font-bold text-slate-400 truncate uppercase tracking-wide group-hover:text-amber-400">
                                  {reax.overlayText || "NO CAPTION"}
                                </p>
                                <p className="text-[7px] text-slate-600 truncate italic">
                                  "{reax.voiceText || "No audio"}"
                                </p>
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

          </div>

          {/* ⚡ CHOOSE REACTION DIRECTION / BRANCHING PATHWAYS */}
          <div className="space-y-4 pt-2">
            <div className="flex items-center justify-between px-1">
              <div className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-ping" />
                <span className="text-[10px] font-mono font-black text-slate-300 uppercase tracking-widest">
                  🔥 CHOOSE A PATHWAY ({sortedReplies.length} reactions)
                </span>
              </div>
            </div>

            {/* 🔥 Recommended: Top reactions under this branch */}
            {sortedReplies.length > 0 && (
              <div className="bg-slate-950/30 p-3 rounded-2xl border border-slate-900 space-y-2.5">
                <span className="block text-[10px] font-mono font-black text-rose-400 uppercase tracking-widest px-1">
                  🔥 Top reactions under this branch
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  {sortedReplies.slice(0, 3).map((reply) => {
                    const isVideo = reply.mediaUrl.endsWith(".mp4") || reply.mediaUrl.endsWith(".webm") || reply.mediaUrl.includes("mixkit-");
                    return (
                      <div
                        key={`top-${reply.id}`}
                        onClick={() => setFocusedClipId(reply.id)}
                        className="bg-slate-900/90 border border-slate-800/80 hover:border-rose-500/50 rounded-xl p-2.5 cursor-pointer flex flex-row sm:flex-col gap-2.5 items-center sm:items-stretch group hover:bg-slate-900 transition-all active:scale-[0.98] shadow-sm hover:shadow-[0_0_10px_rgba(244,63,94,0.15)]"
                      >
                        <div className="w-14 sm:w-full aspect-video rounded-lg bg-slate-950 overflow-hidden relative border border-slate-800 flex-shrink-0">
                          {isVideo ? (
                            <video src={reply.mediaUrl} className="w-full h-full object-cover" muted playsInline />
                          ) : (
                            <img src={reply.mediaUrl} className="w-full h-full object-cover" alt="" referrerPolicy="no-referrer" />
                          )}
                          <div className="absolute top-1 right-1 px-1 py-0.2 bg-black/60 rounded text-[7px] font-mono uppercase text-rose-300 font-bold border border-rose-500/20">
                            {reply.tone}
                          </div>
                        </div>
                        <div className="flex-1 min-w-0 sm:mt-1">
                          <p className="text-[10px] font-bold text-slate-200 truncate">@{reply.authorName}</p>
                          <p className="text-[9px] text-slate-400 italic line-clamp-1 mt-0.5 leading-none">
                            "{reply.overlayText || reply.voiceText || "Visual reaction"}"
                          </p>
                          <p className="text-[8px] font-mono text-rose-400 mt-1 flex items-center gap-0.5">
                            ❤️ {reply.likesCount}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {sortedReplies.length > 0 ? (
              <div className="space-y-4">
                {/* 1. 🔥 LEADING PATHWAY (Best Reply) */}
                {sortedReplies[0] && (
                  <div className="space-y-2">
                    <span className="text-[9px] font-mono font-black text-rose-400 uppercase tracking-wider block px-1">
                      👑 LEADING PATHWAY (Best Reply)
                    </span>
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      onClick={() => setFocusedClipId(sortedReplies[0].id)}
                      className="bg-gradient-to-r from-rose-950/20 to-indigo-950/25 border border-rose-500/40 hover:border-rose-400 rounded-2xl p-4 flex flex-col sm:flex-row gap-4 cursor-pointer group hover:from-rose-950/30 transition-all duration-300 relative overflow-hidden shadow-md"
                    >
                      {/* High momentum background glow */}
                      <div className="absolute top-0 right-0 w-24 h-24 bg-rose-500/5 rounded-full blur-xl pointer-events-none" />
                      
                      <div className="w-full sm:w-28 aspect-video sm:aspect-square rounded-xl bg-slate-900 overflow-hidden flex-shrink-0 relative border border-rose-500/20">
                        {sortedReplies[0].mediaUrl.endsWith(".mp4") || sortedReplies[0].mediaUrl.endsWith(".webm") || sortedReplies[0].mediaUrl.includes("mixkit-") ? (
                          <video src={sortedReplies[0].mediaUrl} className="w-full h-full object-cover" muted playsInline />
                        ) : (
                          <img src={sortedReplies[0].mediaUrl} className="w-full h-full object-cover" alt="" referrerPolicy="no-referrer" />
                        )}
                        {sortedReplies[0].overlayText && (
                          <div className="absolute inset-0 bg-black/40 flex items-center justify-center p-1.5 text-center">
                            <span className="text-[9px] font-sans font-black text-white uppercase tracking-wider line-clamp-2">
                              {sortedReplies[0].overlayText}
                            </span>
                          </div>
                        )}
                      </div>

                      <div className="flex-1 flex flex-col justify-between">
                        <div>
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-xs text-white font-black">@{sortedReplies[0].authorName}</span>
                            <span className="px-2 py-0.5 rounded text-[8px] font-mono bg-rose-500/25 text-rose-300 border border-rose-500/30 uppercase tracking-wider">
                              {sortedReplies[0].tone}
                            </span>
                          </div>
                          {sortedReplies[0].voiceText && (
                            <p className="text-xs text-slate-300 italic font-sans leading-tight mt-1">
                              "{sortedReplies[0].voiceText}"
                            </p>
                          )}
                        </div>

                        <div className="flex items-center justify-between text-[10px] font-mono text-slate-400 pt-3 border-t border-slate-900 mt-2">
                          <span className="flex items-center gap-1 font-bold text-rose-400">
                            <Heart className="w-3.5 h-3.5 fill-rose-500/20 text-rose-400" />
                            {sortedReplies[0].likesCount} likes
                          </span>
                          <span className="text-indigo-400 group-hover:translate-x-1 transition-transform flex items-center gap-0.5 font-black">
                            <span>EXPLORE CASCADE ➔</span>
                          </span>
                        </div>
                      </div>
                    </motion.div>
                  </div>
                )}

                {/* 2. ✨ ALTERNATIVE PATHWAYS (Other Replies) */}
                {sortedReplies.length > 1 && (
                  <div className="space-y-2">
                    <span className="text-[9px] font-mono font-black text-indigo-400 uppercase tracking-wider block px-1">
                      ✨ ALTERNATIVE PATHWAYS ({sortedReplies.length - 1})
                    </span>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <AnimatePresence mode="popLayout">
                        {sortedReplies.slice(1).map((reply, index) => {
                          const childRepliesCount = getChainCount(reply.id);
                          return (
                            <motion.div
                              key={`alt-${reply.id}`}
                              initial={{ opacity: 0, y: 12 }}
                              animate={{ opacity: 1, y: 0 }}
                              exit={{ opacity: 0, scale: 0.95 }}
                              transition={{ duration: 0.25, delay: index * 0.05 }}
                              onClick={() => setFocusedClipId(reply.id)}
                              className="bg-slate-950/40 border border-slate-800/80 hover:border-indigo-500/40 rounded-xl p-3 flex flex-col justify-between cursor-pointer group hover:bg-slate-900/20 active:scale-[0.98] transition-all duration-300 relative overflow-hidden"
                            >
                              <div className="flex items-start gap-2.5 mb-2.5">
                                <div className="w-10 h-10 rounded-lg bg-slate-900 overflow-hidden flex-shrink-0 relative border border-slate-800">
                                  {reply.mediaUrl.endsWith(".mp4") || reply.mediaUrl.endsWith(".webm") || reply.mediaUrl.includes("mixkit-") ? (
                                    <video src={reply.mediaUrl} className="w-full h-full object-cover" muted playsInline />
                                  ) : (
                                    <img src={reply.mediaUrl} className="w-full h-full object-cover" alt="" referrerPolicy="no-referrer" />
                                  )}
                                  {reply.overlayText && (
                                    <div className="absolute inset-0 bg-black/40 flex items-center justify-center p-1 text-center">
                                      <span className="text-[8px] font-sans font-black text-white uppercase tracking-wider line-clamp-2">
                                        {reply.overlayText}
                                      </span>
                                    </div>
                                  )}
                                </div>
                                <div className="space-y-0.5 overflow-hidden">
                                  <span className="block text-[10px] text-slate-300 font-bold truncate">@{reply.authorName}</span>
                                  <span className="block text-[9px] font-mono text-indigo-400 font-bold uppercase">
                                    {reply.tone}
                                  </span>
                                </div>
                              </div>

                              {reply.voiceText && (
                                <p className="text-[10px] text-slate-400 italic line-clamp-1 mb-2 font-sans">
                                  "{reply.voiceText}"
                                </p>
                              )}

                              <div className="flex items-center justify-between text-[9px] font-mono text-slate-500 pt-2 border-t border-slate-900">
                                <span className="flex items-center gap-1">
                                  <Heart className="w-3 h-3 text-slate-600 group-hover:text-rose-500" />
                                  <strong>{reply.likesCount}</strong> likes
                                </span>
                                <span className="text-indigo-400 group-hover:underline flex items-center gap-0.5 font-bold">
                                  <span>➔ CASCADE</span>
                                  {childRepliesCount > 0 && <span>({childRepliesCount})</span>}
                                </span>
                              </div>
                            </motion.div>
                          );
                        })}
                      </AnimatePresence>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              /* Empty Branch State */
              <div className="text-center py-10 bg-slate-950/20 border border-dashed border-slate-800 rounded-2xl p-6 space-y-3">
                <p className="text-[11px] text-slate-400 max-w-xs mx-auto leading-relaxed">
                  No other active branching responses found under this comment yet. Start a new direction!
                </p>
                <button
                  onClick={() => onRespond(focusedClip)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-[10px] rounded-lg shadow transition-all uppercase tracking-wider font-mono"
                >
                  <Plus className="w-3.5 h-3.5" /> Start Pathway
                </button>
              </div>
            )}
          </div>

        </div>

      </div>
    </div>
  );
}
