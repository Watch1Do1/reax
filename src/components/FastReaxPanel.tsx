import React, { useState, useEffect } from "react";
import { 
  RefreshCw, Send, Sliders, X, Check, Volume2 
} from "lucide-react";
import { Clip } from "../types";
import { speakText } from "../utils/audio";
import { getAuthToken } from "../utils/supabaseClient";

// Tone labels, emojis, and local fallback captions (No Unsplash/Mixkit stock URLs)
const TONE_OPTIONS: Array<{
  id: Clip["tone"];
  emoji: string;
  label: string;
  fallbackOverlay: string;
  fallbackVoice: string;
  effect: string;
}> = [
  { id: "funny", emoji: "🎭", label: "Funny", fallbackOverlay: "LOL NO WAY", fallbackVoice: "LOL, no way!", effect: "bounce" },
  { id: "dramatic", emoji: "🎬", label: "Drama", fallbackOverlay: "DUN DUN DUN", fallbackVoice: "Wait... what just happened?", effect: "shake" },
  { id: "sarcastic", emoji: "🙄", label: "Sarcasm", fallbackOverlay: "SURE JAN", fallbackVoice: "Oh brilliant, truly genius.", effect: "pulse" },
  { id: "chill", emoji: "🌊", label: "Chill", fallbackOverlay: "CHILL VIBES", fallbackVoice: "Just vibing here, no worries.", effect: "zoom" },
  { id: "chaotic", emoji: "⚡", label: "Chaos", fallbackOverlay: "CHAOS REIGNS", fallbackVoice: "Total chaos! Absolutely wild!", effect: "glitch" }
];

interface FastReaxPanelProps {
  key?: string;
  parentClip: Clip;
  tone: Clip["tone"];
  username: string;
  onClose: () => void;
  onSuccess: () => void;
  onOpenFullCustomize: (parentClip: Clip, tone: Clip["tone"]) => void;
}

