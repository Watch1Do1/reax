import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { X, Star, Trash2, Send, Play, Pause, Volume2, Film, Sparkles, Pencil } from "lucide-react";
import { SavedReaction, Clip } from "../types";
import { speakText } from "../utils/audio";
import { loadAndSanitizeReactions, detectDuplicateIds } from "../utils/keyUtils";

interface SavedReactionsVaultProps {
  key?: string;
  onClose: () => void;
  onPostReaction: (reax: SavedReaction) => void;
  onRemixReaction: (reax: SavedReaction) => void;
}

export default function SavedReactionsVault({ onClose, onPostReaction, onRemixReaction }: SavedReactionsVaultProps) {
  const [savedList, setSavedList] = useState<SavedReaction[]>([]);
  const [selectedTone, setSelectedTone] = useState<"all" | Clip["tone"]>("all");
  const [playingId, setPlayingId] = useState<string | null>(null);

  const loadSaved = () => {
    const sanitized = loadAndSanitizeReactions();
    setSavedList(sanitized);
    detectDuplicateIds(sanitized, (item) => item.id, "SavedReactionsVault");
  };

  useEffect(() => {
    loadSaved();
    window.addEventListener("reax_saved_changed", loadSaved);
    return () => window.removeEventListener("reax_saved_changed", loadSaved);
  }, []);

  const handleRemove = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    try {
      const nextList = savedList.filter(r => r.id !== id);
      localStorage.setItem("reax_saved_reactions", JSON.stringify(nextList));
      setSavedList(nextList);
      window.dispatchEvent(new Event("reax_saved_changed"));
    } catch (err) {
      console.error(err);
    }
  };

  const filteredList = selectedTone === "all" 
    ? savedList 
    : savedList.filter(r => r.tone === selectedTone);

  const tonesList: { id: "all" | Clip["tone"]; label: string; emoji: string }[] = [
    { id: "all", label: "All", emoji: "⭐" },
    { id: "funny", label: "Funny", emoji: "🎭" },
    { id: "dramatic", label: "Dramatic", emoji: "🎬" },
    { id: "sarcastic", label: "Sarcasm", emoji: "🙄" },
    { id: "chill", label: "Chill", emoji: "🌊" },
    { id: "chaotic", label: "Chaos", emoji: "⚡" }
  ];

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex justify-end"
    >
      <motion.div 
        initial={{ x: "100%" }}
        animate={{ x: 0 }}
        exit={{ x: "100%" }}
        transition={{ type: "spring", damping: 25, stiffness: 220 }}
        className="w-full max-w-md bg-[#08090c]/95 backdrop-blur-2xl border-l border-slate-800/40 h-screen flex flex-col shadow-[0_-12px_48px_rgba(0,0,0,0.8)]"
      >
        {/* Header */}
        <div className="p-5 border-b border-slate-800 flex items-center justify-between bg-slate-950/20">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-amber-500/10 border border-amber-500/20 rounded-xl text-amber-400">
              <Star className="w-5 h-5 fill-amber-400 text-amber-400" />
            </div>
            <div>
              <h2 className="font-sans font-black text-base text-white tracking-tight uppercase">My Template Vault</h2>
              <p className="text-[10px] text-slate-500 font-mono uppercase">Personal reusable reaction templates ({savedList.length})</p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-1.5 hover:bg-slate-800 rounded-full transition-colors text-slate-400 hover:text-white"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Categories/Tones Filter bar */}
        <div className="px-5 py-3 border-b border-slate-800 bg-slate-950/10 flex gap-1.5 overflow-x-auto scrollbar-none">
          {tonesList.map((t) => (
            <button
              key={t.id}
              onClick={() => setSelectedTone(t.id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-semibold whitespace-nowrap transition-all ${
                selectedTone === t.id
                  ? "bg-amber-500/10 border-amber-500 text-amber-300"
                  : "bg-slate-900/80 border-slate-800 hover:border-slate-700 text-slate-400"
              }`}
            >
              <span>{t.emoji}</span>
              <span>{t.label}</span>
            </button>
          ))}
        </div>

        {/* Grid/Container */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {filteredList.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center p-6 space-y-4">
              <div className="w-16 h-16 rounded-3xl bg-slate-800/40 flex items-center justify-center border border-slate-800">
                <Star className="w-8 h-8 text-slate-600" />
              </div>
              <div className="space-y-1">
                <h4 className="font-sans font-bold text-slate-400 text-sm">No Saved Templates found</h4>
                <p className="text-xs text-slate-500 max-w-xs mx-auto leading-relaxed">
                  {selectedTone === "all" 
                    ? "Save your creations during draft or tap 'Save as Template' on any post in the feed to build your template collection!"
                    : `No templates saved with "${selectedTone}" tone yet.`}
                </p>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              {filteredList.map((reax) => {
                const isVideo = reax.mediaUrl.endsWith(".mp4") || reax.mediaUrl.endsWith(".webm") || reax.mediaUrl.includes("mixkit-");
                return (
                  <div 
                    key={`saved-${reax.id}`}
                    className="group bg-slate-950/60 border border-slate-800/80 hover:border-amber-500/40 rounded-2xl overflow-hidden p-2 flex flex-col justify-between transition-all duration-300 hover:bg-slate-950 shadow-lg"
                  >
                    {/* Thumbnail preview */}
                    <div className="relative aspect-video rounded-xl bg-slate-900 overflow-hidden border border-slate-800/50 flex items-center justify-center">
                      {isVideo ? (
                        <video 
                          src={reax.mediaUrl} 
                          className="w-full h-full object-cover" 
                          muted 
                          playsInline 
                          loop
                          autoPlay
                        />
                      ) : (
                        <img src={reax.mediaUrl} className="w-full h-full object-cover" alt="" referrerPolicy="no-referrer" />
                      )}
                      
                      {reax.overlayText && (
                        <div className="absolute inset-0 bg-black/45 flex items-center justify-center p-1.5 text-center">
                          <span className="text-[10px] font-sans font-black text-white uppercase tracking-wider line-clamp-2 leading-none drop-shadow-md">
                            {reax.overlayText}
                          </span>
                        </div>
                      )}

                      <span className="absolute top-1 left-1 px-1.5 py-0.5 text-[7px] font-mono font-bold tracking-widest bg-black/75 rounded-md text-amber-300 border border-amber-500/10 uppercase">
                        {reax.tone}
                      </span>
                    </div>

                    {/* Visual Attribution Lineage Badge inside Vault */}
                    {reax.originalAuthor && reax.originalAuthor !== reax.authorName ? (
                      <p className="text-[8px] font-mono text-slate-400 mt-1.5 px-0.5 truncate uppercase tracking-wider">
                        {reax.remixedFrom ? `🔁 remixed @${reax.remixedFrom}` : `⭐ by @${reax.originalAuthor}`}
                      </p>
                    ) : (
                      reax.authorName && reax.authorName !== "Me" && reax.authorName !== "current_user" && (
                        <p className="text-[8px] font-mono text-slate-500 mt-1.5 px-0.5 truncate uppercase tracking-wider">
                          👤 saved from @{reax.authorName}
                        </p>
                      )
                    )}

                    {/* Action buttons footer (simplified and action-oriented) */}
                    <div className="flex items-center justify-between gap-1 mt-2.5 pt-2 border-t border-slate-900">
                      <div className="flex items-center gap-1">
                        {/* Audio play */}
                        {reax.voiceText && (
                          <button
                            onClick={() => speakText(reax.voiceText || "", reax.tone)}
                            className="p-1.5 bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-white rounded-lg transition-colors border border-slate-800/60"
                            title={`Play Voice: "${reax.voiceText}"`}
                          >
                            <Volume2 className="w-3 h-3" />
                          </button>
                        )}

                        {/* Remix/Tweak Button */}
                        <button
                          onClick={() => onRemixReaction(reax)}
                          className="p-1.5 bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-amber-400 rounded-lg transition-colors border border-slate-800/60"
                          title="Remix / Edit"
                        >
                          <Pencil className="w-3 h-3" />
                        </button>

                        {/* Remove button */}
                        <button
                          onClick={(e) => handleRemove(e, reax.id)}
                          className="p-1.5 bg-slate-900 hover:bg-rose-950/25 text-slate-500 hover:text-rose-400 rounded-lg transition-colors border border-slate-800/60"
                          title="Delete"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>

                      {/* Post Reaction */}
                      <button
                        onClick={() => onPostReaction(reax)}
                        className="flex items-center gap-1 px-2.5 py-1.5 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-white text-[9px] font-black rounded-lg transition-all active:scale-95 uppercase tracking-wider font-sans shadow-md shadow-amber-500/5 cursor-pointer"
                        title="React with this reusable template instantly!"
                      >
                        <Send className="w-2.5 h-2.5" /> Use Template
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}
