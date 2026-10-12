import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X, Mic, Square, Play, Pause, RotateCcw, Loader2, Send } from "lucide-react";
import { Clip } from "../types";
import { uploadMediaAsset, getAuthToken } from "../utils/supabaseClient";
import { protectedMediaProps, blockMediaEvent } from "../utils/mediaProtection";
import { useBodyScrollLock } from "../hooks/useBodyScrollLock";
import { useBackToClose } from "../hooks/useBackToClose";
import { VOICE_IT_MAX_MS, pickAudioMime } from "../utils/voiceIt";

interface VoiceItModalProps {
  key?: string;
  parentClip: Clip;
  username: string;
  onClose: () => void;
  onSuccess: () => void;
}

type Phase = "idle" | "recording" | "review";

export default function VoiceItModal({ parentClip, username, onClose, onSuccess }: VoiceItModalProps) {
  useBodyScrollLock(true);
  useBackToClose(true, onClose);

  const [phase, setPhase] = useState<Phase>("idle");
  const [elapsedMs, setElapsedMs] = useState(0);
  const [blob, setBlob] = useState<Blob | null>(null);
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [caption, setCaption] = useState("");
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<any>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const discardRef = useRef(false);

  const stopTracks = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  };

  const clearTimer = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
  };

  // Cleanup on unmount: release mic, stop playback, free blob URL
  useEffect(() => {
    return () => {
      clearTimer();
      discardRef.current = true;
      if (recorderRef.current && recorderRef.current.state !== "inactive") {
        try { recorderRef.current.stop(); } catch {}
      }
      stopTracks();
      audioRef.current?.pause();
    };
  }, []);
  useEffect(() => () => { if (blobUrl) URL.revokeObjectURL(blobUrl); }, [blobUrl]);

  const stopRecording = () => {
    clearTimer();
    if (recorderRef.current && recorderRef.current.state !== "inactive") {
      try { recorderRef.current.stop(); } catch {}
    }
  };

  const startRecording = async () => {
    setError(null);
    audioRef.current?.pause();
    setIsPlaying(false);
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setError("Voice recording isn't supported in this browser. Try Safari or Chrome.");
      return;
    }
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (err: any) {
      const name = err?.name || "";
      if (name === "NotAllowedError" || name === "SecurityError" || name === "PermissionDeniedError") {
        setError("Microphone access is blocked. Allow the microphone for this site in your browser settings (on iPhone: Settings › Safari › Microphone), then try again.");
      } else if (name === "NotFoundError" || name === "DevicesNotFoundError") {
        setError("No microphone was found on this device.");
      } else {
        setError("Couldn't start the microphone. Please try again.");
      }
      return;
    }
    streamRef.current = stream;
    chunksRef.current = [];
    discardRef.current = false;

    const mime = pickAudioMime();
    let recorder: MediaRecorder;
    try {
      recorder = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
    } catch {
      recorder = new MediaRecorder(stream);
    }
    recorderRef.current = recorder;

    recorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
    };
    recorder.onstop = () => {
      stopTracks();
      if (discardRef.current || chunksRef.current.length === 0) {
        setPhase(blob ? "review" : "idle");
        return;
      }
      const type = (recorder.mimeType || mime || "audio/webm").split(";")[0];
      const out = new Blob(chunksRef.current, { type });
      setBlob(out);
      setBlobUrl(URL.createObjectURL(out));
      setPhase("review");
    };

    recorder.start();
    setPhase("recording");
    setElapsedMs(0);
    const startedAt = Date.now();
    timerRef.current = setInterval(() => {
      const ms = Date.now() - startedAt;
      setElapsedMs(Math.min(ms, VOICE_IT_MAX_MS));
      if (ms >= VOICE_IT_MAX_MS) stopRecording();
    }, 100);
  };

  const togglePlayback = () => {
    if (!blobUrl) return;
    if (!audioRef.current) audioRef.current = new Audio();
    const a = audioRef.current;
    if (isPlaying) {
      a.pause();
      setIsPlaying(false);
      return;
    }
    if (a.src !== blobUrl) a.src = blobUrl;
    a.currentTime = 0;
    a.onended = () => setIsPlaying(false);
    a.play().then(() => setIsPlaying(true)).catch(() => setIsPlaying(false));
  };

  const reRecord = () => {
    audioRef.current?.pause();
    setIsPlaying(false);
    setBlob(null);
    setBlobUrl(null);
    setPhase("idle");
    startRecording();
  };

  const handlePost = async () => {
    if (!blob || posting) return;
    setPosting(true);
    setError(null);
    audioRef.current?.pause();
    setIsPlaying(false);
    try {
      const mimeType = blob.type || "audio/webm";
      const up = await uploadMediaAsset({
        file: blob,
        kind: "audio",
        mimeType,
        filename: `voice-it-${Date.now()}`
      });
      if (!up?.url) throw new Error("Failed to upload your voice recording. Please try again.");

      const token = await getAuthToken();
      const parentAuthor = parentClip.originalAuthor || parentClip.authorName;
      const payload: Record<string, any> = {
        parentId: parentClip.id,
        // Reuse the parent picture as-is (already an https storage URL, no re-upload)
        mediaUrl: parentClip.mediaUrl,
        mediaType: "image",
        voiceText: `audio_url:${up.url}`,
        voiceAudioUrl: up.url,
        voiceStyle: "normal",
        tone: parentClip.tone || "funny",
        authorName: username || "Guest",
        effect: "zoom|classic|white|bottom",
        overlayText: caption.trim().slice(0, 48),
        originalAuthor: parentAuthor && parentAuthor !== username ? parentAuthor : undefined
      };

      const res = await fetch("/api/clips", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(payload)
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        if (res.status === 403 && errData.error === "signup_required") {
          window.dispatchEvent(new CustomEvent("reax_upgrade_trigger", {
            detail: { reason: "post_limit", clipCount: errData.clipCount || 3 }
          }));
          onClose();
          return;
        }
        throw new Error(errData.error || "Failed to post your voice reply.");
      }
      window.dispatchEvent(new Event("reax_clip_posted"));
      window.dispatchEvent(new CustomEvent("reax_toast", { detail: { message: "Voice reply posted 🎤" } }));
      onSuccess();
    } catch (err: any) {
      if (err?.signupRequired) {
        onClose();
        return;
      }
      setError(err?.message || "Failed to post your voice reply.");
    } finally {
      setPosting(false);
    }
  };

  const secondsLeft = Math.max(0, Math.ceil((VOICE_IT_MAX_MS - elapsedMs) / 1000));
  const progressPct = Math.min(100, (elapsedMs / VOICE_IT_MAX_MS) * 100);

  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[60] bg-black/85 flex items-end sm:items-center justify-center p-3"
      onClick={(e) => { e.stopPropagation(); if (!posting && phase !== "recording") onClose(); }}
      role="dialog"
      aria-modal="true"
      aria-label="Voice it"
    >
      <div
        className="w-full max-w-sm bg-slate-950 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800">
          <div className="flex items-center gap-2 text-sm font-bold text-slate-100">
            <Mic className="w-4 h-4 text-emerald-400" />
            <span>Voice it</span>
            <span className="text-[11px] font-normal text-slate-400 truncate max-w-[10rem]">on @{parentClip.authorName}</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={posting}
            aria-label="Close"
            className="p-1.5 rounded-full bg-slate-900 border border-slate-700 text-slate-300 hover:bg-slate-800 cursor-pointer disabled:opacity-50"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Same parent picture */}
        <div className="relative bg-black flex items-center justify-center max-h-[45vh] reax-protected-media" onContextMenu={blockMediaEvent}>
          <img
            src={parentClip.mediaUrl}
            alt={`Post by ${parentClip.authorName}`}
            referrerPolicy="no-referrer"
            className="max-h-[45vh] w-full object-contain"
            {...protectedMediaProps}
          />
          {caption.trim() && (
            <div className="absolute bottom-3 inset-x-0 px-4 text-center pointer-events-none">
              <span className="font-sans font-black text-sm uppercase tracking-wider text-white drop-shadow-[0_2px_4px_rgba(0,0,0,0.9)]">
                {caption.trim().slice(0, 48)}
              </span>
            </div>
          )}
          {phase === "recording" && (
            <div className="absolute top-2 left-2 flex items-center gap-1.5 px-2 py-1 rounded-md bg-rose-600/90 text-white text-[11px] font-mono font-bold">
              <span className="w-2 h-2 rounded-full bg-white animate-pulse" />
              REC {secondsLeft}s
            </div>
          )}
        </div>

        <div className="p-4 space-y-3">
          {phase !== "review" && (
            <div className="flex flex-col items-center gap-2">
              <button
                type="button"
                onClick={phase === "recording" ? stopRecording : startRecording}
                aria-label={phase === "recording" ? "Stop recording" : "Start recording"}
                className={`w-16 h-16 rounded-full flex items-center justify-center border-2 transition-all active:scale-95 cursor-pointer ${
                  phase === "recording" ? "bg-rose-600 border-rose-300 animate-pulse" : "bg-emerald-600 hover:bg-emerald-500 border-emerald-300"
                }`}
              >
                {phase === "recording" ? <Square className="w-6 h-6 text-white fill-white" /> : <Mic className="w-7 h-7 text-white" />}
              </button>
              <div className="w-full h-1.5 rounded-full bg-slate-800 overflow-hidden">
                <div className="h-full bg-rose-500 transition-[width] duration-100" style={{ width: `${phase === "recording" ? progressPct : 0}%` }} />
              </div>
              <p className="text-xs text-slate-400">
                {phase === "recording" ? `Recording… ${secondsLeft}s left (tap to stop)` : `Tap to record up to ${VOICE_IT_MAX_MS / 1000} seconds`}
              </p>
            </div>
          )}

          {phase === "review" && (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={togglePlayback}
                className="flex-1 flex items-center justify-center gap-2 px-3 py-2 min-h-[40px] rounded-lg border border-slate-700 bg-slate-900 hover:bg-slate-800 text-slate-200 text-sm font-bold cursor-pointer"
              >
                {isPlaying ? <Pause className="w-4 h-4 text-emerald-400" /> : <Play className="w-4 h-4 text-emerald-400" />}
                {isPlaying ? "Pause" : "Listen back"}
              </button>
              <button
                type="button"
                onClick={reRecord}
                disabled={posting}
                className="flex items-center justify-center gap-2 px-3 py-2 min-h-[40px] rounded-lg border border-slate-700 bg-slate-900 hover:bg-slate-800 text-slate-300 text-sm font-bold cursor-pointer disabled:opacity-50"
              >
                <RotateCcw className="w-4 h-4" />
                Re-record
              </button>
            </div>
          )}

          <input
            type="text"
            value={caption}
            onChange={(e) => setCaption(e.target.value.slice(0, 48))}
            maxLength={48}
            placeholder="Optional caption"
            className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-800 text-base sm:text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500"
          />

          {error && <p className="text-xs text-rose-400" role="alert">{error}</p>}

          <button
            type="button"
            onClick={handlePost}
            disabled={!blob || posting || phase === "recording"}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 min-h-[44px] rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-bold cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {posting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            {posting ? "Posting…" : "Post"}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
