import React, { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { 
  X, Camera, Upload, Film, Sparkles, Volume2, VolumeX, RefreshCw, CheckCircle, 
  Image as ImageIcon, ChevronDown, ChevronUp, Settings2, Sliders, Star, Mic, MicOff
} from "lucide-react";
import { speakText, playFilteredAudio, stopAllFilteredAudio } from "../utils/audio";
import { Clip, SavedReaction } from "../types";
import { generateUniqueId, loadAndSanitizeReactions } from "../utils/keyUtils";

// Static preset templates for instant reaction clips
const PRESETS = [
  {
    name: "Surprised",
    url: "https://images.unsplash.com/photo-1607604276583-eef5d076aa5f?w=500",
    description: "Cute surprised anime figure expression"
  },
  {
    name: "Sarcastic Look",
    url: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=500",
    description: "Amused smirk reaction"
  },
  {
    name: "Intense Eyes",
    url: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=500",
    description: "Dramatic intense glance"
  },
  {
    name: "Vibing Cat",
    url: "https://images.unsplash.com/photo-1514888286974-6c03e2ca1dba?w=500",
    description: "Chill cat portrait"
  },
  {
    name: "Calm Waves",
    url: "https://vjs.zencdn.net/v/oceans.mp4",
    description: "Chill looping ocean wave"
  }
];

interface RespondModalProps {
  key?: string;
  parentId: string | null;
  parentClip?: Clip;
  initialTone?: Clip["tone"] | null;
  onClose: () => void;
  onSuccess: () => void;
  username: string;
  remixData?: SavedReaction | null;
}

export default function RespondModal({ parentId, parentClip, initialTone = null, onClose, onSuccess, username, remixData = null }: RespondModalProps) {
  const [step, setStep] = useState<"upload_capture" | "choose_tone" | "ai_generate" | "preview">(
    "upload_capture"
  );
  const [showAdvanced, setShowAdvanced] = useState(false);
  
  // Saved Reactions library state
  const [savedReactions, setSavedReactions] = useState<SavedReaction[]>([]);

  useEffect(() => {
    const sanitized = loadAndSanitizeReactions();
    setSavedReactions(sanitized);
  }, []);
  
  // Form State
  const [selectedMedia, setSelectedMedia] = useState<{ data: string; mimeType: string; isVideo: boolean } | null>(null);
  const [tone, setTone] = useState<Clip["tone"]>("funny");
  const [voiceStyle, setVoiceStyle] = useState<Clip["voiceStyle"]>("casual");
  
  // Audio configuration & recording states
  const [audioMode, setAudioMode] = useState<"record" | "tts" | "none">("none");
  const [voiceAudioData, setVoiceAudioData] = useState<string | null>(null);
  const [recordingAudio, setRecordingAudio] = useState(false);
  const [audioRecorderProgress, setAudioRecorderProgress] = useState(0);
  const [suggestingLoading, setSuggestingLoading] = useState(false);
  const [isPaywallOpen, setIsPaywallOpen] = useState(false);
  const audioRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const audioIntervalRef = useRef<any>(null);

  const startAudioRecording = async () => {
    try {
      setError(null);
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioChunksRef.current = [];
      
      let mimeType = "audio/webm";
      if (MediaRecorder.isTypeSupported("audio/mp4")) {
        mimeType = "audio/mp4";
      } else if (MediaRecorder.isTypeSupported("audio/ogg")) {
        mimeType = "audio/ogg";
      } else if (MediaRecorder.isTypeSupported("audio/wav")) {
        mimeType = "audio/wav";
      }

      const recorder = new MediaRecorder(stream, { mimeType });
      audioRecorderRef.current = recorder;

      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          audioChunksRef.current.push(e.data);
        }
      };

      recorder.onstop = async () => {
        // Stop all tracks to release microphone lock
        stream.getTracks().forEach(track => track.stop());
        
        const blob = new Blob(audioChunksRef.current, { type: mimeType });
        const reader = new FileReader();
        reader.onloadend = () => {
          setVoiceAudioData(reader.result as string);
          setAudioMode("record");
        };
        reader.readAsDataURL(blob);
      };

      recorder.start();
      setRecordingAudio(true);
      setAudioRecorderProgress(0);

      const duration = 5000; // max 5 seconds
      const intervalMs = 100;
      let elapsed = 0;

      audioIntervalRef.current = setInterval(() => {
        elapsed += intervalMs;
        setAudioRecorderProgress(Math.min((elapsed / duration) * 100, 100));

        if (elapsed >= duration) {
          clearInterval(audioIntervalRef.current);
          if (recorder.state !== "inactive") {
            recorder.stop();
          }
          setRecordingAudio(false);
        }
      }, intervalMs);

    } catch (err) {
      console.error("Audio recording error:", err);
      setError("Unable to access microphone. Please check permissions.");
    }
  };

  const stopAudioRecording = () => {
    if (audioIntervalRef.current) {
      clearInterval(audioIntervalRef.current);
    }
    if (audioRecorderRef.current && audioRecorderRef.current.state !== "inactive") {
      audioRecorderRef.current.stop();
    }
    setRecordingAudio(false);
  };

  // AI Suggestions
  const [voiceText, setVoiceText] = useState("");
  const [overlayText, setOverlayText] = useState("");
  const [visualEffect, setVisualEffect] = useState("zoom");
  const [textStyle, setTextStyle] = useState("classic");
  const [textColor, setTextColor] = useState("white");
  const [textPosition, setTextPosition] = useState("center");
  const [previewMuted, setPreviewMuted] = useState(true);
  
  // Camera & Video Capture
  const [cameraActive, setCameraActive] = useState(false);
  const [preferredCaptureMode, setPreferredCaptureMode] = useState<"photo" | "video" | null>(null);
  const [recording, setRecording] = useState(false);
  const [recordProgress, setRecordProgress] = useState(0);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunks = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  
  // Mobile Direct Input Capture Refs
  const photoInputRef = useRef<HTMLInputElement | null>(null);
  const videoInputRef = useRef<HTMLInputElement | null>(null);

  // Smart capture routing: uses mobile native files if on mobile, otherwise falls back to inline webcam
  const handleCaptureOptionClick = (mode: "photo" | "video") => {
    const isMobile = /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
    if (isMobile) {
      if (mode === "photo") {
        photoInputRef.current?.click();
      } else {
        videoInputRef.current?.click();
      }
    } else {
      setPreferredCaptureMode(mode);
      startCamera();
    }
  };

  // Helper for step-by-step or advanced media updates
  const onMediaSelected = (mediaObj: { data: string; mimeType: string; isVideo: boolean }) => {
    setSelectedMedia(mediaObj);
    if (step === "upload_capture") {
      setVoiceText("");
      setOverlayText("");
      setStep("preview");
    } else {
      // If we are already in preview mode, keep custom text.
      // They can explicitly click "Brainstorm with AI" if they want suggestions!
    }
  };

  // General Status
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [isSaved, setIsSaved] = useState(false);
  const [showSaveToast, setShowSaveToast] = useState(false);

  useEffect(() => {
    if (!selectedMedia) {
      setIsSaved(false);
      return;
    }
    try {
      const savedList = JSON.parse(localStorage.getItem("reax_saved_reactions") || "[]");
      const exists = savedList.some((r: any) => r.mediaUrl === selectedMedia.data && r.voiceText === voiceText && r.overlayText === overlayText);
      setIsSaved(exists);
    } catch (err) {
      console.error(err);
    }
  }, [selectedMedia?.data, voiceText, overlayText]);

  const handleSaveToVault = () => {
    if (!selectedMedia) return;
    try {
      const savedList: SavedReaction[] = JSON.parse(localStorage.getItem("reax_saved_reactions") || "[]");
      const exists = savedList.some(r => r.mediaUrl === selectedMedia.data && r.voiceText === voiceText && r.overlayText === overlayText);
      if (exists) {
        setIsSaved(true);
        return;
      }
      
      // Check if edited from remixData to apply precise lineage tracking
      const isEditedFromRemix = remixData && (
        voiceText !== (remixData.voiceText || "") ||
        overlayText !== (remixData.overlayText || "") ||
        tone !== remixData.tone ||
        visualEffect !== remixData.effect
      );

      const originalAuthorVal = remixData 
        ? (remixData.originalAuthor || remixData.authorName) 
        : undefined;

      const remixedFromVal = remixData
        ? (isEditedFromRemix ? remixData.authorName : remixData.remixedFrom)
        : undefined;

      const newSaved: SavedReaction = {
        id: generateUniqueId("saved"),
        mediaUrl: selectedMedia.data,
        voiceText: audioMode === "tts" ? voiceText : (audioMode === "record" ? "🎤 Recorded Voice" : ""),
        voiceAudioData: audioMode === "record" ? (voiceAudioData || undefined) : undefined,
        voiceStyle: voiceStyle || undefined,
        tone,
        effect: `${visualEffect}|${textStyle}|${textColor}|${textPosition}`,
        overlayText,
        authorName: username || "Me",
        originalAuthor: originalAuthorVal,
        remixedFrom: remixedFromVal,
        savedAt: new Date().toISOString()
      };
      
      localStorage.setItem("reax_saved_reactions", JSON.stringify([newSaved, ...savedList]));
      setIsSaved(true);
      setShowSaveToast(true);
      setTimeout(() => setShowSaveToast(false), 2500);
      window.dispatchEvent(new Event("reax_saved_changed"));
    } catch (err) {
      console.error(err);
    }
  };

  // Trigger auto generation or remix prefill on mount
  useEffect(() => {
    if (remixData) {
      setTone(remixData.tone);
      const isVideo = remixData.mediaUrl.endsWith(".mp4") || remixData.mediaUrl.endsWith(".webm") || remixData.mediaUrl.includes("mixkit-");
      setSelectedMedia({
        data: remixData.mediaUrl,
        mimeType: isVideo ? "video/mp4" : "image/jpeg",
        isVideo
      });
      setVoiceText(remixData.voiceText || "");
      setVoiceAudioData(remixData.voiceAudioData || null);
      if (remixData.voiceStyle) {
        setVoiceStyle(remixData.voiceStyle);
      }
      if (remixData.voiceAudioData) {
        setAudioMode("record");
      } else if (remixData.voiceText) {
        setAudioMode("tts");
      } else {
        setAudioMode("none");
      }
      setOverlayText(remixData.overlayText || "");
      const [parsedEffect = "zoom", parsedStyle = "classic", parsedColor = "white", parsedPosition = "center"] = (remixData.effect || "zoom").split("|");
      setVisualEffect(parsedEffect);
      setTextStyle(parsedStyle);
      setTextColor(parsedColor);
      setTextPosition(parsedPosition);
      setStep("preview");
      
      if (remixData.voiceAudioData) {
        setTimeout(() => {
          const audio = new Audio(remixData.voiceAudioData);
          audio.play().catch(err => console.log("Failed to play remixed voice note:", err));
        }, 500);
      } else if (remixData.voiceText) {
        setTimeout(() => {
          speakText(remixData.voiceText || "", remixData.tone, remixData.voiceStyle);
        }, 400);
      }
      return;
    }

    const activeTone = initialTone || (["funny", "dramatic", "sarcastic", "chill", "chaotic"][Math.floor(Math.random() * 5)] as Clip["tone"]);
    setTone(activeTone);

    // Both starting root threads and replying to threads start in the upload_capture wizard.
    // This allows the user to record, capture, or select their own reaction background first.
    setSelectedMedia(null);
    setStep("upload_capture");
  }, [initialTone, remixData, parentClip]);

  // General AI Generation helper
  const triggerInstantAIGenerate = async (targetTone: Clip["tone"], media: typeof selectedMedia) => {
    setStep("ai_generate");
    setError(null);

    const imageContext = media?.isVideo 
      ? "Short looping reaction video" 
      : (media?.data.startsWith("http") ? `Preset reaction template: ${media.data}` : "Captured photo reaction");

    try {
      const res = await fetch("/api/ai/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tone: targetTone, imageContext })
      });

      if (!res.ok) throw new Error("Server AI generation failed");
      const data = await res.json();
      
      setVoiceText(data.voiceLine || "Let's loop this!");
      setOverlayText(data.overlayText || targetTone.toUpperCase());
      setVisualEffect(data.effect || "zoom");
      setAudioMode("tts");
      
      const suggestedStyle = 
        targetTone === "funny" ? "oldschool" as const :
        targetTone === "sarcastic" ? "sarcastic" as const :
        targetTone === "dramatic" ? "dramatic" as const :
        targetTone === "chill" ? "casual" as const : "announcer" as const;
      setVoiceStyle(suggestedStyle);

      // Speak text instantly
      setTimeout(() => {
        speakText(data.voiceLine || "Let's loop this!", targetTone, suggestedStyle);
      }, 500);

      setStep("preview");
    } catch (err) {
      console.error("Instant AI Generation error:", err);
      setVoiceText(targetTone === "funny" ? "LOL that's too much!" : "This is interesting...");
      setOverlayText(targetTone.toUpperCase());
      setVisualEffect("zoom");
      setAudioMode("tts");
      
      const fallbackStyle = 
        targetTone === "funny" ? "oldschool" as const :
        targetTone === "sarcastic" ? "sarcastic" as const :
        targetTone === "dramatic" ? "dramatic" as const :
        targetTone === "chill" ? "casual" as const : "announcer" as const;
      setVoiceStyle(fallbackStyle);
      setStep("preview");
    }
  };

  // Trigger regeneration helper (from Advanced panel)
  const regenerateAILoop = (updatedTone: Clip["tone"] = tone, updatedMedia: typeof selectedMedia = selectedMedia) => {
    triggerInstantAIGenerate(updatedTone, updatedMedia);
  };

  // Live Inline Brainstorm: Suggest Caption & Voice Line via AI without leaving preview screen
  const suggestAICaptionOnly = async () => {
    setSuggestingLoading(true);
    const imageContext = selectedMedia?.isVideo 
      ? "Short looping reaction video" 
      : (selectedMedia?.data.startsWith("http") ? `Preset reaction template: ${selectedMedia.data}` : "Captured photo reaction");

    try {
      const res = await fetch("/api/ai/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tone, imageContext })
      });

      if (res.ok) {
        const data = await res.json();
        if (data.overlayText) setOverlayText(data.overlayText);
        if (data.voiceLine) {
          setVoiceText(data.voiceLine);
          // Auto enable AI Speech if none chosen
          if (audioMode === "none") {
            setAudioMode("tts");
          }
          const activeStyle = 
            tone === "funny" ? "oldschool" as const :
            tone === "sarcastic" ? "sarcastic" as const :
            tone === "dramatic" ? "dramatic" as const :
            tone === "chill" ? "casual" as const : "announcer" as const;
          setVoiceStyle(activeStyle);
          speakText(data.voiceLine, tone, activeStyle);
        }
      }
    } catch (err) {
      console.error("AI caption suggestion error:", err);
    } finally {
      setSuggestingLoading(false);
    }
  };

  // Cleanup camera stream
  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, []);

  const startCamera = async () => {
    setError(null);
    try {
      let stream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      } catch (audioErr) {
        console.warn("Microphone access failed/denied, falling back to video-only:", audioErr);
        stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      }
      streamRef.current = stream;
      setCameraActive(true);
      
      // Attempt immediate bind if element is already available,
      // otherwise our callback ref on the video tag will handle it upon mounting.
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play().catch(err => console.error("Immediate play error:", err));
      }
    } catch (err) {
      console.error("Camera access error:", err);
      setError("Unable to access camera. Please check permissions or use Upload/Presets.");
    }
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    setCameraActive(false);
    setRecording(false);
    setPreferredCaptureMode(null);
  };

  const capturePhoto = () => {
    if (!videoRef.current) return;
    const canvas = document.createElement("canvas");
    canvas.width = videoRef.current.videoWidth || 640;
    canvas.height = videoRef.current.videoHeight || 480;
    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL("image/jpeg");
      const mediaObj = {
        data: dataUrl,
        mimeType: "image/jpeg",
        isVideo: false
      };
      stopCamera();
      onMediaSelected(mediaObj);
    }
  };

  const startVideoRecording = () => {
    if (!streamRef.current) return;
    recordedChunks.current = [];
    setError(null);
    
    try {
      let mimeType = "video/webm";
      if (MediaRecorder.isTypeSupported("video/mp4")) {
        mimeType = "video/mp4";
      }

      const recorder = new MediaRecorder(streamRef.current, { mimeType });
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          recordedChunks.current.push(e.data);
        }
      };

      recorder.onstop = async () => {
        const blob = new Blob(recordedChunks.current, { type: mimeType });
        const reader = new FileReader();
        reader.onloadend = () => {
          const mediaObj = {
            data: reader.result as string,
            mimeType,
            isVideo: true
          };
          stopCamera();
          onMediaSelected(mediaObj);
        };
        reader.readAsDataURL(blob);
      };

      recorder.start();
      setRecording(true);
      setRecordProgress(0);

      const duration = 3000;
      const intervalMs = 100;
      let elapsed = 0;
      
      const timer = setInterval(() => {
        elapsed += intervalMs;
        setRecordProgress(Math.min((elapsed / duration) * 100, 100));
        
        if (elapsed >= duration) {
          clearInterval(timer);
          if (recorder.state !== "inactive") {
            recorder.stop();
          }
        }
      }, intervalMs);

    } catch (err) {
      console.error("Recording start error:", err);
      setError("Failed to start recording. Please try capturing a photo instead.");
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setError(null);
    const isVideo = file.type.startsWith("video/");
    const isImage = file.type.startsWith("image/");

    if (!isVideo && !isImage) {
      setError("Please upload a valid image or video file.");
      return;
    }

    if (isVideo && file.type !== "video/mp4" && file.type !== "video/webm") {
      setError("Only MP4 and WebM video formats are supported.");
      return;
    }

    // 4MB limit enforcement to comply with Vercel's 4.5MB serverless payload limit
    const MAX_SIZE = 4 * 1024 * 1024; // 4MB
    if (file.size > MAX_SIZE) {
      setError("File is too large. Maximum size allowed is 4MB (Vercel serverless request limit).");
      return;
    }

    if (isVideo) {
      // Create a temporary video element to check duration before upload
      const videoElement = document.createElement("video");
      videoElement.preload = "metadata";
      
      videoElement.onloadedmetadata = () => {
        window.URL.revokeObjectURL(videoElement.src);
        const duration = videoElement.duration;
        console.log("Validated video duration:", duration);
        if (duration > 5.1) {
          setError(`Video duration is too long (${duration.toFixed(1)}s). Maximum allowed is 5.0 seconds.`);
          return;
        }

        // Proceed with loading
        const reader = new FileReader();
        reader.onload = () => {
          const mediaObj = {
            data: reader.result as string,
            mimeType: file.type,
            isVideo: true
          };
          stopCamera();
          onMediaSelected(mediaObj);
        };
        reader.readAsDataURL(file);
      };

      videoElement.onerror = () => {
        setError("Unable to read video file or duration. Ensure it is a valid MP4 or WebM.");
      };

      videoElement.src = URL.createObjectURL(file);
    } else {
      // Process image normally
      const reader = new FileReader();
      reader.onload = () => {
        const mediaObj = {
          data: reader.result as string,
          mimeType: file.type,
          isVideo: false
        };
        stopCamera();
        onMediaSelected(mediaObj);
      };
      reader.readAsDataURL(file);
    }
  };

  const selectPreset = (url: string) => {
    const isVideo = url.endsWith(".mp4");
    const mediaObj = {
      data: url,
      mimeType: isVideo ? "video/mp4" : "image/jpeg",
      isVideo
    };
    stopCamera();
    onMediaSelected(mediaObj);
  };

  const handleCustomToneChange = (newTone: Clip["tone"]) => {
    setTone(newTone);
    regenerateAILoop(newTone, selectedMedia);
  };

  // Complete submission
  const handlePostClip = async () => {
    if (!selectedMedia) return;
    setLoading(true);
    setError(null);

    try {
      let finalMediaUrl = selectedMedia.data;

      // If the media is local base64, upload it first
      if (selectedMedia.data.startsWith("data:")) {
        const uploadRes = await fetch("/api/upload", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            base64Data: selectedMedia.data,
            mimeType: selectedMedia.mimeType
          })
        });

        if (!uploadRes.ok) throw new Error("Media upload failed");
        const uploadData = await uploadRes.json();
        finalMediaUrl = uploadData.url;
      }

      // Check if edited from remixData to apply precise lineage tracking
      const isEditedFromRemix = remixData && (
        voiceText !== (remixData.voiceText || "") ||
        overlayText !== (remixData.overlayText || "") ||
        tone !== remixData.tone ||
        visualEffect !== remixData.effect
      );

      const originalAuthorVal = remixData 
        ? (remixData.originalAuthor || remixData.authorName) 
        : undefined;

      const remixedFromVal = remixData
        ? (isEditedFromRemix ? remixData.authorName : remixData.remixedFrom)
        : undefined;

      // Post the new clip payload
      const postRes = await fetch("/api/clips", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          parentId,
          mediaUrl: finalMediaUrl,
          voiceText: audioMode === "tts" ? voiceText : (audioMode === "record" ? "🎤 Recorded Voice" : ""),
          voiceAudioData: audioMode === "record" ? voiceAudioData : null,
          voiceStyle: voiceStyle, // Store selected voice filter or TTS voice accent style!
          tone,
          authorName: username.trim(),
          effect: `${visualEffect}|${textStyle}|${textColor}|${textPosition}`, // Encoded styling parameters!
          overlayText,
          originalAuthor: originalAuthorVal,
          remixedFrom: remixedFromVal
        })
      });

      if (!postRes.ok) throw new Error("Failed to post clip");
      window.dispatchEvent(new Event("reax_clip_posted"));
      onSuccess();
    } catch (err) {
      console.error("Submit error:", err);
      setError("Failed to share your loop. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const isMobileDevice = typeof window !== "undefined" && /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 overflow-y-auto">
      <div className="relative w-full max-w-lg bg-[#08090c]/95 backdrop-blur-2xl border border-slate-800/40 rounded-3xl overflow-hidden shadow-[0_24px_64px_rgba(0,0,0,0.7)] flex flex-col max-h-[92vh]">
        
        {/* Header with zero-friction automatic context */}
        <div className="flex items-center justify-between p-4 border-b border-slate-800/80 bg-slate-950/20">
          <div>
            <h3 className="font-sans font-black text-sm text-white tracking-tight flex items-center gap-1.5 uppercase">
              <span>🚀 REACT / JUMP IN</span>
              <span className="text-[9px] bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 font-mono px-1.5 py-0.5 rounded">
                @{username}
              </span>
            </h3>
            {parentClip && (
              <p className="text-[10px] text-slate-500 mt-0.5 font-mono uppercase">
                Responding to <span className="text-indigo-400 font-bold">@{parentClip.authorName}</span>
              </p>
            )}
          </div>
          <button 
            onClick={onClose}
            className="p-1.5 hover:bg-slate-800 rounded-full transition-colors text-slate-400 hover:text-white"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Error Notification */}
        {error && (
          <div className="bg-red-500/15 border-l-4 border-red-500 text-red-200 p-3 text-xs flex justify-between items-center mx-4 mt-3 rounded-lg">
            <span>{error}</span>
            <button onClick={() => setError(null)} className="font-bold hover:text-white">✕</button>
          </div>
        )}

        {/* Modal Content Area */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          <AnimatePresence mode="wait">

            {/* STEP: CHOOSE OR CAPTURE MEDIA */}
            {step === "upload_capture" && (
              <motion.div
                key="upload_capture"
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -15 }}
                className="space-y-6 py-2 text-left"
              >
                <div className="text-center space-y-1 mb-4">
                  <h4 className="font-sans font-black text-base text-white tracking-tight uppercase">
                    CHOOSE MEDIA BACKGROUND
                  </h4>
                  <p className="text-[11px] text-slate-400 max-w-[320px] mx-auto leading-relaxed">
                    Upload an image or video, record with your camera, or choose a preset looping template.
                  </p>
                </div>

                {/* Mobile / Hardware Selection Grid */}
                <div className="space-y-3">
                  {cameraActive ? (
                    <div className="relative aspect-video rounded-2xl bg-black overflow-hidden border border-slate-800 shadow-xl">
                      <video 
                        ref={(el) => {
                          videoRef.current = el;
                          if (el && streamRef.current && el.srcObject !== streamRef.current) {
                            el.srcObject = streamRef.current;
                            el.play().catch(err => console.error("Webcam video element playback failed:", err));
                          }
                        }}
                        className="w-full h-full object-cover scale-x-[-1]" 
                        playsInline 
                        muted 
                      />
                      {recording && (
                        <div className="absolute inset-x-0 bottom-0 p-3 bg-gradient-to-t from-black/80 to-transparent flex flex-col gap-1">
                          <div className="flex items-center justify-between text-[10px] text-white font-mono">
                            <span className="flex items-center gap-1.5 text-red-400 font-bold animate-pulse">
                              🔴 RECORDING 3S LOOP
                            </span>
                            <span>{Math.round(recordProgress)}%</span>
                          </div>
                          <div className="w-full h-1 bg-slate-800 rounded-full overflow-hidden">
                            <div className="h-full bg-red-500" style={{ width: `${recordProgress}%` }} />
                          </div>
                        </div>
                      )}
                      <div className="absolute top-2 right-2">
                        <button 
                          type="button"
                          onClick={stopCamera}
                          className="px-2 py-1 text-[10px] font-bold font-mono bg-slate-900 border border-slate-700 text-slate-300 rounded-lg cursor-pointer hover:bg-slate-800"
                        >
                          Cancel Camera
                        </button>
                      </div>
                      {!recording && (
                        <div className="absolute inset-x-0 bottom-3 flex justify-center gap-2">
                          <button
                            type="button"
                            onClick={capturePhoto}
                            className={`flex items-center gap-1.5 px-4 py-1.5 text-[11px] font-bold rounded-xl text-white shadow-lg active:scale-95 transition-all cursor-pointer ${
                              preferredCaptureMode === "photo" 
                                ? "bg-emerald-600 hover:bg-emerald-500 ring-2 ring-white scale-105" 
                                : preferredCaptureMode === "video" 
                                  ? "bg-emerald-800/40 hover:bg-emerald-700/80 opacity-70"
                                  : "bg-emerald-600 hover:bg-emerald-500"
                            }`}
                          >
                            <Camera className="w-4 h-4" /> Snap Photo
                          </button>
                          <button
                            type="button"
                            onClick={startVideoRecording}
                            className={`flex items-center gap-1.5 px-4 py-1.5 text-[11px] font-bold rounded-xl text-white shadow-lg active:scale-95 transition-all cursor-pointer ${
                              preferredCaptureMode === "video" 
                                ? "bg-rose-600 hover:bg-rose-500 ring-2 ring-white scale-105" 
                                : preferredCaptureMode === "photo"
                                  ? "bg-rose-800/60 hover:bg-rose-700/80 opacity-70"
                                  : "bg-rose-600 hover:bg-rose-500"
                            }`}
                          >
                            <Film className="w-4 h-4" /> Record Video (3s)
                          </button>
                        </div>
                      )}
                    </div>
                  ) : (
                    <>
                      {/* Hidden Mobile Native Capture Inputs */}
                      <input 
                        type="file" 
                        accept="image/*" 
                        capture="user" 
                        className="hidden" 
                        ref={photoInputRef}
                        onChange={handleFileUpload}
                      />
                      <input 
                        type="file" 
                        accept="video/mp4,video/webm" 
                        capture="user" 
                        className="hidden" 
                        ref={videoInputRef}
                        onChange={handleFileUpload}
                      />

                      <div className="grid grid-cols-2 gap-3">
                        {/* 1. Take Photo */}
                        <button
                          type="button"
                          onClick={() => handleCaptureOptionClick("photo")}
                          className="flex flex-col items-center justify-center p-5 bg-slate-950/40 hover:bg-slate-900 border border-slate-800 hover:border-slate-700 rounded-2xl transition-all group/opt active:scale-95 cursor-pointer"
                        >
                          <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center text-emerald-400 group-hover/opt:scale-110 transition-transform mb-3">
                            <Camera className="w-5.5 h-5.5" />
                          </div>
                          <span className="text-xs font-black text-white">Take Photo</span>
                          <span className="text-[9px] text-slate-500 font-mono mt-0.5">
                            {isMobileDevice ? "Mobile Camera" : "Webcam Feed"}
                          </span>
                        </button>

                        {/* 2. Record Clip */}
                        <button
                          type="button"
                          onClick={() => handleCaptureOptionClick("video")}
                          className="flex flex-col items-center justify-center p-5 bg-slate-950/40 hover:bg-slate-900 border border-slate-800 hover:border-slate-700 rounded-2xl transition-all group/opt active:scale-95 cursor-pointer"
                        >
                          <div className="w-10 h-10 rounded-xl bg-rose-500/10 flex items-center justify-center text-rose-400 group-hover/opt:scale-110 transition-transform mb-3">
                            <Film className="w-5.5 h-5.5" />
                          </div>
                          <span className="text-xs font-black text-white">Record Clip</span>
                          <span className="text-[9px] text-slate-500 font-mono mt-0.5">
                            {isMobileDevice ? "3-5s Video" : "Webcam Recorder"}
                          </span>
                        </button>

                        {/* 3. Upload File */}
                        <label className="flex flex-col items-center justify-center p-5 bg-slate-950/40 hover:bg-slate-900 border border-slate-800 hover:border-slate-700 rounded-2xl transition-all group/opt active:scale-95 cursor-pointer text-center">
                          <div className="w-10 h-10 rounded-xl bg-indigo-500/10 flex items-center justify-center text-indigo-400 group-hover/opt:scale-110 transition-transform mb-3">
                            <Upload className="w-5.5 h-5.5" />
                          </div>
                          <span className="text-xs font-black text-white">Upload File</span>
                          <span className="text-[9px] text-slate-500 font-mono mt-0.5">Image / Video</span>
                          <input 
                            type="file" 
                            accept="image/*,video/mp4,video/webm" 
                            className="hidden" 
                            onChange={handleFileUpload}
                          />
                        </label>

                        {/* 4. Live Webcam (Inline browser) */}
                        <button
                          type="button"
                          onClick={startCamera}
                          className="flex flex-col items-center justify-center p-5 bg-slate-950/40 hover:bg-slate-900 border border-slate-800 hover:border-slate-700 rounded-2xl transition-all group/opt active:scale-95 cursor-pointer"
                        >
                          <div className="w-10 h-10 rounded-xl bg-amber-500/10 flex items-center justify-center text-amber-400 group-hover/opt:scale-110 transition-transform mb-3">
                            <Sparkles className="w-5.5 h-5.5" />
                          </div>
                          <span className="text-xs font-black text-white">Live Webcam</span>
                          <span className="text-[9px] text-slate-500 font-mono mt-0.5">Browser Input</span>
                        </button>
                      </div>
                    </>
                  )}
                </div>

                {/* Preset Templates Shortcut */}
                <div className="space-y-2 border-t border-slate-800/80 pt-4">
                  <label className="block text-[10px] font-bold text-slate-400 font-mono tracking-wider">
                    ⚡ OR START INSTANTLY WITH A PRESET LOOP:
                  </label>
                  <div className="grid grid-cols-5 gap-1.5 font-sans">
                    {PRESETS.map((preset) => (
                      <button
                        key={`start-preset-${preset.name}`}
                        type="button"
                        onClick={() => selectPreset(preset.url)}
                        className="relative aspect-square rounded-xl bg-black overflow-hidden border border-slate-800 hover:border-indigo-500 transition-all active:scale-95 group/preset cursor-pointer"
                        title={preset.description}
                      >
                        {preset.url.endsWith(".mp4") ? (
                          <video src={preset.url} className="w-full h-full object-cover pointer-events-none" muted playsInline />
                        ) : (
                          <img src={preset.url} className="w-full h-full object-cover" alt="" referrerPolicy="no-referrer" />
                        )}
                        <div className="absolute inset-0 bg-black/45 group-hover/preset:bg-black/20 transition-colors" />
                        <span className="absolute bottom-1 inset-x-1 text-[8px] font-black text-white text-center truncate uppercase">
                          {preset.name}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              </motion.div>
            )}

            {/* STEP: CHOOSE TONE */}
            {step === "choose_tone" && (
              <motion.div
                key="choose_tone"
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -15 }}
                className="space-y-6 py-2 text-left"
              >
                <div className="text-center space-y-1 mb-4">
                  <h4 className="font-sans font-black text-base text-white tracking-tight uppercase">
                    SELECT REACTION TONE
                  </h4>
                  <p className="text-[11px] text-slate-400 max-w-[320px] mx-auto leading-relaxed">
                    Choose an initial creative tone direction to generate custom caption ideas and voice speech overlays.
                  </p>
                </div>

                {/* Chosen media preview card */}
                <div className="relative aspect-video rounded-2xl bg-black overflow-hidden border border-slate-800/80 flex items-center justify-center shadow-lg w-2/3 mx-auto">
                  {selectedMedia?.isVideo ? (
                    <video 
                      src={selectedMedia.data} 
                      className="w-full h-full object-cover"
                      autoPlay 
                      loop 
                      muted 
                      playsInline
                    />
                  ) : (
                    <img 
                      src={selectedMedia?.data} 
                      className="w-full h-full object-cover" 
                      alt=""
                    />
                  )}
                  <span className="absolute top-2 left-2 px-2 py-0.5 text-[8px] font-mono font-bold bg-black/60 backdrop-blur rounded-full text-indigo-300 border border-slate-800">
                    Background Loaded
                  </span>
                </div>

                {/* Tone select grid */}
                <div className="space-y-3">
                  <label className="block text-[10px] font-bold text-slate-400 font-mono tracking-wider text-center uppercase">
                    Choose one tone to trigger generator:
                  </label>
                  <div className="grid grid-cols-5 gap-1.5">
                    {[
                      { id: "funny" as const, emoji: "🎭", label: "Funny", desc: "Hilarious & witty" },
                      { id: "dramatic" as const, emoji: "🎬", label: "Drama", desc: "Intense & epic" },
                      { id: "sarcastic" as const, emoji: "🙄", label: "Sarcastic", desc: "Sassy & ironic" },
                      { id: "chill" as const, emoji: "🌊", label: "Chill", desc: "Laidback & cool" },
                      { id: "chaotic" as const, emoji: "⚡", label: "Chaos", desc: "Wild & energetic" }
                    ].map((t) => (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => {
                          setTone(t.id);
                          triggerInstantAIGenerate(t.id, selectedMedia);
                        }}
                        className="flex flex-col items-center justify-center p-3 rounded-xl border text-center transition-all bg-slate-950/40 hover:bg-indigo-600/10 border-slate-800 hover:border-indigo-500 active:scale-95 cursor-pointer"
                        title={t.desc}
                      >
                        <span className="text-xl">{t.emoji}</span>
                        <span className="text-[9px] font-black mt-1 text-white uppercase tracking-tight">{t.label}</span>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex justify-between items-center pt-2">
                  <button
                    type="button"
                    onClick={() => setStep("upload_capture")}
                    className="text-xs font-bold font-mono text-slate-400 hover:text-white px-3 py-1.5 bg-slate-950 border border-slate-800 rounded-xl cursor-pointer"
                  >
                    ← Back to media
                  </button>
                </div>
              </motion.div>
            )}

            {/* STEP 3: LOADING STATE */}
            {step === "ai_generate" && (
              <motion.div
                key="ai_generate"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="flex flex-col items-center justify-center py-16 text-center space-y-4"
              >
                <div className="relative">
                  <div className="w-14 h-14 rounded-full border-4 border-slate-800 border-t-indigo-500 animate-spin" />
                  <Sparkles className="w-5 h-5 text-indigo-400 absolute inset-0 m-auto animate-pulse" />
                </div>
                <div className="space-y-1">
                  <h4 className="font-black text-white text-sm tracking-tight flex items-center justify-center gap-1.5">
                    Generating Instant Reply...
                  </h4>
                  <p className="text-xs text-slate-400 max-w-[270px] mx-auto leading-relaxed">
                    Matching a loop template, creative voice track, and kinetic visual effect...
                  </p>
                </div>
              </motion.div>
            )}

            {/* STEP 2: PREVIEW & INTERACTION (THE ROOT OF THE DIALOG) */}
            {step === "preview" && (
              <motion.div
                key="preview"
                initial={{ opacity: 0, scale: 0.96 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0 }}
                className="space-y-4"
              >
                {/* Visual loop display */}
                <div className="relative aspect-video rounded-2xl bg-black overflow-hidden border border-slate-800/80 flex items-center justify-center shadow-inner">
                  <div className={`w-full h-full overflow-hidden flex items-center justify-center ${
                    visualEffect === "zoom" ? "animate-zoom" :
                    visualEffect === "pan" ? "animate-pan" :
                    visualEffect === "bounce" ? "animate-bounce-subtle" :
                    visualEffect === "pulse" ? "animate-pulse-subtle" :
                    visualEffect === "shake" ? "animate-shake-chaotic" :
                    visualEffect === "glitch" ? "animate-glitch" : "animate-zoom"
                  }`}>
                    {selectedMedia?.isVideo ? (
                      <div className="relative w-full h-full">
                        <video 
                          src={selectedMedia.data} 
                          className="w-full h-full object-cover"
                          autoPlay 
                          loop 
                          muted={previewMuted}
                          playsInline
                        />
                        <button
                          type="button"
                          onClick={() => setPreviewMuted(!previewMuted)}
                          className="absolute bottom-3 right-3 p-1.5 bg-black/60 hover:bg-black/80 backdrop-blur text-white rounded-lg transition-all active:scale-95 z-20 cursor-pointer border border-slate-800"
                          title={previewMuted ? "Unmute video sound" : "Mute video sound"}
                        >
                          {previewMuted ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
                        </button>
                      </div>
                    ) : (
                      <img 
                        src={selectedMedia?.data} 
                        className="w-full h-full object-cover" 
                        alt="Looping visual clip preview"
                      />
                    )}
                  </div>

                  {/* Cinema Wide Screen black bars overlay */}
                  {textStyle === "cinema" && textPosition !== "none" && (
                    <>
                      <div className="absolute top-0 inset-x-0 h-3 bg-black z-10 pointer-events-none" />
                      <div className="absolute bottom-0 inset-x-0 h-3 bg-black z-10 pointer-events-none" />
                    </>
                  )}

                  {/* Optional Big overlay text with active styles */}
                  {(() => {
                    const stylePresetClasses: Record<string, string> = {
                      classic: "font-sans font-black text-xl md:text-2xl uppercase tracking-wider drop-shadow-[0_2px_4px_rgba(0,0,0,0.9)] text-stroke-[1px_black]",
                      bold: "font-sans font-extrabold text-2xl md:text-3xl uppercase tracking-tighter drop-shadow-md",
                      comic: "font-serif italic font-black text-xl md:text-2xl lowercase tracking-wide drop-shadow-[0_3px_0_rgba(0,0,0,1)]",
                      glitch: "font-mono font-black text-lg md:text-xl uppercase tracking-widest skew-x-3 -rotate-1 skew-y-1 drop-shadow-[2px_2px_0_rgba(239,68,68,0.8)] [text-shadow:-2px_-2px_0_rgba(6,182,212,0.8)] animate-pulse",
                      cinema: "font-serif font-light text-base md:text-lg uppercase tracking-[0.25em] text-neutral-100",
                    };

                    const textColorClasses: Record<string, string> = {
                      white: "text-white",
                      yellow: "text-yellow-400",
                      red: "text-rose-500",
                      cyan: "text-cyan-400",
                    };

                    const positionClasses: Record<string, string> = {
                      top: "absolute top-4 inset-x-0 flex justify-center px-4 z-10 pointer-events-none",
                      center: "absolute inset-0 flex items-center justify-center px-4 z-10 pointer-events-none",
                      bottom: "absolute bottom-4 inset-x-0 flex justify-center px-4 z-10 pointer-events-none",
                      none: "hidden",
                    };

                    return overlayText && textPosition !== "none" ? (
                      <div className={positionClasses[textPosition] || positionClasses.center}>
                        <h2 className={`${stylePresetClasses[textStyle] || stylePresetClasses.classic} ${textColorClasses[textColor] || textColorClasses.white} text-center`}>
                          {overlayText}
                        </h2>
                      </div>
                    ) : null;
                  })()}

                  {/* Active tone flag */}
                  <span className="absolute top-3 left-3 px-2 py-0.5 text-[9px] font-mono font-bold tracking-widest bg-black/60 backdrop-blur-md rounded-full text-indigo-300 capitalize border border-slate-700/50">
                    ⚡ {tone} mode
                  </span>
                </div>

                {/* ✍️ Prominent Manual Caption Editor (No AI required by default!) */}
                <div className="bg-slate-950/40 p-4 border border-slate-800/60 rounded-2xl space-y-4 text-left">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-mono font-black tracking-widest text-indigo-400 uppercase">
                      ✍️ WRITE YOUR REACTION
                    </span>
                    
                    {/* Brainstorm with AI button */}
                    <button
                      type="button"
                      onClick={() => setIsPaywallOpen(true)}
                      className="flex items-center gap-1.5 px-2.5 py-1 text-[10px] font-black rounded-lg text-amber-300 bg-amber-500/10 hover:bg-amber-500 hover:text-black border border-amber-500/35 hover:border-amber-400 active:scale-95 transition-all cursor-pointer shadow-sm shadow-amber-500/5 group"
                      title="Unlock premium AI smart captions!"
                    >
                      <Sparkles className="w-3 h-3 text-amber-400 group-hover:animate-spin" />
                      <span>✨ AI Smart Suggestion</span>
                    </button>
                  </div>

                  <div className="space-y-4">
                    <div className="space-y-1">
                      <div className="flex items-center justify-between">
                        <label className="block text-[10px] font-bold text-slate-400 font-mono tracking-wider">
                          MEME OVERLAY TEXT:
                        </label>
                        <span className="text-[8px] text-slate-500 font-mono">{overlayText.length}/15</span>
                      </div>
                      <input 
                        type="text" 
                        value={overlayText}
                        onChange={(e) => setOverlayText(e.target.value)}
                        className="w-full px-3 py-2 bg-slate-900 border border-slate-800 focus:border-indigo-500 rounded-xl text-xs text-white focus:outline-none"
                        placeholder="e.g. MIND BLOWN"
                        maxLength={15}
                      />
                    </div>

                    {/* Visual Customization: Style, Color, Position */}
                    <div className="grid grid-cols-3 gap-2.5 pt-2 pb-0.5 border-t border-slate-800/40">
                      
                      {/* Text Style Preset Dropdown/Selector */}
                      <div className="space-y-1">
                        <label className="block text-[9px] font-bold text-slate-400 font-mono tracking-wider uppercase">
                          Style Preset:
                        </label>
                        <select
                          value={textStyle}
                          onChange={(e) => setTextStyle(e.target.value)}
                          className="w-full px-2 py-1.5 bg-slate-900 border border-slate-800 hover:border-slate-700 text-[10px] font-semibold text-slate-200 rounded-lg focus:outline-none focus:border-indigo-500 cursor-pointer transition-colors"
                        >
                          <option value="classic">Classic Meme</option>
                          <option value="bold">Heavy Impact</option>
                          <option value="comic">Comic Playful</option>
                          <option value="glitch">Glitch Cyber</option>
                          <option value="cinema">Cinema Minimal</option>
                        </select>
                      </div>

                      {/* Text Color Dropdown/Selector */}
                      <div className="space-y-1">
                        <label className="block text-[9px] font-bold text-slate-400 font-mono tracking-wider uppercase">
                          Text Color:
                        </label>
                        <select
                          value={textColor}
                          onChange={(e) => setTextColor(e.target.value)}
                          className="w-full px-2 py-1.5 bg-slate-900 border border-slate-800 hover:border-slate-700 text-[10px] font-semibold text-slate-200 rounded-lg focus:outline-none focus:border-indigo-500 cursor-pointer transition-colors"
                        >
                          <option value="white">⚪ White</option>
                          <option value="yellow">💛 Yellow</option>
                          <option value="red">❤️ Rose Red</option>
                          <option value="cyan">🩵 Neon Cyan</option>
                        </select>
                      </div>

                      {/* Text Position Dropdown/Selector */}
                      <div className="space-y-1">
                        <label className="block text-[9px] font-bold text-slate-400 font-mono tracking-wider uppercase">
                          Placement:
                        </label>
                        <select
                          value={textPosition}
                          onChange={(e) => setTextPosition(e.target.value)}
                          className="w-full px-2 py-1.5 bg-slate-900 border border-slate-800 hover:border-slate-700 text-[10px] font-semibold text-slate-200 rounded-lg focus:outline-none focus:border-indigo-500 cursor-pointer transition-colors"
                        >
                          <option value="top">Top Header</option>
                          <option value="center">Center Focus</option>
                          <option value="bottom">Bottom Footer</option>
                          <option value="none">🙈 No Text</option>
                        </select>
                      </div>

                    </div>

                    {/* 🔊 CHOOSE AUDIO TRACK TYPE (USER INTENT PRIORITIZED) */}
                    <div className="space-y-2 pt-1">
                      <label className="block text-[10px] font-bold text-slate-400 font-mono tracking-wider uppercase">
                        🔊 Audio Reaction Layer:
                      </label>
                      <div className="grid grid-cols-3 gap-2">
                        <button
                          type="button"
                          onClick={() => setAudioMode("record")}
                          className={`flex flex-col items-center justify-center p-2 rounded-xl border text-center transition-all cursor-pointer ${
                            audioMode === "record"
                              ? "bg-emerald-600/20 border-emerald-500 text-emerald-300 scale-[1.02]"
                              : "bg-slate-900/80 border-slate-800 hover:border-slate-700 text-slate-400"
                          }`}
                        >
                          <Mic className="w-4 h-4 text-emerald-400 mb-0.5" />
                          <span className="text-[9px] font-bold uppercase tracking-wider">My Voice</span>
                          <span className="text-[7.5px] text-emerald-400/80 font-mono font-medium">Real Mic</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => setAudioMode("tts")}
                          className={`flex flex-col items-center justify-center p-2 rounded-xl border text-center transition-all cursor-pointer ${
                            audioMode === "tts"
                              ? "bg-indigo-600/20 border-indigo-500 text-indigo-300 scale-[1.02]"
                              : "bg-slate-900/80 border-slate-800 hover:border-slate-700 text-slate-400"
                          }`}
                        >
                          <Volume2 className="w-4 h-4 text-indigo-400 mb-0.5" />
                          <span className="text-[9px] font-bold uppercase tracking-wider">AI Speech</span>
                          <span className="text-[7.5px] text-indigo-400/80 font-mono font-medium">Text-to-Speech</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => setAudioMode("none")}
                          className={`flex flex-col items-center justify-center p-2 rounded-xl border text-center transition-all cursor-pointer ${
                            audioMode === "none"
                              ? "bg-slate-800/60 border-slate-750 text-slate-200 scale-[1.02]"
                              : "bg-slate-900/80 border-slate-800 hover:border-slate-700 text-slate-400"
                          }`}
                        >
                          <VolumeX className="w-4 h-4 text-slate-500 mb-0.5" />
                          <span className="text-[9px] font-bold uppercase tracking-wider">No Audio</span>
                          <span className="text-[7.5px] text-slate-500 font-mono font-medium">Mute loop</span>
                        </button>
                      </div>

                      {/* Active Controls for Audio Selection */}
                      <div className="mt-2.5">
                        {audioMode === "record" && (
                          <div className="bg-emerald-950/20 border border-emerald-500/20 rounded-xl p-3 space-y-2.5 text-center">
                            <span className="block text-[9px] font-mono font-bold text-emerald-400 uppercase tracking-widest">
                              🎤 RECORD MEME SOUND (MAX 5 SECONDS)
                            </span>
                            
                            <div className="flex items-center justify-center gap-3">
                              {!recordingAudio ? (
                                <button
                                  type="button"
                                  onClick={startAudioRecording}
                                  className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-bold transition-all active:scale-95 cursor-pointer uppercase font-mono flex items-center gap-1.5"
                                >
                                  <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse shrink-0" />
                                  Start Rec
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  onClick={stopAudioRecording}
                                  className="px-3 py-1.5 bg-red-600 hover:bg-red-500 text-white rounded-lg text-xs font-bold transition-all active:scale-95 cursor-pointer uppercase font-mono flex items-center gap-1.5"
                                >
                                  <span className="w-2 h-2 rounded-sm bg-white animate-ping shrink-0" />
                                  Stop Rec
                                </button>
                              )}

                              {voiceAudioData && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    stopAllFilteredAudio();
                                    if (voiceStyle && voiceStyle !== "normal") {
                                      playFilteredAudio(voiceAudioData, voiceStyle);
                                    } else {
                                      const audio = new Audio(voiceAudioData);
                                      audio.play().catch(err => console.error("Recorded audio playback failed:", err));
                                    }
                                  }}
                                  className="px-3 py-1.5 bg-slate-900 border border-slate-800 text-slate-200 hover:text-white rounded-lg text-xs font-bold transition-all active:scale-95 cursor-pointer uppercase font-mono flex items-center gap-1"
                                >
                                  🔊 Test play
                                </button>
                              )}
                            </div>

                            {/* Recording indicator progress bar */}
                            {recordingAudio && (
                              <div className="space-y-1">
                                <div className="h-1 w-full bg-slate-800 rounded-full overflow-hidden">
                                  <div 
                                    className="h-full bg-gradient-to-r from-emerald-500 to-teal-400 transition-all duration-100"
                                    style={{ width: `${audioRecorderProgress}%` }}
                                  />
                                </div>
                                <span className="text-[8px] font-mono text-emerald-400 font-semibold block">
                                  Recording Mic Audio Track...
                                </span>
                              </div>
                            )}

                            {voiceAudioData && !recordingAudio && (
                              <div className="space-y-2">
                                <span className="text-[8px] font-mono text-emerald-400 font-semibold block">
                                  ✅ Voice track captured successfully!
                                </span>

                                {/* Browser-based DSP Voice Filters (Free/DSP) */}
                                <div className="space-y-1.5 pt-2 border-t border-emerald-950 text-left">
                                  <span className="block text-[9px] font-bold text-slate-400 font-mono uppercase tracking-wider text-center">
                                    🎙️ Choose voice effect (DSP Filter):
                                  </span>
                                  <div className="grid grid-cols-6 gap-1">
                                    {[
                                      { id: "normal", label: "Normal", emoji: "🎙️" },
                                      { id: "radio", label: "Radio", emoji: "📻" },
                                      { id: "megaphone", label: "Megaphone", emoji: "📢" },
                                      { id: "robot", label: "Robot", emoji: "🤖" },
                                      { id: "deep", label: "Deep Voice", emoji: "🦁" },
                                      { id: "chipmunk", label: "Chipmunk", emoji: "🐿️" }
                                    ].map((filterOpt) => (
                                      <button
                                        key={filterOpt.id}
                                        type="button"
                                        onClick={() => {
                                          setVoiceStyle(filterOpt.id);
                                          stopAllFilteredAudio();
                                          if (filterOpt.id !== "normal") {
                                            playFilteredAudio(voiceAudioData, filterOpt.id);
                                          } else {
                                            const audio = new Audio(voiceAudioData);
                                            audio.play().catch(err => console.error("Normal test play failed:", err));
                                          }
                                        }}
                                        className={`flex flex-col items-center justify-center p-1 rounded-lg border text-center transition-all cursor-pointer ${
                                          voiceStyle === filterOpt.id || (!voiceStyle && filterOpt.id === "normal")
                                            ? "bg-emerald-600/30 border-emerald-500 text-emerald-300 scale-[1.04]"
                                            : "bg-slate-900/60 border-slate-800/80 hover:border-slate-700 text-slate-400"
                                        }`}
                                      >
                                        <span className="text-xs">{filterOpt.emoji}</span>
                                        <span className="text-[7.5px] font-bold tracking-tight truncate max-w-full">
                                          {filterOpt.label}
                                        </span>
                                      </button>
                                    ))}
                                  </div>
                                </div>
                              </div>
                            )}
                          </div>
                        )}

                        {audioMode === "tts" && (
                          <div className="space-y-3 bg-indigo-950/20 border border-indigo-500/20 rounded-xl p-3">
                            <div className="flex items-center justify-between">
                              <label className="block text-[10px] font-bold text-indigo-400 font-mono tracking-wider uppercase">
                                Speech Sentence Overlay:
                              </label>
                              <span className="text-[8px] text-slate-500 font-mono">{voiceText.length}/50</span>
                            </div>
                            <input 
                              type="text" 
                              value={voiceText}
                              onChange={(e) => setVoiceText(e.target.value)}
                              className="w-full px-3 py-2 bg-slate-900 border border-slate-800 focus:border-indigo-500 rounded-xl text-xs text-white focus:outline-none"
                              placeholder="Type words read out loud by AI speech..."
                              maxLength={50}
                            />

                            {/* Voice Style Selector */}
                            <div className="space-y-1.5 pt-1 border-t border-indigo-900/30">
                              <span className="block text-[9px] font-bold text-slate-400 font-mono uppercase tracking-wider">
                                🎭 Voice Style Accent:
                              </span>
                              <div className="grid grid-cols-5 gap-1">
                                {[
                                  { id: "casual" as const, label: "Casual", emoji: "🗣️" },
                                  { id: "sarcastic" as const, label: "Sarcastic", emoji: "🙄" },
                                  { id: "dramatic" as const, label: "Dramatic", emoji: "🎬" },
                                  { id: "announcer" as const, label: "Announcer", emoji: "📢" },
                                  { id: "oldschool" as const, label: "Old School", emoji: "🤖" }
                                ].map((styleOption) => (
                                  <button
                                    key={styleOption.id}
                                    type="button"
                                    onClick={() => {
                                      setVoiceStyle(styleOption.id);
                                      if (voiceText) {
                                        speakText(voiceText, tone, styleOption.id);
                                      } else {
                                        speakText(`this is ${styleOption.label} mode`, tone, styleOption.id);
                                      }
                                    }}
                                    className={`flex flex-col items-center justify-center p-1 rounded-lg border text-center transition-all cursor-pointer ${
                                      voiceStyle === styleOption.id
                                        ? "bg-indigo-600/30 border-indigo-500 text-indigo-300 scale-[1.04]"
                                        : "bg-slate-900/60 border-slate-800/80 hover:border-slate-700 text-slate-400"
                                    }`}
                                  >
                                    <span className="text-xs">{styleOption.emoji}</span>
                                    <span className="text-[8px] font-bold tracking-tight truncate max-w-full">
                                      {styleOption.label}
                                    </span>
                                  </button>
                                ))}
                              </div>
                            </div>

                            {voiceText && (
                              <div className="flex items-center justify-between pt-1 text-[9px] font-mono">
                                <span className="text-slate-500">Plays selected style on loop hover</span>
                                <button
                                  type="button"
                                  onClick={() => speakText(voiceText, tone, voiceStyle)}
                                  className="text-indigo-400 hover:text-indigo-300 font-bold uppercase tracking-wider flex items-center gap-1 cursor-pointer"
                                >
                                  🔊 Hear Sample
                                </button>
                              </div>
                            )}
                          </div>
                        )}

                        {audioMode === "none" && (
                          <div className="text-center py-2 bg-slate-900/30 border border-dashed border-slate-800/80 rounded-xl text-[9px] font-mono text-slate-500">
                            Mute style reaction. This post will not contain sound effects.
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Reaction Accent Tone Selector */}
                  <div className="space-y-1.5 pt-2 border-t border-slate-800/40">
                    <label className="block text-[10px] font-bold text-slate-400 font-mono tracking-wider">
                      REACTION ACCENT STYLE:
                    </label>
                    <div className="grid grid-cols-5 gap-1">
                      {[
                        { id: "funny" as const, emoji: "🎭", label: "Funny" },
                        { id: "dramatic" as const, emoji: "🎬", label: "Drama" },
                        { id: "sarcastic" as const, emoji: "🙄", label: "Sarcasm" },
                        { id: "chill" as const, emoji: "🌊", label: "Chill" },
                        { id: "chaotic" as const, emoji: "⚡", label: "Chaos" }
                      ].map((t) => (
                        <button
                          key={t.id}
                          type="button"
                          onClick={() => setTone(t.id)}
                          className={`flex flex-col items-center justify-center py-1.5 rounded-lg border text-center transition-all cursor-pointer ${
                            tone === t.id 
                              ? "bg-indigo-600/20 border-indigo-500 text-indigo-300 scale-[1.02]" 
                              : "bg-slate-900/80 border-slate-800 hover:border-slate-700 text-slate-400"
                          }`}
                        >
                          <span className="text-sm">{t.emoji}</span>
                          <span className="text-[8px] font-bold mt-0.5 uppercase tracking-tighter">{t.label}</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Visual Kinetic Effect selector */}
                  <div className="space-y-1.5">
                    <label className="block text-[10px] font-bold text-slate-400 font-mono tracking-wider">
                      KINETIC VISUAL EFFECT:
                    </label>
                    <div className="grid grid-cols-6 gap-1">
                      {["zoom", "shake", "glitch", "pulse", "bounce", "pan"].map((eff) => (
                        <button
                          key={eff}
                          type="button"
                          onClick={() => setVisualEffect(eff)}
                          className={`py-1 text-[8px] font-mono font-black rounded border uppercase text-center transition-all cursor-pointer ${
                            visualEffect === eff
                              ? "bg-indigo-600/20 border-indigo-500 text-indigo-300"
                              : "bg-slate-900/80 border-slate-800 hover:border-slate-700 text-slate-400"
                          }`}
                        >
                          {eff}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>



                {/* Direct Action Post Button */}
                <div className="pt-1 flex gap-2">
                  <button
                    onClick={handlePostClip}
                    disabled={loading}
                    className="flex-1 flex items-center justify-center gap-2 py-3.5 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white font-black text-sm rounded-xl transition-all shadow-xl active:scale-95 disabled:opacity-50 uppercase tracking-wider cursor-pointer"
                  >
                    {loading ? (
                      <>
                        <RefreshCw className="w-5 h-5 animate-spin" /> SENDING REACTION...
                      </>
                    ) : (
                      <>
                        ⚡ SEND REACTION <Sparkles className="w-4 h-4" />
                      </>
                    )}
                  </button>

                  <button
                    onClick={handleSaveToVault}
                    type="button"
                    className={`px-4 flex items-center justify-center gap-2 py-3.5 rounded-xl border font-bold text-xs uppercase transition-all active:scale-95 cursor-pointer ${
                      isSaved 
                        ? "bg-emerald-500/10 border-emerald-500/35 text-emerald-400" 
                        : "bg-slate-950 hover:bg-slate-800 border-slate-800 text-slate-300"
                    }`}
                    title={isSaved ? "Saved to your Reactions Vault" : "Save this reaction to your Library"}
                  >
                    <Star className={`w-4 h-4 ${isSaved ? "fill-emerald-400 text-emerald-400" : "text-slate-400"}`} />
                    <span>{isSaved ? "Saved!" : "Save"}</span>
                  </button>
                </div>

                <AnimatePresence>
                  {showSaveToast && (
                    <motion.div 
                      key="save-toast-animation"
                      initial={{ opacity: 0, y: 8, scale: 0.95 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: -8, scale: 0.95 }}
                      className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-3 flex items-center gap-2.5 text-emerald-300 text-xs"
                    >
                      <div className="w-6 h-6 rounded-md bg-emerald-500/20 flex items-center justify-center text-emerald-400 flex-shrink-0 font-bold">
                        ✓
                      </div>
                      <div>
                        <p className="font-bold">Reaction Saved to Vault!</p>
                        <p className="text-[10px] text-emerald-400/75">You can reuse, tweak, or remix this reaction anytime.</p>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* ⚙️ Expandable Advanced Customize settings to prevent friction */}
                <div className="border border-slate-800 rounded-2xl overflow-hidden bg-slate-950/20">
                  <button
                    onClick={() => setShowAdvanced(!showAdvanced)}
                    className="w-full p-3 bg-slate-900/40 hover:bg-slate-900/80 flex items-center justify-between text-xs font-bold text-slate-400 transition-colors"
                  >
                    <span className="flex items-center gap-1.5 font-mono">
                      <Sliders className="w-3.5 h-3.5 text-indigo-400" />
                      {showAdvanced ? "HIDE ADVANCED CONTROLS" : "✏️ MANAGE BACKGROUNDS / LOAD SAVED REACTION"}
                    </span>
                    {showAdvanced ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  </button>

                  {showAdvanced && (
                    <div className="p-4 border-t border-slate-800/80 space-y-4 bg-slate-950/10">
                      
                      {/* Saved Reactions Library Quick Load */}
                      {savedReactions.length > 0 && (
                        <div className="space-y-2 border-b border-slate-800/60 pb-4">
                          <label className="block text-[10px] font-bold text-amber-400 font-mono tracking-wider uppercase flex items-center gap-1">
                            <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" /> USE A SAVED REACTION ({savedReactions.length}):
                          </label>
                          <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-none">
                            {savedReactions.map((reax) => (
                              <button
                                key={`modal-reax-${reax.id}`}
                                type="button"
                                onClick={() => {
                                  setSelectedMedia({ data: reax.mediaUrl, mimeType: reax.mediaUrl.endsWith(".mp4") || reax.mediaUrl.endsWith(".webm") ? "video/mp4" : "image/jpeg", isVideo: reax.mediaUrl.endsWith(".mp4") || reax.mediaUrl.endsWith(".webm") });
                                  setVoiceText(reax.voiceText || "");
                                  setOverlayText(reax.overlayText || "");
                                  setTone(reax.tone);
                                  const [parsedEffect = "zoom", parsedStyle = "classic", parsedColor = "white", parsedPosition = "center"] = (reax.effect || "zoom").split("|");
                                  setVisualEffect(parsedEffect);
                                  setTextStyle(parsedStyle);
                                  setTextColor(parsedColor);
                                  setTextPosition(parsedPosition);
                                  if (reax.voiceStyle) {
                                    setVoiceStyle(reax.voiceStyle);
                                  }
                                  setIsSaved(true);
                                }}
                                className="relative w-16 h-16 rounded-xl bg-black overflow-hidden flex-shrink-0 border border-slate-800 hover:border-amber-400 transition-all active:scale-95 group/saveditem"
                                title={`Tone: ${reax.tone}. Voice: "${reax.voiceText}"`}
                              >
                                {reax.mediaUrl.endsWith(".mp4") || reax.mediaUrl.endsWith(".webm") ? (
                                  <video src={reax.mediaUrl} className="w-full h-full object-cover pointer-events-none" muted playsInline />
                                ) : (
                                  <img src={reax.mediaUrl} className="w-full h-full object-cover" alt="" referrerPolicy="no-referrer" />
                                )}
                                <div className="absolute inset-0 bg-black/40 group-hover/saveditem:bg-black/10 transition-colors" />
                                <div className="absolute top-1 right-1 bg-black/60 backdrop-blur rounded-sm px-1 text-[7px] font-mono text-amber-300 font-bold uppercase">
                                  {reax.tone}
                                </div>
                                {reax.overlayText && (
                                  <div className="absolute bottom-1 inset-x-1 text-[7px] font-sans font-black text-white text-center truncate uppercase bg-black/40 px-0.5 rounded">
                                    {reax.overlayText}
                                  </div>
                                )}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Tone Preset Selectors */}
                      <div className="space-y-2">
                        <label className="block text-[10px] font-bold text-slate-400 font-mono tracking-wider">
                          1. CHOOSE REACTION TONE:
                        </label>
                        <div className="grid grid-cols-5 gap-1">
                          {[
                            { id: "funny" as const, emoji: "🎭", label: "Funny" },
                            { id: "dramatic" as const, emoji: "🎬", label: "Drama" },
                            { id: "sarcastic" as const, emoji: "🙄", label: "Sarcasm" },
                            { id: "chill" as const, emoji: "🌊", label: "Chill" },
                            { id: "chaotic" as const, emoji: "⚡", label: "Chaos" }
                          ].map((t) => (
                            <button
                              key={t.id}
                              onClick={() => handleCustomToneChange(t.id)}
                              className={`flex flex-col items-center justify-center py-1.5 rounded-lg border text-center transition-all ${
                                tone === t.id 
                                  ? "bg-indigo-600/20 border-indigo-500 text-indigo-300" 
                                  : "bg-slate-900/80 border-slate-800 hover:border-slate-700 text-slate-400"
                              }`}
                            >
                              <span className="text-sm">{t.emoji}</span>
                              <span className="text-[8px] font-medium mt-0.5">{t.label}</span>
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Custom Overlay & TTS Input Overrides */}
                      <div className="grid grid-cols-2 gap-3.5">
                        <div className="space-y-1">
                          <label className="block text-[10px] font-bold text-slate-400 tracking-wider font-mono">
                            2. OVERLAY TEXT:
                          </label>
                          <input 
                            type="text" 
                            value={overlayText}
                            onChange={(e) => setOverlayText(e.target.value)}
                            className="w-full px-3 py-2 bg-slate-900 border border-slate-800 focus:border-indigo-500 rounded-xl text-xs text-white focus:outline-none"
                            maxLength={15}
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="block text-[10px] font-bold text-slate-400 tracking-wider font-mono">
                            3. AI VOICE STATEMENT:
                          </label>
                          <input 
                            type="text" 
                            value={voiceText}
                            onChange={(e) => setVoiceText(e.target.value)}
                            className="w-full px-3 py-2 bg-slate-900 border border-slate-800 focus:border-indigo-500 rounded-xl text-xs text-white focus:outline-none"
                            maxLength={50}
                          />
                        </div>
                      </div>

                      <div className="border-t border-slate-800/60 my-2"></div>

                      {/* Hardware / Custom Upload Buttons */}
                      <div className="space-y-2">
                        <label className="block text-[10px] font-bold text-slate-400 font-mono tracking-wider">
                          4. CAPTURE / UPLOAD NEW BACKGROUND:
                        </label>
                        
                        {cameraActive ? (
                          <div className="relative aspect-video rounded-xl bg-black overflow-hidden border border-slate-800">
                            <video 
                              ref={videoRef} 
                              className="w-full h-full object-cover scale-x-[-1]" 
                              playsInline 
                              muted 
                            />
                            {recording && (
                              <div className="absolute inset-x-0 bottom-0 p-3 bg-gradient-to-t from-black/80 to-transparent flex flex-col gap-1">
                                <div className="flex items-center justify-between text-[10px] text-white font-mono">
                                  <span className="flex items-center gap-1.5 text-red-400 font-bold animate-pulse">
                                    🔴 RECORDING 3S LOOP
                                  </span>
                                  <span>{Math.round(recordProgress)}%</span>
                                </div>
                                <div className="w-full h-1 bg-slate-800 rounded-full overflow-hidden">
                                  <div className="h-full bg-red-500" style={{ width: `${recordProgress}%` }} />
                                </div>
                              </div>
                            )}
                            <div className="absolute top-2 right-2">
                              <button 
                                onClick={stopCamera}
                                className="px-2 py-0.5 text-[9px] font-bold font-mono bg-slate-900 border border-slate-700 text-slate-300 rounded"
                              >
                                Cancel Camera
                              </button>
                            </div>
                            {!recording && (
                              <div className="absolute inset-x-0 bottom-3 flex justify-center gap-2">
                                <button
                                  onClick={capturePhoto}
                                  className="flex items-center gap-1 px-3 py-1 bg-indigo-600 hover:bg-indigo-500 text-[10px] font-bold rounded-full text-white"
                                >
                                  <Camera className="w-3.5 h-3.5" /> Snap Photo
                                </button>
                                <button
                                  onClick={startVideoRecording}
                                  className="flex items-center gap-1 px-3 py-1 bg-rose-600 hover:bg-rose-500 text-[10px] font-bold rounded-full text-white"
                                >
                                  <Film className="w-3.5 h-3.5" /> Record Video (3s)
                                </button>
                              </div>
                            )}
                          </div>
                        ) : (
                          <>
                            {/* Hidden Mobile Native Capture Inputs */}
                            <input 
                              type="file" 
                              accept="image/*" 
                              capture="user" 
                              className="hidden" 
                              ref={photoInputRef}
                              onChange={handleFileUpload}
                            />
                            <input 
                              type="file" 
                              accept="video/mp4,video/webm" 
                              capture="user" 
                              className="hidden" 
                              ref={videoInputRef}
                              onChange={handleFileUpload}
                            />

                            <div className="grid grid-cols-2 gap-2">
                              {/* 1. Take Photo (Mobile native camera capture) */}
                              <button
                                type="button"
                                onClick={() => photoInputRef.current?.click()}
                                className="flex items-center justify-center gap-1.5 py-2.5 bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded-xl text-xs font-semibold text-slate-200 cursor-pointer active:scale-95 transition-all"
                                title="Take a photo with your mobile camera"
                              >
                                <Camera className="w-4 h-4 text-emerald-400" /> Take Photo
                              </button>

                              {/* 2. Record Clip (Mobile native video capture) */}
                              <button
                                type="button"
                                onClick={() => videoInputRef.current?.click()}
                                className="flex items-center justify-center gap-1.5 py-2.5 bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded-xl text-xs font-semibold text-slate-200 cursor-pointer active:scale-95 transition-all"
                                title="Record a short video clip with your mobile camera"
                              >
                                <Film className="w-4 h-4 text-rose-400" /> Record Clip
                              </button>

                              {/* 3. Upload File */}
                              <label className="flex items-center justify-center gap-1.5 py-2.5 bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded-xl text-xs font-semibold text-slate-200 cursor-pointer active:scale-95 transition-all">
                                <Upload className="w-4 h-4 text-indigo-400" /> Upload File
                                <input 
                                  type="file" 
                                  accept="image/*,video/mp4,video/webm" 
                                  className="hidden" 
                                  onChange={handleFileUpload}
                                />
                              </label>

                              {/* 4. Live Webcam (Inline browser capture fallback) */}
                              <button
                                type="button"
                                onClick={startCamera}
                                className="flex items-center justify-center gap-1.5 py-2.5 bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded-xl text-xs font-semibold text-slate-200 cursor-pointer active:scale-95 transition-all"
                                title="Use your computer's built-in webcam"
                              >
                                <Sparkles className="w-4 h-4 text-amber-400" /> Live Webcam
                              </button>
                            </div>
                          </>
                        )}
                      </div>

                      {/* Presets template tray */}
                      <div className="space-y-1.5">
                        <span className="block text-[10px] font-bold text-slate-500 font-mono">
                          5. PRESET MEME SLIDES:
                        </span>
                        <div className="grid grid-cols-5 gap-1">
                          {PRESETS.map((preset, idx) => (
                            <button
                              key={`preset_${idx}_${preset.name}`}
                              onClick={() => selectPreset(preset.url)}
                              className="relative aspect-square rounded-lg bg-black overflow-hidden border border-slate-800 hover:border-slate-500 transition-all flex items-center justify-center"
                              title={preset.description}
                            >
                              {preset.url.endsWith(".mp4") ? (
                                <video src={preset.url} className="w-full h-full object-cover pointer-events-none" muted playsInline loop autoPlay />
                              ) : (
                                <img src={preset.url} className="w-full h-full object-cover" alt={preset.name} />
                              )}
                              <div className="absolute inset-x-0 bottom-0 bg-black/60 p-0.5 text-[8px] font-mono text-center text-slate-300 truncate">
                                {preset.name}
                              </div>
                            </button>
                          ))}
                        </div>
                      </div>

                    </div>
                  )}
                </div>

              </motion.div>
            )}

          </AnimatePresence>
        </div>

        {/* GEMINI PRO AI CO-PILOT PAYWALL MODAL */}
        {isPaywallOpen && (
          <div className="fixed inset-0 z-55 bg-black/95 backdrop-blur-md flex items-center justify-center p-4">
            <div className="w-full max-w-sm bg-slate-950 border border-amber-500/25 rounded-3xl p-6 shadow-2xl relative overflow-hidden text-center space-y-6">
              {/* Amber/Gold radial highlight */}
              <div className="absolute top-0 left-1/2 -translate-x-1/2 w-48 h-[1px] bg-gradient-to-r from-transparent via-amber-400/40 to-transparent" />
              <div className="absolute -top-12 left-1/2 -translate-x-1/2 w-32 h-32 bg-amber-500/5 blur-3xl rounded-full" />
              
              <div className="space-y-4">
                <div className="w-11 h-11 rounded-2xl bg-amber-500/10 border border-amber-500/25 flex items-center justify-center text-amber-400 mx-auto">
                  <Star className="w-5.5 h-5.5 animate-pulse" />
                </div>
                
                <div className="space-y-1">
                  <div className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/25 text-[8px] font-mono font-bold text-amber-400 uppercase tracking-widest">
                    👑 Premium AI Co-Pilot
                  </div>
                  <h3 className="font-sans font-black text-sm uppercase tracking-tight text-slate-100">
                    Pro Smart Assist
                  </h3>
                  <p className="text-[10px] text-slate-400 font-mono uppercase tracking-wider max-w-[240px] mx-auto leading-relaxed">
                    Live visual context analysis and smart captioning
                  </p>
                </div>
              </div>

              {/* Feature Highlights */}
              <div className="space-y-2.5 text-left bg-slate-900/40 p-4 border border-slate-900 rounded-2xl">
                <div className="flex gap-2 items-start text-xs text-slate-300">
                  <span className="text-amber-400 text-xs mt-0.5">✨</span>
                  <div>
                    <strong className="text-white block font-sans text-[11px] uppercase tracking-wide">Visual Scene Parsing</strong>
                    <span className="text-[10px] text-slate-400">Our smart engine analyzes webcam feeds & background templates to suggest highly contextual captions.</span>
                  </div>
                </div>
                
                <div className="flex gap-2 items-start text-xs text-slate-300 border-t border-slate-950 pt-2.5">
                  <span className="text-amber-400 text-xs mt-0.5">🎤</span>
                  <div>
                    <strong className="text-white block font-sans text-[11px] uppercase tracking-wide">Tone Modulation</strong>
                    <span className="text-[10px] text-slate-400">Matches natural humor, drama, sarcasm, and cozy waves precisely to your vocal clips.</span>
                  </div>
                </div>
              </div>

              <div className="bg-amber-950/15 border border-amber-500/10 rounded-xl p-3.5 text-left">
                <p className="text-[9px] font-mono text-amber-400 leading-normal uppercase">
                  ⚡ <strong>FREE BETA NOTICE:</strong> To keep Reax 100% free and blazing fast during our Vercel & Supabase Beta, direct live AI analysis is restricted. Enjoy our local template generators for free!
                </p>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setIsPaywallOpen(false)}
                  className="py-2.5 bg-slate-900 hover:bg-slate-850 border border-slate-800 text-slate-400 hover:text-slate-300 rounded-xl text-[10px] font-mono font-bold transition-all active:scale-95 uppercase tracking-wider cursor-pointer"
                >
                  Close
                </button>
                <button
                  type="button"
                  onClick={() => setIsPaywallOpen(false)}
                  className="py-2.5 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-sans font-black rounded-xl text-[10px] transition-all active:scale-95 uppercase tracking-wider cursor-pointer shadow-lg shadow-amber-500/10"
                >
                  Unlock Pro ($0.00)
                </button>
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
