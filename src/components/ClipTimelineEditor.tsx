import React, { useState, useRef, useEffect, useCallback } from "react";
import { Play, Pause, Volume2, VolumeX, RotateCcw, Sparkles, Check, X, Scissors, MoveHorizontal } from "lucide-react";

interface ClipTimelineEditorProps {
  file: File;
  sourceUrl: string;
  duration: number; // in seconds
  initialStart?: number;
  initialWindowDuration?: number;
  initialStripAudio?: boolean;
  onApplyTrim: (trim: { start: number; windowDuration: number; stripAudio?: boolean }) => void;
  onCancel: () => void;
}

// Format seconds into MM:SS.s or M:SS.s
function formatTime(sec: number): string {
  if (isNaN(sec) || sec < 0) sec = 0;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${s < 10 ? "0" : ""}${s.toFixed(1)}`;
}

export default function ClipTimelineEditor({
  file,
  sourceUrl,
  duration,
  initialStart = 0,
  initialWindowDuration = 6.0,
  initialStripAudio = false,
  onApplyTrim,
  onCancel
}: ClipTimelineEditorProps) {
  // Safe bounds check on initial duration
  const safeInitialWindow = Math.min(6.0, Math.max(1.0, initialWindowDuration, duration <= 6.0 ? duration : 6.0));
  const safeInitialStart = Math.min(initialStart, Math.max(0, duration - safeInitialWindow));

  const [start, setStart] = useState<number>(safeInitialStart);
  const [windowDuration, setWindowDuration] = useState<number>(safeInitialWindow);
  const [currentTime, setCurrentTime] = useState<number>(safeInitialStart);
  const [isPlaying, setIsPlaying] = useState<boolean>(true);
  const [isMuted, setIsMuted] = useState<boolean>(initialStripAudio);
  const [previewLoop, setPreviewLoop] = useState<boolean>(true);
  const [isAnalyzingAudio, setIsAnalyzingAudio] = useState<boolean>(false);
  const [audioPeakFound, setAudioPeakFound] = useState<boolean>(false);

  // Real-time drag tracking refs (to prevent stale React state jump on pointer-up)
  const windowStartRef = useRef<number>(safeInitialStart);
  const windowEndRef = useRef<number>(safeInitialStart + safeInitialWindow);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const timelineRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<{
    mode: "left" | "right" | "move" | null;
    startX: number;
    initialStart: number;
    initialDuration: number;
  }>({
    mode: null,
    startX: 0,
    initialStart: 0,
    initialDuration: 0
  });

  // Sync refs when start or windowDuration updates outside active drag
  useEffect(() => {
    if (!dragRef.current.mode) {
      windowStartRef.current = start;
      windowEndRef.current = start + windowDuration;
    }
  }, [start, windowDuration]);

  // Keep video looped within [start, start + windowDuration] when previewLoop is on
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const handleTimeUpdate = () => {
      setCurrentTime(video.currentTime);
      if (previewLoop) {
        const loopStart = windowStartRef.current;
        const loopEnd = windowEndRef.current;
        if (video.currentTime >= loopEnd - 0.05 || video.currentTime < loopStart) {
          video.currentTime = loopStart;
          if (video.paused && isPlaying) {
            video.play().catch(() => {});
          }
        }
      }
    };

    video.addEventListener("timeupdate", handleTimeUpdate);
    return () => {
      video.removeEventListener("timeupdate", handleTimeUpdate);
    };
  }, [previewLoop, isPlaying]);

  // Initial video start position
  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.currentTime = start;
      videoRef.current.play().then(() => setIsPlaying(true)).catch(() => {
        // Autoplay policy fallback: mute and play
        if (videoRef.current) {
          videoRef.current.muted = true;
          setIsMuted(true);
          videoRef.current.play().then(() => setIsPlaying(true)).catch(() => setIsPlaying(false));
        }
      });
    }
  }, []);

  const togglePlay = () => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      const curStart = windowStartRef.current;
      const curEnd = windowEndRef.current;
      if (video.currentTime < curStart || video.currentTime >= curEnd) {
        video.currentTime = curStart;
      }
      video.play().then(() => setIsPlaying(true)).catch(() => {});
    } else {
      video.pause();
      setIsPlaying(false);
    }
  };

  const toggleMute = () => {
    const video = videoRef.current;
    if (!video) return;
    video.muted = !video.muted;
    setIsMuted(video.muted);
  };

  // Drag interaction handlers
  const handlePointerDown = (e: React.PointerEvent, mode: "left" | "right" | "move") => {
    e.preventDefault();
    e.stopPropagation();

    // Pause video during scrub for responsiveness
    if (videoRef.current && !videoRef.current.paused) {
      videoRef.current.pause();
      setIsPlaying(false);
    }

    const currentRefStart = windowStartRef.current;
    const currentRefDuration = windowEndRef.current - windowStartRef.current;

    dragRef.current = {
      mode,
      startX: e.clientX,
      initialStart: currentRefStart,
      initialDuration: currentRefDuration
    };

    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);

    const onPointerMove = (moveEvent: PointerEvent) => {
      if (!timelineRef.current || !dragRef.current.mode) return;
      const rect = timelineRef.current.getBoundingClientRect();
      if (rect.width <= 0) return;

      const deltaX = moveEvent.clientX - dragRef.current.startX;
      const deltaSec = (deltaX / rect.width) * duration;

      if (dragRef.current.mode === "move") {
        // Shift entire window, keeping windowDuration constant
        const currentWinDuration = dragRef.current.initialDuration;
        const maxStart = Math.max(0, duration - currentWinDuration);
        const newStart = Math.max(0, Math.min(maxStart, dragRef.current.initialStart + deltaSec));
        const newEnd = newStart + currentWinDuration;

        // Update these refs on every pointer-move
        windowStartRef.current = newStart;
        windowEndRef.current = newEnd;

        // Keep React state for rendering only
        setStart(newStart);
        setWindowDuration(currentWinDuration);

        // Prevent preview jitter by updating currentTime inside the pointer-move handler
        if (videoRef.current) {
          videoRef.current.currentTime = newStart;
        }
      } else if (dragRef.current.mode === "left") {
        // Drag left handle: change start time, keep right boundary constant
        const fixedEnd = dragRef.current.initialStart + dragRef.current.initialDuration;
        let proposedStart = dragRef.current.initialStart + deltaSec;
        proposedStart = Math.max(0, proposedStart);

        // Clamp duration between 1.0s and 6.0s
        if (fixedEnd - proposedStart < 1.0) {
          proposedStart = fixedEnd - 1.0;
        } else if (fixedEnd - proposedStart > 6.0) {
          proposedStart = fixedEnd - 6.0;
        }

        proposedStart = Math.max(0, proposedStart);
        const newDuration = fixedEnd - proposedStart;

        // Update these refs on every pointer-move
        windowStartRef.current = proposedStart;
        windowEndRef.current = fixedEnd;

        // Keep React state for rendering only
        setStart(proposedStart);
        setWindowDuration(newDuration);

        // Prevent preview jitter by updating currentTime inside the pointer-move handler
        if (videoRef.current) {
          videoRef.current.currentTime = proposedStart;
        }
      } else if (dragRef.current.mode === "right") {
        // Drag right handle: change end time, keep left boundary constant
        const fixedStart = dragRef.current.initialStart;
        let proposedDuration = dragRef.current.initialDuration + deltaSec;

        // Clamp duration between 1.0s and 6.0s
        proposedDuration = Math.max(1.0, Math.min(6.0, proposedDuration));

        // Don't exceed total video duration
        if (fixedStart + proposedDuration > duration) {
          proposedDuration = duration - fixedStart;
        }
        const newEnd = fixedStart + proposedDuration;

        // Update these refs on every pointer-move
        windowStartRef.current = fixedStart;
        windowEndRef.current = newEnd;

        // Keep React state for rendering only
        setStart(fixedStart);
        setWindowDuration(proposedDuration);

        // Prevent preview jitter by updating currentTime inside the pointer-move handler
        if (videoRef.current) {
          videoRef.current.currentTime = newEnd;
        }
      }
    };

    const onPointerUp = (upEvent: PointerEvent) => {
      dragRef.current.mode = null;
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerUp);

      // On pointer-up, use the ref values, not React state!
      const finalStart = windowStartRef.current;

      // Ensure video.currentTime updates using the latest ref values
      if (videoRef.current) {
        videoRef.current.currentTime = finalStart;
        videoRef.current.play().then(() => setIsPlaying(true)).catch(() => {});
      }
    };

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", onPointerUp);
  };

  // Jump window to position when clicking on track
  const handleTrackClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!timelineRef.current || dragRef.current.mode) return;
    const rect = timelineRef.current.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const clickSec = (clickX / rect.width) * duration;

    // Center the current window around clickSec, clamped
    const halfWin = windowDuration / 2;
    const newStart = Math.max(0, Math.min(duration - windowDuration, clickSec - halfWin));
    setStart(newStart);
    if (videoRef.current) {
      videoRef.current.currentTime = newStart;
      if (videoRef.current.paused) {
        videoRef.current.play().then(() => setIsPlaying(true)).catch(() => {});
      }
    }
  };

  // Intelligent "Snap to Moment" (Samples audio energy for peak action)
  const snapToMoment = async () => {
    setIsAnalyzingAudio(true);
    setAudioPeakFound(false);
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) {
        // Fallback: jump to 20% or 33% of video
        const fallback = Math.max(0, Math.min(duration - windowDuration, duration * 0.25));
        setStart(fallback);
        if (videoRef.current) videoRef.current.currentTime = fallback;
        setAudioPeakFound(true);
        return;
      }

      const audioCtx = new AudioCtx();
      // Read first 15MB or entire file
      const slice = file.size > 15 * 1024 * 1024 ? file.slice(0, 15 * 1024 * 1024) : file;
      const arrayBuf = await slice.arrayBuffer();
      const audioBuffer = await audioCtx.decodeAudioData(arrayBuf);
      const data = audioBuffer.getChannelData(0);
      const sampleRate = audioBuffer.sampleRate;

      const windowSamples = Math.floor(windowDuration * sampleRate);
      const stepSamples = Math.floor(sampleRate * 0.2); // 200ms step

      let maxEnergy = 0;
      let bestSample = 0;

      for (let i = 0; i + windowSamples < data.length; i += stepSamples) {
        let sum = 0;
        // Sample every 8th value for fast computation
        for (let j = i; j < i + windowSamples; j += 8) {
          sum += data[j] * data[j];
        }
        if (sum > maxEnergy) {
          maxEnergy = sum;
          bestSample = i;
        }
      }

      audioCtx.close().catch(() => {});

      if (maxEnergy > 0.0005) {
        const bestSec = Math.max(0, Math.min(duration - windowDuration, bestSample / sampleRate));
        setStart(bestSec);
        if (videoRef.current) {
          videoRef.current.currentTime = bestSec;
          videoRef.current.play().then(() => setIsPlaying(true)).catch(() => {});
        }
        setAudioPeakFound(true);
      } else {
        // Fallback to ~25% timestamp
        const fallback = Math.max(0, Math.min(duration - windowDuration, duration * 0.25));
        setStart(fallback);
        if (videoRef.current) {
          videoRef.current.currentTime = fallback;
          videoRef.current.play().then(() => setIsPlaying(true)).catch(() => {});
        }
        setAudioPeakFound(true);
      }
    } catch {
      // Fallback
      const fallback = Math.max(0, Math.min(duration - windowDuration, duration * 0.25));
      setStart(fallback);
      if (videoRef.current) {
        videoRef.current.currentTime = fallback;
        videoRef.current.play().then(() => setIsPlaying(true)).catch(() => {});
      }
      setAudioPeakFound(true);
    } finally {
      setIsAnalyzingAudio(false);
    }
  };

  const end = start + windowDuration;
  const leftPercent = (start / duration) * 100;
  const widthPercent = (windowDuration / duration) * 100;
  const playheadPercent = Math.max(0, Math.min(100, (currentTime / duration) * 100));

  return (
    <div className="flex flex-col space-y-4">
      {/* Header bar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
            <Scissors className="w-4 h-4" />
          </div>
          <div>
            <h4 className="text-xs font-black uppercase text-white tracking-wider flex items-center gap-1.5">
              CHOOSE 1–6s LOOP
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 font-bold border border-amber-500/30">
                {windowDuration.toFixed(1)}s
              </span>
            </h4>
            <p className="text-[10px] text-slate-400 font-mono">
              Slide window across {duration.toFixed(1)}s source video
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={onCancel}
          className="p-1.5 text-slate-400 hover:text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition-colors border border-slate-800"
          title="Cancel"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Video Preview */}
      <div className="relative aspect-video rounded-2xl bg-black overflow-hidden border border-slate-800 shadow-2xl flex items-center justify-center group">
        <video
          ref={videoRef}
          src={sourceUrl}
          playsInline
          muted={isMuted}
          className="w-full h-full object-contain"
          onClick={togglePlay}
        />

        {/* Center play toggle indicator overlay */}
        {!isPlaying && (
          <button
            type="button"
            onClick={togglePlay}
            className="absolute inset-0 m-auto w-14 h-14 rounded-full bg-black/60 backdrop-blur-sm border border-white/20 flex items-center justify-center text-white shadow-xl hover:scale-105 transition-transform"
          >
            <Play className="w-7 h-7 translate-x-0.5 fill-white" />
          </button>
        )}

        {/* Top badges */}
        <div className="absolute top-2.5 inset-x-2.5 flex items-center justify-between pointer-events-none">
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-black/70 backdrop-blur-md border border-slate-700/80 text-[10px] font-mono font-bold text-amber-300 shadow">
            <span>✂️ {formatTime(start)} – {formatTime(end)}</span>
            <span className="text-slate-400">({windowDuration.toFixed(1)}s)</span>
          </div>

          <div className="flex items-center gap-1.5 pointer-events-auto">
            <button
              type="button"
              onClick={toggleMute}
              className="p-1.5 rounded-lg bg-black/70 backdrop-blur-md border border-slate-700/80 text-white hover:bg-slate-800 transition-colors shadow"
              title={isMuted ? "Unmute" : "Mute"}
            >
              {isMuted ? <VolumeX className="w-3.5 h-3.5 text-red-400" /> : <Volume2 className="w-3.5 h-3.5 text-emerald-400" />}
            </button>
          </div>
        </div>

        {/* Bottom Loop Indicator */}
        <div className="absolute bottom-2 left-2.5 pointer-events-none">
          {previewLoop && (
            <div className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-500/20 backdrop-blur-md border border-amber-500/40 text-[9px] font-mono font-black text-amber-300">
              <RotateCcw className="w-2.5 h-2.5 animate-spin" style={{ animationDuration: "3s" }} />
              LOOPING ACTIVE WINDOW
            </div>
          )}
        </div>
      </div>

      {/* Timeline with Draggable Window */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-[11px] font-mono">
          <span className="text-slate-400">0:00</span>
          <span className="text-amber-400 font-bold">
            Window: {formatTime(start)} – {formatTime(end)}
          </span>
          <span className="text-slate-400">{formatTime(duration)}</span>
        </div>

        {/* Track Container */}
        <div
          ref={timelineRef}
          onClick={handleTrackClick}
          className="relative h-14 bg-slate-950 rounded-xl border border-slate-800 overflow-hidden cursor-pointer select-none shadow-inner"
        >
          {/* Subtle tick marks representing timeline seconds */}
          <div className="absolute inset-0 flex justify-between px-2 pointer-events-none opacity-20">
            {Array.from({ length: 12 }).map((_, idx) => (
              <div key={idx} className="h-full border-r border-slate-500" />
            ))}
          </div>

          {/* Current playhead vertical needle */}
          <div
            className="absolute top-0 bottom-0 w-0.5 bg-white z-20 pointer-events-none shadow-[0_0_8px_rgba(255,255,255,0.8)]"
            style={{ left: `${playheadPercent}%` }}
          />

          {/* Draggable Sliding Window */}
          <div
            style={{
              left: `${leftPercent}%`,
              width: `${widthPercent}%`
            }}
            onPointerDown={(e) => handlePointerDown(e, "move")}
            className="absolute top-1 bottom-1 rounded-lg border-2 border-amber-400 bg-amber-400/20 backdrop-blur-[2px] z-10 flex items-center justify-between cursor-grab active:cursor-grabbing shadow-lg transition-colors group/window"
          >
            {/* Left Resize Handle */}
            <div
              onPointerDown={(e) => handlePointerDown(e, "left")}
              className="w-4 h-full bg-amber-400 hover:bg-amber-300 text-slate-950 flex items-center justify-center rounded-l cursor-ew-resize shrink-0 transition-colors touch-none"
              title="Drag to adjust start (1-6s)"
            >
              <div className="w-0.5 h-4 bg-slate-950/60 rounded-full" />
            </div>

            {/* Center Drag Grip */}
            <div className="flex-1 h-full flex flex-col items-center justify-center px-1 text-center pointer-events-none overflow-hidden">
              <span className="text-[10px] font-black font-mono text-amber-300 drop-shadow truncate">
                {windowDuration.toFixed(1)}s
              </span>
              <div className="flex items-center gap-0.5 text-amber-400/80">
                <MoveHorizontal className="w-3 h-3" />
              </div>
            </div>

            {/* Right Resize Handle */}
            <div
              onPointerDown={(e) => handlePointerDown(e, "right")}
              className="w-4 h-full bg-amber-400 hover:bg-amber-300 text-slate-950 flex items-center justify-center rounded-r cursor-ew-resize shrink-0 transition-colors touch-none"
              title="Drag to adjust end (1-6s)"
            >
              <div className="w-0.5 h-4 bg-slate-950/60 rounded-full" />
            </div>
          </div>
        </div>

        <p className="text-[10px] text-slate-400 font-mono text-center pt-0.5">
          Drag handles to shrink down to 1s or expand to 6s • Drag center to slide
        </p>
      </div>

      {/* Control Tools Row */}
      <div className="flex items-center justify-between gap-2 pt-1">
        {/* Snap to Moment Button */}
        <button
          type="button"
          onClick={snapToMoment}
          disabled={isAnalyzingAudio}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-900 hover:bg-slate-800 border border-slate-700/80 text-amber-300 rounded-xl text-xs font-bold transition-all active:scale-95 cursor-pointer disabled:opacity-50"
          title="Jump window to highest sound or motion peak"
        >
          <Sparkles className={`w-3.5 h-3.5 text-amber-400 ${isAnalyzingAudio ? "animate-spin" : ""}`} />
          <span>{isAnalyzingAudio ? "Analyzing..." : audioPeakFound ? "Moment Snapped" : "Snap to Moment"}</span>
        </button>

        {/* Audio Strip Toggle */}
        <button
          type="button"
          onClick={() => {
            const nextMuted = !isMuted;
            setIsMuted(nextMuted);
            if (videoRef.current) videoRef.current.muted = nextMuted;
          }}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold border transition-all active:scale-95 cursor-pointer ${
            isMuted
              ? "bg-rose-500/10 border-rose-500/30 text-rose-300"
              : "bg-emerald-500/10 border-emerald-500/30 text-emerald-300"
          }`}
          title="Mute or keep video audio"
        >
          {isMuted ? <VolumeX className="w-3.5 h-3.5 text-rose-400" /> : <Volume2 className="w-3.5 h-3.5 text-emerald-400" />}
          <span>Audio: {isMuted ? "MUTED" : "ON"}</span>
        </button>

        {/* Preview Loop Toggle */}
        <button
          type="button"
          onClick={() => setPreviewLoop(!previewLoop)}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold border transition-all active:scale-95 cursor-pointer ${
            previewLoop
              ? "bg-amber-500/10 border-amber-500/40 text-amber-300"
              : "bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200"
          }`}
          title="Loop the active 1-6s window during preview"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          <span>Loop: {previewLoop ? "ON" : "OFF"}</span>
        </button>
      </div>

      {/* Action Buttons */}
      <div className="flex items-center gap-3 pt-2">
        <button
          type="button"
          onClick={onCancel}
          className="w-1/3 py-2.5 bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-300 font-bold rounded-xl text-xs transition-colors cursor-pointer"
        >
          Cancel
        </button>

        <button
          type="button"
          onClick={() => onApplyTrim({
            start: windowStartRef.current,
            windowDuration: windowEndRef.current - windowStartRef.current,
            stripAudio: isMuted
          })}
          className="w-2/3 py-2.5 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-black rounded-xl text-xs uppercase tracking-wider shadow-lg shadow-amber-500/20 active:scale-95 transition-all flex items-center justify-center gap-2 cursor-pointer"
        >
          <Check className="w-4 h-4" />
          <span>Use Trimmed Loop ({windowDuration.toFixed(1)}s)</span>
        </button>
      </div>
    </div>
  );
}
