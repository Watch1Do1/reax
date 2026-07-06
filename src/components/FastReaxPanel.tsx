import React, { useState, useEffect } from "react";
import { motion } from "motion/react";
import { 
  Sparkles, RefreshCw, Send, Sliders, X, Check, Eye, Play, Volume2 
} from "lucide-react";
import { Clip } from "../types";
import { speakText } from "../utils/audio";

// Map each reaction tone to its perfect high-quality backdrop preset for ultra-fast reaction matching
const TONE_PRESETS: Record<Clip["tone"], { url: string; mimeType: string; isVideo: boolean; description: string }> = {
  funny: {
    url: "https://images.unsplash.com/photo-1607604276583-eef5d076aa5f?w=500",
    mimeType: "image/jpeg",
    isVideo: false,
    description: "Anime surprised face"
  },
  dramatic: {
    url: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=500",
    mimeType: "image/jpeg",
    isVideo: false,
    description: "Intense dramatic look"
  },
  sarcastic: {
    url: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=500",
    mimeType: "image/jpeg",
    isVideo: false,
    description: "Amused smirk smirk"
  },
  chill: {
    url: "https://assets.mixkit.co/videos/preview/mixkit-waves-breaking-in-the-ocean-1527-large.mp4",
    mimeType: "video/mp4",
    isVideo: true,
    description: "Chill ocean waves"
  },
  chaotic: {
    url: "https://images.unsplash.com/photo-1514888286974-6c03e2ca1dba?w=500",
    mimeType: "image/jpeg",
    isVideo: false,
    description: "Vibing hyper-cat"
  }
};

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
  tone, 
  username, 
  onClose, 
  onSuccess, 
  onOpenFullCustomize 
}: FastReaxPanelProps) {
  const [step, setStep] = useState<"generating" | "preview" | "posting" | "success">("generating");
  const [fastPost, setFastPost] = useState(() => localStorage.getItem("reax_fast_post") === "true");
  const [error, setError] = useState<string | null>(null);

  // AI Response parameters generated on the fly
  const [voiceText, setVoiceText] = useState("");
  const [overlayText, setOverlayText] = useState("");
  const [visualEffect, setVisualEffect] = useState("zoom");

  // Get matching preset backdrop
  const presetMedia = TONE_PRESETS[tone];

  // Sync fast post preference with storage
  const toggleFastPost = () => {
    const nextVal = !fastPost;
    setFastPost(nextVal);
    localStorage.setItem("reax_fast_post", nextVal ? "true" : "false");
  };

  // Run AI generation on load
  useEffect(() => {
    let active = true;

    async function runGeneration() {
      try {
        const imageContext = presetMedia.isVideo 
          ? `Preset reaction loop: ${presetMedia.description}`
          : `Preset template: ${presetMedia.description}`;

        const res = await fetch("/api/ai/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tone, imageContext })
        });

        if (!res.ok) throw new Error("AI Generation failed");
        const data = await res.json();

        if (!active) return;

        const generatedVoice = data.voiceLine || `Whoa, ${tone} perspective incoming!`;
        const generatedOverlay = data.overlayText || tone.toUpperCase();
        const generatedEffect = data.effect || "zoom";

        setVoiceText(generatedVoice);
        setOverlayText(generatedOverlay);
        setVisualEffect(generatedEffect);

        // Speak reaction audio instantly for zero friction
        speakText(generatedVoice, tone);

        // Check if Fast Post is enabled to skip the preview screen entirely
        if (fastPost) {
          setStep("posting");
          await publishClip(generatedVoice, generatedOverlay, generatedEffect);
        } else {
          setStep("preview");
        }

      } catch (err) {
        console.error("Fast Reax generation error:", err);
        if (active) {
          const fallbackVoice = tone === "funny" ? "LOL, that is too funny!" : "That is absolutely intense!";
          setVoiceText(fallbackVoice);
          setOverlayText(tone.toUpperCase());
          setVisualEffect("zoom");
          speakText(fallbackVoice, tone);

          if (fastPost) {
            setStep("posting");
            await publishClip(fallbackVoice, tone.toUpperCase(), "zoom");
          } else {
            setStep("preview");
          }
        }
      }
    }

    runGeneration();

    return () => {
      active = false;
    };
  }, [tone]);

  // Handle actual server posting
  const publishClip = async (voice: string, overlay: string, effect: string) => {
    try {
      const res = await fetch("/api/clips", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          parentId: parentClip.id,
          mediaUrl: presetMedia.url,
          voiceText: voice,
          tone,
          authorName: username.trim(),
          effect,
          overlayText: overlay
        })
      });

      if (!res.ok) throw new Error("Posting failed");
      
      window.dispatchEvent(new Event("reax_clip_posted"));
      setStep("success");
      setTimeout(() => {
        onSuccess();
      }, 1200);

    } catch (err) {
      console.error(err);
      setError("Failed to quick-post reaction. Opening customization mode...");
      setTimeout(() => {
        onOpenFullCustomize(parentClip, tone);
      }, 1500);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-4">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95, y: 15 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 10 }}
        className="w-full max-w-sm bg-slate-900 border border-indigo-500/35 rounded-3xl overflow-hidden shadow-2xl p-5 relative text-center flex flex-col items-center"
      >
        {/* Cancel button in top corner */}
        <button 
          onClick={onClose}
          className="absolute top-4 right-4 p-1 hover:bg-slate-800 rounded-full text-slate-400 hover:text-white transition-colors"
        >
          <X className="w-4 h-4" />
        </button>

        {/* 1. GENERATING / THINKING STATE */}
        {step === "generating" && (
          <div className="py-8 space-y-5 flex flex-col items-center w-full">
            <div className="relative">
              <div className="w-14 h-14 bg-indigo-500/10 rounded-full flex items-center justify-center text-indigo-400 border border-indigo-500/30">
                <RefreshCw className="w-6 h-6 animate-spin" />
              </div>
              <span className="absolute -bottom-1.5 -right-1.5 text-lg">⚡</span>
            </div>
            
            <div className="space-y-1.5">
              <h4 className="text-sm font-sans font-black text-white uppercase tracking-wider">
                Generating Quick {tone} Reax
              </h4>
              <p className="text-[11px] text-slate-400 font-mono">
                Designing custom captions & voice response...
              </p>
            </div>

            {/* Simulated progress slider/glow */}
            <div className="w-full h-1 bg-slate-950 rounded-full overflow-hidden max-w-[180px]">
              <motion.div 
                className="h-full bg-gradient-to-r from-indigo-500 to-purple-500"
                initial={{ width: "0%" }}
                animate={{ width: "100%" }}
                transition={{ duration: 1.5, ease: "easeInOut" }}
              />
            </div>
          </div>
        )}

        {/* 2. POSTING / BACKGROUND TRANSMITTING STATE */}
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

        {/* 3. SUCCESS / COMPLETED STATE */}
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
                Cascade thread updated with your {tone} response.
              </p>
            </div>
          </div>
        )}

        {/* 4. PREVIEW STATE (Wait for user confirmation if Fast Post is disabled) */}
        {step === "preview" && (
          <div className="w-full space-y-4 pt-2">
            
            {/* Header description */}
            <div className="text-left flex items-center gap-1.5">
              <span className="text-[9px] font-mono font-black text-indigo-400 uppercase bg-indigo-500/10 border border-indigo-500/20 px-2 py-0.5 rounded">
                ⚡ PREVIEW QUICK REAX
              </span>
            </div>

            {/* Loop Preview Canvas with text overlay */}
            <div className="relative aspect-video rounded-2xl overflow-hidden bg-black border border-slate-800 shadow-md">
              <div className={`w-full h-full ${
                visualEffect === "zoom" ? "animate-zoom" :
                visualEffect === "pan" ? "animate-pan" :
                visualEffect === "bounce" ? "animate-bounce-subtle" :
                visualEffect === "pulse" ? "animate-pulse-subtle" :
                visualEffect === "shake" ? "animate-shake-chaotic" :
                visualEffect === "glitch" ? "animate-glitch" : "animate-zoom"
              }`}>
                {presetMedia.isVideo ? (
                  <video src={presetMedia.url} className="w-full h-full object-cover" autoPlay loop muted playsInline />
                ) : (
                  <img src={presetMedia.url} className="w-full h-full object-cover" alt="" referrerPolicy="no-referrer" />
                )}
              </div>

              {/* Generated Text Overlay */}
              {overlayText && (
                <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent flex items-center justify-center p-2">
                  <h3 className="font-sans font-black text-sm text-white tracking-widest text-center uppercase drop-shadow-[0_1.5px_2px_rgba(0,0,0,0.85)]">
                    {overlayText}
                  </h3>
                </div>
              )}

              {/* Voice button */}
              <button 
                onClick={() => speakText(voiceText, tone)}
                className="absolute bottom-2 left-2 p-1 bg-black/60 backdrop-blur text-indigo-400 hover:text-indigo-300 border border-slate-800/50 rounded-lg text-xs flex items-center gap-1 font-mono transition-all z-10"
              >
                <Volume2 className="w-3.5 h-3.5" />
                <span className="text-[8px] font-bold">REPLAY AUDIO</span>
              </button>
            </div>

            {/* Subtitle Readout */}
            <div className="bg-slate-950/40 border border-slate-800 p-2.5 rounded-xl text-left">
              <span className="text-[8px] text-slate-500 font-mono block uppercase mb-0.5">GENERATED VOICE LINE:</span>
              <p className="text-[11px] text-slate-200 font-sans italic font-medium leading-tight">
                "{voiceText}"
              </p>
            </div>

            {/* Action Buttons */}
            <div className="space-y-2">
              <button
                onClick={() => {
                  setStep("posting");
                  publishClip(voiceText, overlayText, visualEffect);
                }}
                className="w-full flex items-center justify-center gap-2 py-3 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white font-black text-xs rounded-xl transition-all shadow-xl active:scale-95 uppercase tracking-wider"
              >
                <Send className="w-4 h-4" /> Publish Loop Now ⚡
              </button>

              <button
                onClick={() => {
                  onClose();
                  onOpenFullCustomize(parentClip, tone);
                }}
                className="w-full flex items-center justify-center gap-1.5 py-2.5 bg-slate-950 hover:bg-slate-800 border border-slate-800 text-slate-300 font-bold text-[10px] rounded-xl transition-all uppercase tracking-wide font-mono"
              >
                <Sliders className="w-3.5 h-3.5 text-indigo-400" /> Customize / Record Self ✏️
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

      </motion.div>
    </div>
  );
}