export default function FastReaxPanel({ 
  parentClip, 
  tone: initialTone, 
  username, 
  onClose, 
  onSuccess, 
  onOpenFullCustomize 
}: FastReaxPanelProps) {
  // If parent has no mediaUrl, open RespondModal instead of posting
  useEffect(() => {
    if (!parentClip || !parentClip.mediaUrl) {
      onOpenFullCustomize(parentClip, initialTone || "funny");
    }
  }, [parentClip, onOpenFullCustomize, initialTone]);

  const [activeTone, setActiveTone] = useState<Clip["tone"]>(initialTone || "funny");
  const [fastPost, setFastPost] = useState(() => localStorage.getItem("reax_fast_post") === "true");
  const [step, setStep] = useState<"preview" | "posting" | "success">("preview");
  const [error, setError] = useState<string | null>(null);

  // Initial tone configuration fallback values (no Gemini call)
  const initialConfig = TONE_OPTIONS.find(t => t.id === (initialTone || "funny")) || TONE_OPTIONS[0];
  const [overlayText, setOverlayText] = useState(initialConfig.fallbackOverlay);
  const [voiceText, setVoiceText] = useState(initialConfig.fallbackVoice);
  const [visualEffect, setVisualEffect] = useState(initialConfig.effect);
  const [useTTS, setUseTTS] = useState(false);

  // Early return if parent has no mediaUrl
  if (!parentClip || !parentClip.mediaUrl) {
    return null;
  }

  // Determine media type directly from parentClip
  const isVideo = parentClip.mediaType === "video" || /\.(mp4|webm|mov|m4v)(\?.*)?$/i.test(parentClip.mediaUrl || "");
  const computedMediaType = parentClip.mediaType || (isVideo ? "video" : "image");

  // Sync fast post preference with storage
  const toggleFastPost = () => {
    const nextVal = !fastPost;
    setFastPost(nextVal);
    localStorage.setItem("reax_fast_post", nextVal ? "true" : "false");
  };

  // Tone switch: update active tone and fallback overlay/voice
  const handleSelectTone = (toneId: Clip["tone"]) => {
    setActiveTone(toneId);
    const config = TONE_OPTIONS.find(t => t.id === toneId) || TONE_OPTIONS[0];
    setOverlayText(config.fallbackOverlay);
    setVoiceText(config.fallbackVoice);
    setVisualEffect(config.effect);
  };

  // Handle actual server posting
  const publishClip = async (voice: string, overlay: string, effect: string) => {
    try {
      setStep("posting");
      setError(null);

      const token = await getAuthToken();

      // Fast Reax POST body: uses parentClip.mediaUrl without re-uploading
      const postBody: Record<string, any> = {
        parentId: parentClip.id,
        mediaUrl: parentClip.mediaUrl,
        mediaType: computedMediaType,
        tone: activeTone,
        overlayText: (overlay || "").trim().slice(0, 48),
        authorName: username.trim() || "Anonymous",
        effect: effect || "zoom"
      };

      // voiceText: only if TTS enabled; do not send "Voice Reaction"
      if (useTTS && voice && voice.trim() && voice.trim() !== "Voice Reaction") {
        postBody.voiceText = voice.trim();
      }

      const res = await fetch("/api/clips", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify(postBody)
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || "Posting failed");
      }
      
      window.dispatchEvent(new Event("reax_clip_posted"));
      setStep("success");
      setTimeout(() => {
        onSuccess();
      }, 1200);

    } catch (err: any) {
      console.error(err);
      setError(err.message || "Failed to post quick reaction. Opening customization mode...");
      setTimeout(() => {
        onOpenFullCustomize(parentClip, activeTone);
      }, 1500);
    }
  };

  // If fastPost is enabled, immediately publish on open
  useEffect(() => {
    if (fastPost && parentClip && parentClip.mediaUrl) {
      const config = TONE_OPTIONS.find(t => t.id === activeTone) || TONE_OPTIONS[0];
      publishClip(config.fallbackVoice, config.fallbackOverlay, config.effect);
    }
  }, []); // run on initial mount

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-4">
      <div 
        className="w-full max-w-sm bg-slate-900 border border-indigo-500/35 rounded-3xl overflow-hidden shadow-2xl p-5 relative text-center flex flex-col items-center animate-in fade-in zoom-in-95 duration-200"
      >
        {/* Cancel button in top corner */}
        <button 
          type="button"
          onClick={onClose}
          className="absolute top-4 right-4 p-1 hover:bg-slate-800 rounded-full text-slate-400 hover:text-white transition-colors cursor-pointer"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Tone Selector Bar */}
        <div className="w-full mb-3 pr-6">
          <div className="flex items-center justify-between gap-1 bg-slate-950/60 p-1 rounded-xl border border-slate-800">
            {TONE_OPTIONS.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => handleSelectTone(t.id)}
                className={`flex-1 flex flex-col sm:flex-row items-center justify-center gap-0.5 sm:gap-1 py-1 px-1 rounded-lg text-[8px] font-mono font-bold transition-all cursor-pointer ${
                  activeTone === t.id
                    ? "bg-indigo-600 text-white shadow-md"
                    : "text-slate-400 hover:text-white hover:bg-slate-800/60"
                }`}
              >
                <span>{t.emoji}</span>
                <span className="truncate">{t.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* 1. POSTING / TRANSMITTING STATE */}
        {step === "posting" && (
          <div className="py-8 space-y-4 flex flex-col items-center w-full">
            <RefreshCw className="w-8 h-8 text-indigo-400 animate-spin" />
            <div className="space-y-1">
              <h4 className="text-sm font-sans font-black text-white uppercase tracking-wider">
                TRANSMITTING REAX...
              </h4>
              <p className="text-[10px] text-slate-500 font-mono">
                @{username} is posting to cascade thread
              </p>
            </div>
          </div>
        )}

        {/* 2. SUCCESS / COMPLETED STATE */}
        {step === "success" && (
          <div className="py-8 space-y-4 flex flex-col items-center w-full">
            <div className="w-12 h-12 bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 rounded-full flex items-center justify-center">
              <Check className="w-6 h-6" />
            </div>
            <div className="space-y-1">
              <h4 className="text-sm font-sans font-black text-emerald-400 uppercase tracking-wider">
                POSTED INSTANTLY!
              </h4>
              <p className="text-[10px] text-slate-500 font-mono">
                Cascade thread updated with your {activeTone} response.
              </p>
            </div>
          </div>
        )}

        {/* 3. PREVIEW STATE */}
        {step === "preview" && (
          <div className="w-full space-y-3 pt-1">
            
            {/* Header description */}
            <div className="text-left flex items-center justify-between">
              <span className="text-[9px] font-mono font-black text-indigo-400 uppercase bg-indigo-500/10 border border-indigo-500/20 px-2 py-0.5 rounded">
                ⚡ FAST REAX ({activeTone.toUpperCase()})
              </span>
              <span className="text-[9px] text-slate-500 font-mono">
                Backdrop: parent loop
              </span>
            </div>

            {/* Loop Preview Canvas using parentClip.mediaUrl */}
            <div className="relative aspect-video rounded-2xl overflow-hidden bg-black border border-slate-800 shadow-md">
              <div className={`w-full h-full ${
                visualEffect === "zoom" ? "animate-zoom" :
                visualEffect === "pan" ? "animate-pan" :
                visualEffect === "bounce" ? "animate-bounce-subtle" :
                visualEffect === "pulse" ? "animate-pulse-subtle" :
                visualEffect === "shake" ? "animate-shake-chaotic" :
                visualEffect === "glitch" ? "animate-glitch" : "animate-zoom"
              }`}>
                {isVideo ? (
                  <video 
                    src={parentClip.mediaUrl} 
                    className="w-full h-full object-cover" 
                    autoPlay 
                    loop 
                    muted 
                    playsInline 
                  />
                ) : (
                  <img 
                    src={parentClip.mediaUrl} 
                    className="w-full h-full object-cover" 
                    alt="" 
                    referrerPolicy="no-referrer" 
                  />
                )}
              </div>

              {/* Text Overlay */}
              {overlayText && (
                <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent flex items-end justify-center pb-3 px-3 pointer-events-none">
                  <h3 className="font-sans font-black text-sm sm:text-base text-white tracking-widest text-center uppercase drop-shadow-[0_2px_4px_rgba(0,0,0,0.9)] line-clamp-2 break-words leading-tight max-w-full">
                    {overlayText}
                  </h3>
                </div>
              )}
            </div>

            {/* User-editable Overlay Caption (Max 48 chars) */}
            <div className="space-y-1 text-left bg-slate-950/50 p-2.5 rounded-xl border border-slate-800/80">
              <div className="flex items-center justify-between">
                <label className="text-[10px] font-bold text-slate-400 font-mono tracking-wider uppercase">
                  Overlay Caption:
                </label>
                <span className="text-[9px] text-slate-500 font-mono">{overlayText.length}/48</span>
              </div>
              <input
                type="text"
                value={overlayText}
                onChange={(e) => setOverlayText(e.target.value)}
                maxLength={48}
                placeholder="Enter caption..."
                className="w-full px-3 py-1.5 bg-slate-900 border border-slate-800 focus:border-indigo-500 rounded-lg text-xs text-white focus:outline-none"
              />
            </div>

            {/* Optional TTS Audio Toggle */}
            <div className="flex items-center justify-between bg-slate-950/40 border border-slate-800 p-2.5 rounded-xl text-left">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    const next = !useTTS;
                    setUseTTS(next);
                    if (next && voiceText) {
                      speakText(voiceText, activeTone);
                    }
                  }}
                  className={`px-2 py-1 rounded-lg text-[10px] font-mono font-bold flex items-center gap-1.5 cursor-pointer border transition-all ${
                    useTTS
                      ? "bg-indigo-600/30 text-indigo-300 border-indigo-500/50 shadow-sm"
                      : "bg-slate-900 text-slate-400 border-slate-800 hover:text-white"
                  }`}
                >
                  <Volume2 className="w-3.5 h-3.5" />
                  {useTTS ? "🔊 TTS Voice: ON" : "🔈 TTS Voice: OFF"}
                </button>
                {useTTS && (
                  <button
                    type="button"
                    onClick={() => speakText(voiceText, activeTone)}
                    className="text-[10px] text-indigo-400 hover:text-indigo-300 font-mono underline cursor-pointer"
                  >
                    Replay
                  </button>
                )}
              </div>
              {useTTS && (
                <span className="text-[9px] text-slate-400 font-mono italic truncate max-w-[130px]">
                  "{voiceText}"
                </span>
              )}
            </div>

            {/* Action Buttons */}
            <div className="space-y-2 pt-1">
              <button
                type="button"
                onClick={() => {
                  publishClip(voiceText, overlayText, visualEffect);
                }}
                className="w-full flex items-center justify-center gap-2 py-3 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white font-black text-xs rounded-xl transition-all shadow-xl active:scale-95 uppercase tracking-wider cursor-pointer"
              >
                <Send className="w-4 h-4" /> Publish Loop Now ⚡
              </button>

              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenFullCustomize(parentClip, activeTone);
                }}
                className="w-full flex items-center justify-center gap-1.5 py-2.5 bg-slate-950 hover:bg-slate-800 border border-slate-800 text-slate-300 font-bold text-[10px] rounded-xl transition-all uppercase tracking-wide font-mono cursor-pointer"
              >
                <Sliders className="w-3.5 h-3.5 text-indigo-400" /> Customize (photo / voice) ✏️
              </button>
            </div>

            {/* Fast Post Preference Toggle */}
            <div 
              onClick={toggleFastPost}
              className="flex items-center justify-between p-2.5 bg-indigo-500/5 hover:bg-indigo-500/10 border border-indigo-500/15 rounded-xl cursor-pointer select-none transition-all"
            >
              <div className="text-left">
                <span className="text-[10px] font-mono font-black text-indigo-300 block uppercase">
                  ⚡ Always Fast-Post Reactions
                </span>
                <span className="text-[8px] text-slate-500 font-mono block">
                  Skip this preview screen next time and post immediately!
                </span>
              </div>
              <div className={`w-4 h-4 rounded border flex items-center justify-center transition-all ${
                fastPost 
                  ? "bg-indigo-500 border-indigo-400 text-white" 
                  : "border-slate-700 bg-transparent"
              }`}>
                {fastPost && <Check className="w-3 h-3" />}
              </div>
            </div>

          </div>
        )}

        {/* Error State */}
        {error && (
          <div className="p-3 bg-rose-500/10 border border-rose-500/20 rounded-xl mt-3 text-left">
            <p className="text-[10px] text-rose-400 font-mono">{error}</p>
          </div>
        )}

      </div>
    </div>
  );
}
