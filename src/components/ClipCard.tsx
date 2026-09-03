import React, { useState, useRef, useEffect } from "react";
import { Heart, Volume2, CornerDownRight, Film, MessageCircle, ChevronRight, Play, Pause, VolumeX, Volume1, Star, Mic, Flag, Trash2 } from "lucide-react";
import { Clip, SavedReaction } from "../types";
import { speakText, playFilteredAudio, stopAllFilteredAudio } from "../utils/audio";
import { generateUniqueId, loadAndSanitizeReactions } from "../utils/keyUtils";

interface ClipCardProps {
  key?: string | number | null;
  clip: Clip;
  allClips: Clip[];
  onLaugh: (id: string) => void;
  onLike: (id: string) => void;
  onDelete?: (id: string) => void;
  onRespond: (clip: Clip) => void;
  onRespondWithTone: (clip: Clip, tone: Clip["tone"]) => void;
  onRespondWithSaved?: (clip: Clip, reax: SavedReaction) => void;
  onViewThread: (id: string) => void;
  isNestedReply?: boolean;
  isTopReply?: boolean;
}

export default function ClipCard({ 
  clip, 
  allClips, 
  onLaugh,
  onLike, 
  onDelete,
  onRespond, 
  onRespondWithTone, 
  onRespondWithSaved,
  onViewThread, 
  isNestedReply = false, 
  isTopReply = false 
}: ClipCardProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(true);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  const [showReportMenu, setShowReportMenu] = useState(false);
  const [isReported, setIsReported] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // Author ownership check
  const currentUsername = (localStorage.getItem("clips_username") || "").toLowerCase().replace(/^~/, "");
  const clipAuthor = (clip.authorName || "").toLowerCase().replace(/^~/, "");
  const isAuthor = Boolean(currentUsername && clipAuthor && currentUsername === clipAuthor);

  const handleDelete = async () => {
    if (!window.confirm("Are you sure you want to delete your reaction? This cannot be undone.")) return;
    setIsDeleting(true);
    if (onDelete) {
      onDelete(clip.id);
    }
  };

  const handleReport = async (reason: string) => {
    try {
      const res = await fetch(`/api/clips/${clip.id}/report`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reporter: localStorage.getItem("clips_username") || "Anonymous",
          reason: reason
        })
      });
      if (res.ok) {
        setIsReported(true);
        setShowReportMenu(false);
        window.dispatchEvent(new CustomEvent("reax_toast", { detail: { message: "Report submitted to moderation queue. Thank you!" } }));
      }
    } catch (e) {
      console.error(e);
      window.dispatchEvent(new CustomEvent("reax_toast", { detail: { message: "Failed to submit report." } }));
    }
  };

  const [isSaved, setIsSaved] = useState(false);
  const [showSavedFastPick, setShowSavedFastPick] = useState(false);
  const [savedReactions, setSavedReactions] = useState<SavedReaction[]>([]);

  const loadSavedList = () => {
    const sanitized = loadAndSanitizeReactions();
    setSavedReactions(sanitized);
  };

  useEffect(() => {
    if (showSavedFastPick) {
      loadSavedList();
    }
  }, [showSavedFastPick]);

  useEffect(() => {
    window.addEventListener("reax_saved_changed", loadSavedList);
    return () => window.removeEventListener("reax_saved_changed", loadSavedList);
  }, []);

  useEffect(() => {
    try {
      const savedList = JSON.parse(localStorage.getItem("reax_saved_reactions") || "[]");
      setIsSaved(savedList.some((r: any) => r.mediaUrl === clip.mediaUrl && r.voiceText === clip.voiceText && r.overlayText === clip.overlayText));
    } catch (err) {
      console.error(err);
    }
  }, [clip.mediaUrl, clip.voiceText, clip.overlayText]);

  // Handle syncing on storage events
  useEffect(() => {
    const handleSync = () => {
      try {
        const savedList = JSON.parse(localStorage.getItem("reax_saved_reactions") || "[]");
        setIsSaved(savedList.some((r: any) => r.mediaUrl === clip.mediaUrl && r.voiceText === clip.voiceText && r.overlayText === clip.overlayText));
      } catch (err) {
        console.error(err);
      }
    };
    window.addEventListener("reax_saved_changed", handleSync);
    return () => window.removeEventListener("reax_saved_changed", handleSync);
  }, [clip.mediaUrl, clip.voiceText, clip.overlayText]);

  const toggleSave = (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const savedList = JSON.parse(localStorage.getItem("reax_saved_reactions") || "[]");
      const isAlreadySaved = savedList.some((r: any) => r.mediaUrl === clip.mediaUrl && r.voiceText === clip.voiceText && r.overlayText === clip.overlayText);
      
      let nextList;
      if (isAlreadySaved) {
        nextList = savedList.filter((r: any) => !(r.mediaUrl === clip.mediaUrl && r.voiceText === clip.voiceText && r.overlayText === clip.overlayText));
        setIsSaved(false);
        window.dispatchEvent(new CustomEvent("reax_toast", { detail: { message: "Removed from Saved Vault" } }));
      } else {
        const newSaved = {
          id: generateUniqueId("saved"),
          mediaUrl: clip.mediaUrl,
          voiceText: clip.voiceText,
          voiceAudioUrl: clip.voiceAudioUrl,
          voiceAudioData: clip.voiceAudioData,
          voiceStyle: clip.voiceStyle,
          tone: clip.tone,
          effect: clip.effect || "zoom",
          overlayText: clip.overlayText,
          authorName: clip.authorName,
          originalAuthor: clip.originalAuthor || clip.authorName,
          remixedFrom: clip.remixedFrom || undefined,
          savedAt: new Date().toISOString()
        };
        nextList = [newSaved, ...savedList];
        setIsSaved(true);
        window.dispatchEvent(new CustomEvent("reax_toast", { detail: { message: "⭐ Saved to your Reactions" } }));
        
        const logged = localStorage.getItem("reax_is_logged_in") === "true";
        if (!logged) {
          setTimeout(() => {
            window.dispatchEvent(new CustomEvent("reax_upgrade_trigger", { detail: { reason: "save_reaction" } }));
          }, 1000);
        }
      }
      localStorage.setItem("reax_saved_reactions", JSON.stringify(nextList));
      window.dispatchEvent(new Event("reax_saved_changed"));
    } catch (err) {
      console.error(err);
    }
  };

  // Get children replies
  const replies = allClips.filter((c) => c.parentId === clip.id);

  // Count all recursive chain items under this clip
  const getChainCount = (clipId: string): number => {
    let count = 0;
    const direct = allClips.filter(c => c.parentId === clipId);
    count += direct.length;
    direct.forEach(child => {
      count += getChainCount(child.id);
    });
    return count;
  };
  const chainCount = getChainCount(clip.id);

  // Count how many replies were created recently
  const getRecentRepliesCount = (hours: number): number => {
    const limitMs = hours * 60 * 60 * 1000;
    const now = Date.now();
    
    // Find all descendants recursively
    const getAllDescendants = (clipId: string): Clip[] => {
      let results: Clip[] = [];
      const direct = allClips.filter(c => c.parentId === clipId);
      results = results.concat(direct);
      direct.forEach(child => {
        results = results.concat(getAllDescendants(child.id));
      });
      return results;
    };

    const descendants = getAllDescendants(clip.id);
    return descendants.filter(d => (now - new Date(d.createdAt).getTime()) < limitMs).length;
  };

  const repliesInLastHour = getRecentRepliesCount(1);
  const repliesInLastDay = getRecentRepliesCount(24);

  // Find top reply ID among direct replies
  const topReplyId = replies.length > 0
    ? [...replies].sort((a, b) => b.likesCount - a.likesCount)[0].id
    : null;

  const [isAudioPlaying, setIsAudioPlaying] = useState(false);

  // Handle recorded voice audio or speech playback
  const handlePlayAudio = (e?: React.MouseEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    stopAllFilteredAudio();

    // Resolve audio URL from all possible fields
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
      setIsAudioPlaying(true);
      playFilteredAudio(audioUrl, clip.voiceStyle || "normal")
        .catch((err) => {
          console.warn("Direct audio playback failed:", err);
          setIsAudioPlaying(false);
        })
        .finally(() => {
          setTimeout(() => setIsAudioPlaying(false), 4500);
        });
    } else if (clip.voiceAudioData) {
      setIsAudioPlaying(true);
      playFilteredAudio(clip.voiceAudioData, clip.voiceStyle || "normal")
        .catch(() => setIsAudioPlaying(false))
        .finally(() => setTimeout(() => setIsAudioPlaying(false), 4500));
    } else if (clip.voiceText && clip.voiceText.trim() !== "" && !clip.voiceText.includes("Voice Reaction") && !clip.voiceText.startsWith("audio_url:")) {
      setIsAudioPlaying(true);
      speakText(clip.voiceText, clip.tone, clip.voiceStyle);
      setTimeout(() => setIsAudioPlaying(false), 2500);
    }
  };

  // Handle play/pause toggle (video only)
  const togglePlay = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!videoRef.current) return;
    if (isPlaying) {
      videoRef.current.pause();
      setIsPlaying(false);
    } else {
      videoRef.current
        .play()
        .then(() => setIsPlaying(true))
        .catch(err => console.log("Video play interrupted", err));
    }
  };

  // Handle mute/unmute toggle (video only)
  const toggleMute = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!videoRef.current) return;
    const nextMuted = !isMuted;
    videoRef.current.muted = nextMuted;
    setIsMuted(nextMuted);
  };

  const isVideo = clip.mediaUrl.endsWith(".mp4") || clip.mediaUrl.endsWith(".webm") || clip.mediaUrl.includes("mixkit-") || clip.mediaUrl.includes("uploads/clip-");

  // Autoplay video only when the card is mostly on screen (IntersectionObserver). Pause when scrolled off. Never autoplay sound.
  useEffect(() => {
    if (!isVideo) return;
    const video = videoRef.current;
    if (!video) return;

    video.muted = isMuted;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!videoRef.current) return;
          if (entry.isIntersecting) {
            // Mostly on screen (> 50% visible)
            videoRef.current.muted = isMuted;
            videoRef.current
              .play()
              .then(() => setIsPlaying(true))
              .catch(() => setIsPlaying(false));
          } else {
            // Scrolled off
            videoRef.current.pause();
            setIsPlaying(false);
          }
        });
      },
      { threshold: 0.6 }
    );

    observer.observe(video);

    return () => {
      observer.disconnect();
    };
  }, [isVideo, clip.mediaUrl, isMuted]);

  return (
    <div className={`flex flex-col w-full ${isNestedReply ? "pl-6 mt-3.5 border-l border-slate-800/20" : "bg-slate-900/35 backdrop-blur-md border border-slate-800/20 rounded-2xl p-4 md:p-5 shadow-xl glass-panel-hover"}`}>
      
      {/* Top Author Metadata Bar */}
      <div className="flex justify-between items-center mb-2.5">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-full bg-slate-800 text-slate-200 font-bold font-mono text-xs flex items-center justify-center flex-shrink-0">
            {clip.authorName[0]?.toUpperCase()}
          </div>
          <div>
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="font-semibold text-xs text-slate-100 block">@{clip.authorName}</span>
              {clip.authorName.startsWith("~") ? (
                <span className="text-[9px] px-1 bg-slate-950/60 border border-slate-800/80 rounded text-slate-500 font-bold font-mono">GUEST</span>
              ) : (
                <span className="w-2.5 h-2.5 bg-emerald-500/20 border border-emerald-500/40 rounded-full flex items-center justify-center" title="Verified Member">
                  <span className="w-1 h-1 bg-emerald-400 rounded-full animate-pulse" />
                </span>
              )}
              {clip.originalAuthor && clip.originalAuthor !== clip.authorName && (
                <span className="inline-flex items-center gap-1 text-[9px] text-slate-400">
                  <span className="text-slate-600 font-normal text-[8px]">•</span>
                  {clip.remixedFrom ? (
                    <span className="inline-flex items-center gap-0.5 px-1 py-0.2 rounded bg-indigo-500/10 border border-indigo-500/20 text-[8px] font-mono font-bold text-indigo-400">
                      remix
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-0.5 px-1 py-0.2 rounded bg-amber-500/10 border border-amber-500/20 text-[8px] font-mono font-bold text-amber-400">
                      saved
                    </span>
                  )}
                </span>
              )}
              <span className="text-[9px] text-slate-500">
                • {new Date(clip.createdAt).toLocaleDateString([], { month: "short", day: "numeric" })}
              </span>
            </div>
          </div>
        </div>

        {/* Tone tag pills & Top Reaction Badge */}
        <div className="flex items-center gap-1.5">
          {(clip.voiceAudioUrl || clip.voiceAudioData || clip.mediaType === "audio") && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[8.5px] font-mono font-black tracking-wide bg-gradient-to-r from-emerald-500/15 to-teal-500/15 text-emerald-300 border border-emerald-500/30 shadow-md">
              🎤 VOICE
            </span>
          )}
          {isTopReply && (
            <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[8px] font-mono font-black tracking-wider bg-rose-500/15 text-rose-400 border border-rose-500/25">
              TOP
            </span>
          )}
          <span className={`px-2.5 py-0.5 rounded-full text-[9px] font-mono tracking-wider font-semibold capitalize flex items-center gap-1.5 ${
            clip.tone === "funny" ? "bg-amber-500/10 text-amber-400 border border-amber-500/15" :
            clip.tone === "dramatic" ? "bg-rose-500/10 text-rose-400 border border-rose-500/15" :
            clip.tone === "sarcastic" ? "bg-purple-500/10 text-purple-400 border border-purple-500/15" :
            clip.tone === "chill" ? "bg-sky-500/10 text-sky-400 border border-sky-500/15" :
            "bg-orange-500/10 text-orange-400 border border-orange-500/15"
          }`}>
            <span className={`w-1 h-1 rounded-full ${
              clip.tone === "funny" ? "bg-amber-400" :
              clip.tone === "dramatic" ? "bg-rose-400 animate-pulse" :
              clip.tone === "sarcastic" ? "bg-purple-400" :
              clip.tone === "chill" ? "bg-sky-400" :
              "bg-orange-400"
            }`} />
            {clip.tone}
          </span>
        </div>
      </div>

      {/* Looping Media Box with Kinetic Transform suggestion */}
      <div 
        onClick={(e) => {
          const hasAudio = !!(
            clip.voiceAudioUrl || 
            clip.voiceAudioData || 
            (clip.mediaType === "audio" && clip.mediaUrl) || 
            (clip.voiceText && (
              clip.voiceText.startsWith("audio_url:") || 
              (clip.voiceText.startsWith("http") && (clip.voiceText.includes("/storage/") || clip.voiceText.includes(".webm") || clip.voiceText.includes(".mp4"))) || 
              (clip.voiceText.trim() !== "" && !clip.voiceText.includes("Voice Reaction"))
            ))
          );
          if (!isVideo && hasAudio) {
            handlePlayAudio(e);
          }
        }}
        className={`relative aspect-video rounded-xl bg-slate-950 overflow-hidden flex items-center justify-center group/media border border-slate-950/40 ${
          !isVideo && (clip.voiceAudioUrl || clip.voiceAudioData || clip.voiceText || (clip.mediaType === "audio" && clip.mediaUrl)) ? "cursor-pointer" : ""
        }`}
      >
        
        {/* Kinetic animations depending on the tone of the reaction */}
        {(() => {
          const [kineticEffectName, textStylePreset = "classic", textStyleColor = "white", textStylePosition = "bottom"] = (clip.effect || "zoom").split("|");
          
          const stylePresetClasses: Record<string, string> = {
            classic: "font-sans font-black text-sm sm:text-base md:text-lg uppercase tracking-wider drop-shadow-[0_2px_4px_rgba(0,0,0,0.9)] text-stroke-[1px_black]",
            bold: "font-sans font-extrabold text-base sm:text-lg md:text-xl uppercase tracking-tighter drop-shadow-md",
            comic: "font-serif italic font-black text-sm sm:text-base md:text-lg lowercase tracking-wide drop-shadow-[0_3px_0_rgba(0,0,0,1)]",
            glitch: "font-mono font-black text-xs sm:text-sm md:text-base uppercase tracking-widest skew-x-3 -rotate-1 skew-y-1 drop-shadow-[2px_2px_0_rgba(239,68,68,0.8)] [text-shadow:-2px_-2px_0_rgba(6,182,212,0.8)] animate-pulse",
            cinema: "font-serif font-light text-xs sm:text-sm md:text-base uppercase tracking-[0.25em] text-neutral-100",
          };

          const textColorClasses: Record<string, string> = {
            white: "text-white",
            yellow: "text-yellow-400",
            red: "text-rose-500",
            cyan: "text-cyan-400",
          };

          const positionClasses: Record<string, string> = {
            "top-left": "absolute top-3 left-3 flex justify-start items-start text-left max-w-[80%] z-10 pointer-events-none",
            "top": "absolute top-3 inset-x-0 flex justify-center items-start text-center px-4 z-10 pointer-events-none",
            "top-right": "absolute top-3 right-3 flex justify-end items-start text-right max-w-[80%] z-10 pointer-events-none",
            "left": "absolute inset-y-0 left-3 flex justify-start items-center text-left max-w-[80%] z-10 pointer-events-none",
            "center": "absolute inset-0 flex items-center justify-center text-center px-4 z-10 pointer-events-none",
            "right": "absolute inset-y-0 right-3 flex justify-end items-center text-right max-w-[80%] z-10 pointer-events-none",
            "bottom-left": "absolute bottom-3 left-3 flex justify-start items-end text-left max-w-[80%] z-10 pointer-events-none",
            "bottom": "absolute bottom-3 inset-x-0 flex justify-center items-end text-center px-4 z-10 pointer-events-none",
            "bottom-right": "absolute bottom-3 right-3 flex justify-end items-end text-right max-w-[80%] z-10 pointer-events-none",
            "none": "hidden",
          };

          return (
            <>
              <div className={`w-full h-full overflow-hidden flex items-center justify-center ${
                kineticEffectName === "zoom" ? "animate-zoom" :
                kineticEffectName === "pan" ? "animate-pan" :
                kineticEffectName === "bounce" ? "animate-bounce-subtle" :
                kineticEffectName === "pulse" ? "animate-pulse-subtle" :
                kineticEffectName === "shake" ? "animate-shake-chaotic" :
                kineticEffectName === "glitch" ? "animate-glitch" : "animate-zoom"
              }`}>
                {isVideo ? (
                  <video 
                    ref={videoRef}
                    src={clip.mediaUrl} 
                    className="w-full h-full object-cover pointer-events-none"
                    loop 
                    muted={isMuted}
                    playsInline
                    preload="metadata"
                  />
                ) : (
                  <img 
                    src={clip.mediaUrl} 
                    className="w-full h-full object-cover pointer-events-none" 
                    alt={`Reaction clip by ${clip.authorName}`}
                    referrerPolicy="no-referrer"
                  />
                )}
              </div>

              {/* Cinema Wide Screen black bars overlay */}
              {textStylePreset === "cinema" && textStylePosition !== "none" && (
                <>
                  <div className="absolute top-0 inset-x-0 h-3 bg-black z-10 pointer-events-none" />
                  <div className="absolute bottom-0 inset-x-0 h-3 bg-black z-10 pointer-events-none" />
                </>
              )}

              {/* Optional Big overlay text */}
              {clip.overlayText && textStylePosition !== "none" && (
                <div className={positionClasses[textStylePosition] || positionClasses.bottom || positionClasses.center}>
                  <h2 className={`${stylePresetClasses[textStylePreset] || stylePresetClasses.classic} ${textColorClasses[textStyleColor] || textColorClasses.white} ${
                    textStylePosition.includes("left") ? "text-left" : textStylePosition.includes("right") ? "text-right" : "text-center"
                  } line-clamp-2 break-words leading-tight max-w-full`}>
                    {clip.overlayText}
                  </h2>
                </div>
              )}
            </>
          );
        })()}

        {/* Playing audio visual wave badge */}
        {isAudioPlaying && (
          <div className="absolute top-2.5 right-2.5 z-20 flex items-center gap-1.5 px-2 py-1 rounded-md bg-emerald-500/90 text-white text-[10px] font-mono font-bold shadow-lg animate-pulse backdrop-blur-md">
            <span className="w-1.5 h-1.5 rounded-full bg-white animate-ping" />
            <span>PLAYING AUDIO</span>
          </div>
        )}

        {/* Media Overlay Controls: Bottom-Left (Reply + Voice), Bottom-Right (Play/Mute for Video) */}
        <div className="absolute bottom-2.5 left-2.5 flex items-center gap-1.5 z-20">
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onRespond(clip);
            }}
            className="flex items-center gap-1.5 bg-black/75 hover:bg-black/90 text-white hover:text-indigo-300 backdrop-blur-md px-2.5 py-1 rounded-lg border border-white/10 text-xs font-semibold shadow-lg transition-all active:scale-95 cursor-pointer"
            title="Reply to this reaction"
          >
            <CornerDownRight className="w-3.5 h-3.5 text-indigo-400" />
            <span>Reply</span>
          </button>

          {(() => {
            const hasAudioUrl = !!(
              clip.voiceAudioUrl || 
              (clip.voiceText && (
                clip.voiceText.startsWith("audio_url:") || 
                (clip.voiceText.startsWith("http") && (clip.voiceText.includes("/storage/") || clip.voiceText.includes(".webm") || clip.voiceText.includes(".mp4")))
              )) || 
              (clip.mediaType === "audio" && clip.mediaUrl)
            );
            const hasVoiceData = !!clip.voiceAudioData;
            const hasValidVoiceText = !!(clip.voiceText && clip.voiceText.trim() !== "" && !clip.voiceText.includes("Voice Reaction") && !clip.voiceText.startsWith("audio_url:"));
            const showAudioButton = hasAudioUrl || hasVoiceData || hasValidVoiceText;

            if (!showAudioButton) return null;

            return (
              <button
                type="button"
                onClick={handlePlayAudio}
                className={`flex items-center gap-1 backdrop-blur-md px-2 py-1.5 rounded-lg border shadow-lg transition-all active:scale-95 cursor-pointer ${
                  isAudioPlaying
                    ? "bg-emerald-600 text-white border-emerald-400 shadow-emerald-500/30 animate-pulse"
                    : "bg-black/75 hover:bg-black/90 text-slate-200 hover:text-white border-white/10"
                }`}
                title={
                  hasAudioUrl || hasVoiceData
                    ? "Play recorded voice audio"
                    : `Play AI voice: "${clip.voiceText}"`
                }
              >
                {hasAudioUrl || hasVoiceData ? (
                  <Mic className={`w-3.5 h-3.5 ${isAudioPlaying ? "text-white" : "text-emerald-400"}`} />
                ) : (
                  <Volume2 className={`w-3.5 h-3.5 ${isAudioPlaying ? "text-white" : "text-indigo-400"}`} />
                )}
                <span className="text-[10px] font-mono font-bold">
                  {isAudioPlaying ? "Playing..." : "Voice"}
                </span>
              </button>
            );
          })()}
        </div>

        {/* Play/Pause & Mute/Unmute Overlay controls (Video Only) */}
        {isVideo && (
          <div className="absolute bottom-2.5 right-2.5 flex items-center gap-1 bg-black/75 backdrop-blur-md px-2 py-1 rounded-lg border border-white/10 z-20 shadow-lg">
            <button 
              type="button"
              onClick={togglePlay}
              className="p-1 hover:text-white text-slate-300 transition-colors cursor-pointer"
              title={isPlaying ? "Pause Loop" : "Play Loop"}
            >
              {isPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
            </button>
            <div className="w-[1px] h-3.5 bg-white/20" />
            <button 
              type="button"
              onClick={toggleMute}
              className="p-1 hover:text-white text-slate-300 transition-colors cursor-pointer"
              title={isMuted ? "Unmute Audio" : "Mute Audio"}
            >
              {isMuted ? <VolumeX className="w-3.5 h-3.5" /> : <Volume1 className="w-3.5 h-3.5" />}
            </button>
          </div>
        )}
      </div>

      {/* ⚡ 1-Tap Quick React Picker (Dominant Action!) */}
      <div className="mt-3.5 bg-slate-950/40 p-3.5 rounded-xl shadow-inner backdrop-blur-sm">
        <span className="block text-[10px] font-mono text-amber-400/95 uppercase tracking-widest mb-3 font-black text-center sm:text-left flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-ping" />
          ⚡ 1-TAP INSTANT REPLY
        </span>
        <div className="grid grid-cols-6 gap-2">
          {[
            { id: "funny" as const, emoji: "🎭", label: "Funny", color: "hover:bg-amber-500/10 text-amber-400 border-slate-800/80 hover:border-amber-500/35 hover:shadow-[0_0_12px_rgba(245,158,11,0.15)]" },
            { id: "dramatic" as const, emoji: "🎬", label: "Drama", color: "hover:bg-rose-500/10 text-rose-400 border-slate-800/80 hover:border-rose-500/35 hover:shadow-[0_0_12px_rgba(244,63,94,0.15)]" },
            { id: "sarcastic" as const, emoji: "🙄", label: "Sarcasm", color: "hover:bg-purple-500/10 text-purple-400 border-slate-800/80 hover:border-purple-500/35 hover:shadow-[0_0_12px_rgba(168,85,247,0.15)]" },
            { id: "chill" as const, emoji: "🌊", label: "Chill", color: "hover:bg-sky-500/10 text-sky-400 border-slate-800/80 hover:border-sky-500/35 hover:shadow-[0_0_12px_rgba(14,165,233,0.15)]" },
            { id: "chaotic" as const, emoji: "⚡", label: "Chaos", color: "hover:bg-orange-500/10 text-orange-400 border-slate-800/80 hover:border-orange-500/35 hover:shadow-[0_0_12px_rgba(249,115,22,0.15)]" }
          ].map((item) => (
            <button
              key={item.id}
              onClick={(e) => {
                e.stopPropagation();
                onRespondWithTone(clip, item.id);
              }}
              className={`flex flex-col items-center justify-center py-3 px-1.5 bg-slate-900/90 border rounded-xl transition-all hover:scale-[1.04] active:scale-95 ${item.color} group/btn cursor-pointer`}
              title={`Instantly react with ${item.label} tone`}
            >
              <span className="text-xl filter drop-shadow-[0_1px_2px_rgba(0,0,0,0.5)] group-hover/btn:scale-110 transition-transform">{item.emoji}</span>
              <span className="text-[9.5px] font-bold text-slate-300 mt-1.5">{item.label}</span>
            </button>
          ))}

          {/* 6th option: Saved ⭐ */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              setShowSavedFastPick(!showSavedFastPick);
            }}
            className={`flex flex-col items-center justify-center py-3 px-1.5 bg-slate-900/90 border rounded-xl transition-all hover:scale-[1.04] active:scale-95 cursor-pointer ${
              showSavedFastPick 
                ? "border-amber-400 bg-amber-500/10 text-amber-400 shadow-[0_0_12px_rgba(245,158,11,0.25)]" 
                : "border-slate-800 hover:border-amber-400 text-amber-400/85 hover:text-amber-400 hover:shadow-[0_0_12px_rgba(245,158,11,0.15)]"
            }`}
            title="Fast pick from your saved reactions"
          >
            <span className="text-xl filter drop-shadow-[0_1px_2px_rgba(0,0,0,0.5)]">⭐</span>
            <span className="text-[9.5px] font-bold mt-1.5">Saved</span>
          </button>
        </div>

        {/* SAVED TRAY */}
        {showSavedFastPick && (
          <div className="pt-3.5 mt-3 border-t border-slate-800/50 space-y-2 text-left">
            <span className="block text-[9px] font-mono font-black text-amber-400 uppercase tracking-widest px-1">
              ⭐ TAP TO REPLY WITH SAVED REACTION:
            </span>

            {savedReactions.length === 0 ? (
              <div className="p-3 bg-slate-950/40 rounded-lg border border-slate-900 text-center py-3">
                <p className="text-[9px] text-slate-500 font-mono">Your Saved Vault is empty. Save reactions using the ⭐ button below!</p>
              </div>
            ) : (
              <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-thin scrollbar-thumb-slate-800 scrollbar-track-transparent">
                {savedReactions.map((reax) => {
                  const isVideo = reax.mediaUrl.endsWith(".mp4") || reax.mediaUrl.endsWith(".webm") || reax.mediaUrl.includes("mixkit-");
                  return (
                    <button
                      key={`card-${clip.id}-reax-${reax.id}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (onRespondWithSaved) {
                          onRespondWithSaved(clip, reax);
                          setShowSavedFastPick(false);
                        }
                      }}
                      className="flex-shrink-0 w-24 bg-slate-950/90 border border-slate-800 hover:border-amber-400 rounded-lg overflow-hidden p-1 transition-all group active:scale-95 text-left cursor-pointer"
                    >
                      <div className="aspect-video w-full rounded bg-slate-900 overflow-hidden relative mb-1">
                        {isVideo ? (
                          <video src={reax.mediaUrl} className="w-full h-full object-cover" muted playsInline />
                        ) : (
                          <img src={reax.mediaUrl} className="w-full h-full object-cover" alt="" referrerPolicy="no-referrer" />
                        )}
                      </div>
                      <p className="text-[7.5px] font-mono font-black text-slate-400 truncate uppercase group-hover:text-amber-400 leading-tight">
                        {reax.overlayText || "REACTION"}
                      </p>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* 🏷️ Automatic Visual Attribution / Lineage Credit */}
      {clip.originalAuthor && clip.originalAuthor !== clip.authorName && (
        <div className="mt-2.5 px-2 py-1.5 rounded-lg bg-slate-950/40 border border-slate-900/80 flex items-center gap-2 text-[10px] font-mono text-slate-400">
          <div className="w-4 h-4 rounded bg-amber-500/10 flex items-center justify-center text-[9px] text-amber-400 flex-shrink-0 font-bold">
            {clip.remixedFrom ? "🔁" : "⭐"}
          </div>
          <div className="truncate leading-none">
            {clip.remixedFrom ? (
              <span>
                Remixed from <span className="text-indigo-400 font-bold">@{clip.remixedFrom}</span>'s loop (original by <span className="text-amber-400 font-bold">@{clip.originalAuthor}</span>)
              </span>
            ) : (
              <span>
                Reaction originally created by <span className="text-amber-400 font-bold">@{clip.originalAuthor}</span>
              </span>
            )}
          </div>
        </div>
      )}

      {/* Bottom Engagement Panel */}
      <div className="flex items-center justify-between mt-3.5 pt-3 border-t border-slate-800/50">
        <div className="flex items-center gap-3">
          {/* Primary Humor Metric: 😂 Laughs */}
          <button 
            onClick={() => onLaugh(clip.id)}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/25 text-amber-300 hover:text-amber-200 transition-all group/laugh active:scale-95 cursor-pointer"
            title="Laugh at this clip"
          >
            <span className="text-sm transition-transform group-hover/laugh:scale-125">😂</span>
            <span className="text-xs font-mono font-bold">{clip.laughsCount ?? 0}</span>
          </button>

          {/* Secondary Metric: ❤️ Likes */}
          <button 
            onClick={() => onLike(clip.id)}
            className="flex items-center gap-1.5 text-slate-400 hover:text-rose-400 transition-colors group/like cursor-pointer px-1.5 py-1"
            title="Like this clip"
          >
            <Heart className="w-4 h-4 transition-transform group-hover/like:scale-125 hover:fill-rose-400" />
            <span className="text-xs font-semibold">{clip.likesCount ?? 0}</span>
          </button>
          
          {/* React to Thread */}
          <button 
            onClick={() => onRespond(clip)}
            className="flex items-center gap-1.5 text-slate-400 hover:text-indigo-400 transition-colors cursor-pointer px-1.5 py-1"
            title="Create a video or audio reaction response"
          >
            <CornerDownRight className="w-4 h-4" />
            <span className="text-xs font-semibold">React</span>
          </button>

          {/* Save as Template */}
          <button 
            onClick={toggleSave}
            className={`flex items-center gap-1.5 transition-colors cursor-pointer px-1.5 py-1 ${
              isSaved ? "text-amber-400 hover:text-amber-500 font-bold" : "text-slate-400 hover:text-amber-400"
            }`}
            title={isSaved ? "Saved as Template" : "Save as reusable template for later reactions"}
          >
            <Star className={`w-4 h-4 ${isSaved ? "fill-amber-400 text-amber-400" : ""}`} />
            <span className="text-xs hidden sm:inline">{isSaved ? "Saved" : "Save"}</span>
          </button>

          {/* Report Button */}
          <button 
            onClick={() => setShowReportMenu(!showReportMenu)}
            className={`flex items-center gap-1.5 transition-colors cursor-pointer px-1.5 py-1 ${
              isReported ? "text-red-500 font-bold" : "text-slate-500 hover:text-red-400"
            }`}
            title="Report violation (Harassment, Slurs, Threats)"
          >
            <Flag className="w-3.5 h-3.5" />
            <span className="text-xs hidden sm:inline">{isReported ? "Reported" : "Report"}</span>
          </button>

          {/* Author Only: Delete Own Reaction */}
          {isAuthor && (
            <button 
              onClick={handleDelete}
              disabled={isDeleting}
              className="flex items-center gap-1 text-slate-500 hover:text-red-400 transition-colors cursor-pointer px-1.5 py-1 text-xs"
              title="Delete your reaction (Only you can delete your reaction)"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span className="text-[11px] hidden sm:inline">Delete</span>
            </button>
          )}
        </div>

        {/* View Conversation Thread triggers if replies are present */}
        {!isNestedReply && (
          <button 
            onClick={() => onViewThread(clip.id)}
            className="flex items-center gap-1 text-slate-500 hover:text-white text-xs font-mono transition-colors cursor-pointer"
          >
            <span>View Thread</span>
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* Dynamic Report Menu Tray with Guidelines Statement */}
      {showReportMenu && (
        <div className="mt-3 bg-[#150a0e]/95 border border-red-900/40 rounded-xl p-3.5 space-y-2.5 text-left shadow-2xl">
          <div className="flex items-start justify-between gap-2">
            <div>
              <span className="block text-[10px] font-mono font-black text-red-400 uppercase tracking-wider flex items-center gap-1.5">
                <Flag className="w-3.5 h-3.5 text-red-400" /> Platform Safety & Moderation
              </span>
              <p className="text-[10px] text-slate-400 mt-0.5 leading-snug">
                <strong>Rule: Criticize ideas, not people.</strong> Satire, mockery of products/ideas, and harsh opinions are allowed. Slurs, personal harassment, and threats will be reviewed and removed by moderators.
              </p>
            </div>
            <button 
              onClick={() => setShowReportMenu(false)}
              className="text-slate-500 hover:text-slate-300 text-xs font-mono p-1"
            >
              ✕
            </button>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5 pt-1">
            {[
              "Slurs / Hate Speech",
              "Harassment / Bullying",
              "Threats / Violence",
              "Pornography",
              "Spam",
              "Copyright",
              "Other"
            ].map((reason) => (
              <button
                key={reason}
                onClick={() => handleReport(reason)}
                className="py-1.5 px-2.5 bg-[#090b0e] border border-slate-800 hover:border-red-500/40 text-slate-300 hover:text-red-400 rounded-lg text-[10px] font-mono font-bold transition-all text-left truncate cursor-pointer active:scale-95 flex items-center gap-1"
              >
                <span className="text-red-400">⚠️</span>
                <span className="truncate">{reason}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ↳ Recursive Nesting - Show up to 2 replies directly beneath */}
      {!isNestedReply && replies.length > 0 && (
        <div className="mt-4 pl-4 space-y-4 relative border-l-2 border-slate-800/60 ml-4">
          <div className="absolute top-0 left-0 w-3.5 h-6 border-b-2 border-l-2 border-slate-800/60 -ml-4 rounded-bl-lg" />
          {replies.slice(0, 2).map((reply) => (
            <ClipCard 
              key={`reply-${reply.id}`} 
              clip={reply} 
              allClips={allClips} 
              onLaugh={onLaugh}
              onLike={onLike} 
              onDelete={onDelete}
              onRespond={onRespond} 
              onRespondWithTone={onRespondWithTone}
              onRespondWithSaved={onRespondWithSaved}
              onViewThread={onViewThread} 
              isNestedReply={true} 
              isTopReply={reply.id === topReplyId}
            />
          ))}

          {/* Expanded thread button details */}
          {replies.length > 2 && (
            <button 
              onClick={() => onViewThread(clip.id)}
              className="mt-3.5 text-left text-[11px] font-semibold text-indigo-400 hover:text-indigo-300 hover:underline flex items-center gap-1 pl-2"
            >
              Show all {replies.length} responses in conversation thread →
            </button>
          )}
        </div>
      )}

    </div>
  );
}
