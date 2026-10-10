import React, { useState, useEffect, useRef } from "react";
import { X, RotateCcw, Check, Loader2 } from "lucide-react";
import { loadOrientedBitmap, renderCrop } from "../utils/cropImage";
import { blockMediaEvent } from "../utils/mediaProtection";

interface ImageCropperProps {
  src: string;
  mimeType: string;
  onApply: (result: { blob: Blob; dataUrl: string; mimeType: string }) => void;
  onCancel: () => void;
}

interface CropRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

type HandleType = "tl" | "t" | "tr" | "r" | "br" | "b" | "bl" | "l";

interface DragState {
  type: "move" | "handle";
  handle?: HandleType;
  startClientX: number;
  startClientY: number;
  startCrop: CropRect;
}

export default function ImageCropper({ src, mimeType, onApply, onCancel }: ImageCropperProps) {
  const [source, setSource] = useState<ImageBitmap | HTMLImageElement | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isApplying, setIsApplying] = useState(false);
  const [applyError, setApplyError] = useState<string | null>(null);

  const [aspectPreset, setAspectPreset] = useState<string>("free");
  const [crop, setCrop] = useState<CropRect>({ x: 0, y: 0, w: 0, h: 0 });
  const [dragState, setDragState] = useState<DragState | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });

  // Load oriented bitmap on mount
  useEffect(() => {
    let active = true;
    setIsLoading(true);
    setLoadError(null);

    loadOrientedBitmap(src)
      .then((loaded) => {
        if (!active) {
          try {
            if ("close" in loaded && typeof (loaded as any).close === "function") {
              (loaded as any).close();
            }
          } catch {}
          return;
        }
        setSource(loaded);
        const sw = loaded instanceof HTMLImageElement ? (loaded.naturalWidth || loaded.width) : loaded.width;
        const sh = loaded instanceof HTMLImageElement ? (loaded.naturalHeight || loaded.height) : loaded.height;
        setCrop({ x: 0, y: 0, w: sw, h: sh });
        setIsLoading(false);
      })
      .catch((err) => {
        if (!active) return;
        setIsLoading(false);
        setLoadError(err?.message || "Failed to load image for cropping");
      });

    return () => {
      active = false;
    };
  }, [src]);

  // Clean up source bitmap on unmount if not yet closed
  useEffect(() => {
    return () => {
      try {
        if (source && "close" in source && typeof (source as any).close === "function") {
          (source as any).close();
        }
      } catch {}
    };
  }, [source]);

  // Measure container dimensions
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const measure = () => {
      const rect = el.getBoundingClientRect();
      setContainerSize({ width: rect.width, height: rect.height });
    };

    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    window.addEventListener("resize", measure);

    return () => {
      ro.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, []);

  const srcWidth = source
    ? source instanceof HTMLImageElement
      ? source.naturalWidth || source.width
      : source.width
    : 1;
  const srcHeight = source
    ? source instanceof HTMLImageElement
      ? source.naturalHeight || source.height
      : source.height
    : 1;

  // Compute displayed scale inside container
  const padding = 32;
  const availW = Math.max(50, containerSize.width - padding);
  const availH = Math.max(50, containerSize.height - padding);
  const scale = source ? Math.min(availW / srcWidth, availH / srcHeight) : 1;
  const displayedWidth = Math.round(srcWidth * scale);
  const displayedHeight = Math.round(srcHeight * scale);

  // Paint to canvas once source is ready
  useEffect(() => {
    if (!source || !canvasRef.current) return;
    const canvas = canvasRef.current;
    canvas.width = srcWidth;
    canvas.height = srcHeight;
    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.clearRect(0, 0, srcWidth, srcHeight);
      ctx.drawImage(source, 0, 0);
    }
  }, [source, srcWidth, srcHeight]);

  // Aspect ratio presets
  const PRESETS = [
    { id: "free", label: "Free", ratio: null },
    { id: "original", label: "Original", ratio: srcWidth / srcHeight },
    { id: "1:1", label: "1:1", ratio: 1 },
    { id: "4:5", label: "4:5", ratio: 4 / 5 },
    { id: "16:9", label: "16:9", ratio: 16 / 9 },
  ];

  const handleSelectPreset = (presetId: string, ratio: number | null) => {
    setAspectPreset(presetId);
    if (ratio === null || !source) return;

    // Largest centered box of this ratio inside current box's center, clamped to image
    const cx = crop.x + crop.w / 2;
    const cy = crop.y + crop.h / 2;

    let targetW = crop.w;
    let targetH = crop.h;
    if (targetW / targetH > ratio) {
      targetW = targetH * ratio;
    } else {
      targetH = targetW / ratio;
    }

    if (targetW < 32 || targetH < 32) {
      if (srcWidth / srcHeight > ratio) {
        targetH = Math.min(srcHeight, 200);
        targetW = targetH * ratio;
      } else {
        targetW = Math.min(srcWidth, 200);
        targetH = targetW / ratio;
      }
    }

    let newX = Math.round(cx - targetW / 2);
    let newY = Math.round(cy - targetH / 2);
    newX = Math.max(0, Math.min(srcWidth - targetW, newX));
    newY = Math.max(0, Math.min(srcHeight - targetH, newY));

    setCrop({
      x: Math.round(newX),
      y: Math.round(newY),
      w: Math.round(targetW),
      h: Math.round(targetH),
    });
  };

  const handleReset = () => {
    setAspectPreset("free");
    setCrop({ x: 0, y: 0, w: srcWidth, h: srcHeight });
  };

  const handleApply = async () => {
    if (!source || isApplying) return;
    setIsApplying(true);
    setApplyError(null);

    try {
      const result = await renderCrop(source, crop, mimeType);
      onApply(result);
    } catch (err: any) {
      setIsApplying(false);
      setApplyError(err?.message || "Failed to crop image. Please try again.");
    }
  };

  // Keyboard navigation: Escape cancels, Enter applies
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onCancel();
      } else if (e.key === "Enter" && !isApplying) {
        e.preventDefault();
        handleApply();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isApplying, crop, source, mimeType]);

  // Pointer drag handling
  const handleBoxPointerDown = (e: React.PointerEvent) => {
    e.stopPropagation();
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    setDragState({
      type: "move",
      startClientX: e.clientX,
      startClientY: e.clientY,
      startCrop: { ...crop },
    });
  };

  const handleHandlePointerDown = (e: React.PointerEvent, handle: HandleType) => {
    e.stopPropagation();
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    setDragState({
      type: "handle",
      handle,
      startClientX: e.clientX,
      startClientY: e.clientY,
      startCrop: { ...crop },
    });
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!dragState || !source) return;
    e.preventDefault();

    const dx = (e.clientX - dragState.startClientX) / scale;
    const dy = (e.clientY - dragState.startClientY) / scale;

    if (dragState.type === "move") {
      let newX = dragState.startCrop.x + dx;
      let newY = dragState.startCrop.y + dy;
      newX = Math.max(0, Math.min(srcWidth - dragState.startCrop.w, newX));
      newY = Math.max(0, Math.min(srcHeight - dragState.startCrop.h, newY));
      setCrop({
        ...dragState.startCrop,
        x: Math.round(newX),
        y: Math.round(newY),
      });
    } else if (dragState.type === "handle" && dragState.handle) {
      const minCrop = 32;
      const h = dragState.handle;
      const activePreset = PRESETS.find((p) => p.id === aspectPreset);
      const targetRatio = activePreset?.ratio ?? null;

      if (targetRatio === null) {
        // Free ratio: drag corners or edges
        let { x, y, w, h: cropH } = dragState.startCrop;
        if (h === "tl" || h === "l" || h === "bl") {
          const maxX = dragState.startCrop.x + dragState.startCrop.w - minCrop;
          const candidateX = Math.min(maxX, Math.max(0, dragState.startCrop.x + dx));
          w = dragState.startCrop.x + dragState.startCrop.w - candidateX;
          x = candidateX;
        }
        if (h === "tr" || h === "r" || h === "br") {
          w = Math.max(minCrop, Math.min(srcWidth - dragState.startCrop.x, dragState.startCrop.w + dx));
        }
        if (h === "tl" || h === "t" || h === "tr") {
          const maxY = dragState.startCrop.y + dragState.startCrop.h - minCrop;
          const candidateY = Math.min(maxY, Math.max(0, dragState.startCrop.y + dy));
          cropH = dragState.startCrop.y + dragState.startCrop.h - candidateY;
          y = candidateY;
        }
        if (h === "bl" || h === "b" || h === "br") {
          cropH = Math.max(minCrop, Math.min(srcHeight - dragState.startCrop.y, dragState.startCrop.h + dy));
        }

        setCrop({
          x: Math.round(x),
          y: Math.round(y),
          w: Math.round(w),
          h: Math.round(cropH),
        });
      } else {
        // Fixed ratio: corner drags only
        if (h === "br") {
          const x0 = dragState.startCrop.x;
          const y0 = dragState.startCrop.y;
          const maxW = Math.min(srcWidth - x0, (srcHeight - y0) * targetRatio);
          const wFromDx = dragState.startCrop.w + dx;
          const wFromDy = (dragState.startCrop.h + dy) * targetRatio;
          const chosenW = Math.abs(dx) >= Math.abs(dy * targetRatio) ? wFromDx : wFromDy;
          const newW = Math.max(minCrop, Math.min(maxW, chosenW));
          const newH = newW / targetRatio;
          setCrop({
            x: x0,
            y: y0,
            w: Math.round(newW),
            h: Math.round(newH),
          });
        } else if (h === "tr") {
          const x0 = dragState.startCrop.x;
          const y1 = dragState.startCrop.y + dragState.startCrop.h;
          const maxW = Math.min(srcWidth - x0, y1 * targetRatio);
          const wFromDx = dragState.startCrop.w + dx;
          const wFromDy = (dragState.startCrop.h - dy) * targetRatio;
          const chosenW = Math.abs(dx) >= Math.abs(dy * targetRatio) ? wFromDx : wFromDy;
          const newW = Math.max(minCrop, Math.min(maxW, chosenW));
          const newH = newW / targetRatio;
          const newY = y1 - newH;
          setCrop({
            x: x0,
            y: Math.round(newY),
            w: Math.round(newW),
            h: Math.round(newH),
          });
        } else if (h === "bl") {
          const x1 = dragState.startCrop.x + dragState.startCrop.w;
          const y0 = dragState.startCrop.y;
          const maxW = Math.min(x1, (srcHeight - y0) * targetRatio);
          const wFromDx = dragState.startCrop.w - dx;
          const wFromDy = (dragState.startCrop.h + dy) * targetRatio;
          const chosenW = Math.abs(dx) >= Math.abs(dy * targetRatio) ? wFromDx : wFromDy;
          const newW = Math.max(minCrop, Math.min(maxW, chosenW));
          const newH = newW / targetRatio;
          const newX = x1 - newW;
          setCrop({
            x: Math.round(newX),
            y: y0,
            w: Math.round(newW),
            h: Math.round(newH),
          });
        } else if (h === "tl") {
          const x1 = dragState.startCrop.x + dragState.startCrop.w;
          const y1 = dragState.startCrop.y + dragState.startCrop.h;
          const maxW = Math.min(x1, y1 * targetRatio);
          const wFromDx = dragState.startCrop.w - dx;
          const wFromDy = (dragState.startCrop.h - dy) * targetRatio;
          const chosenW = Math.abs(dx) >= Math.abs(dy * targetRatio) ? wFromDx : wFromDy;
          const newW = Math.max(minCrop, Math.min(maxW, chosenW));
          const newH = newW / targetRatio;
          const newX = x1 - newW;
          const newY = y1 - newH;
          setCrop({
            x: Math.round(newX),
            y: Math.round(newY),
            w: Math.round(newW),
            h: Math.round(newH),
          });
        }
      }
    }
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {}
    setDragState(null);
  };

  // Convert crop rect in source coords to screen coords on stage
  const boxLeft = Math.round(crop.x * scale);
  const boxTop = Math.round(crop.y * scale);
  const boxWidth = Math.round(crop.w * scale);
  const boxHeight = Math.round(crop.h * scale);

  return (
    <div
      className="fixed inset-0 z-[80] bg-slate-950/95 backdrop-blur-md flex flex-col justify-between text-white select-none"
      onContextMenu={blockMediaEvent}
    >
      {/* Top Header */}
      <div className="flex items-center justify-between px-4 sm:px-6 py-3 border-b border-slate-800/80 bg-slate-900/40">
        <div className="flex items-center gap-3">
          <h3 className="text-sm font-bold tracking-wide text-white">Crop Photo</h3>
          <span className="text-[11px] font-mono text-slate-400">
            {crop.w} × {crop.h} px
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleReset}
            disabled={isApplying || isLoading}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-300 hover:text-white bg-slate-800/60 hover:bg-slate-700/80 transition-all cursor-pointer active:scale-95 disabled:opacity-50"
            title="Reset crop to full photo"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Reset</span>
          </button>
          <button
            type="button"
            onClick={onCancel}
            disabled={isApplying}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800/80 transition-all cursor-pointer active:scale-95"
            title="Cancel (Esc)"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Center Crop Stage */}
      <div
        ref={containerRef}
        className="flex-1 min-h-0 relative flex items-center justify-center p-3 sm:p-4 overflow-hidden"
      >
        {isLoading ? (
          <div className="flex flex-col items-center gap-3 text-slate-400">
            <Loader2 className="w-8 h-8 animate-spin text-indigo-400" />
            <span className="text-xs font-medium">Loading photo…</span>
          </div>
        ) : loadError ? (
          <div className="text-center p-6 space-y-2">
            <p className="text-sm font-semibold text-rose-400">{loadError}</p>
            <button
              type="button"
              onClick={onCancel}
              className="mt-2 px-4 py-2 text-xs rounded-xl bg-slate-800 text-white font-medium hover:bg-slate-700"
            >
              Go Back
            </button>
          </div>
        ) : (
          <div
            style={{
              width: displayedWidth,
              height: displayedHeight,
              touchAction: "none",
            }}
            className="relative select-none overscroll-contain overflow-hidden rounded-lg shadow-2xl bg-black border border-slate-800/80"
          >
            {/* Background Canvas */}
            <canvas
              ref={canvasRef}
              className="w-full h-full pointer-events-none select-none reax-protected-media block"
              draggable={false}
              onContextMenu={blockMediaEvent}
            />

            {/* 4 Dimming Rectangles outside crop area */}
            <div
              className="absolute top-0 left-0 right-0 bg-black/65 pointer-events-none"
              style={{ height: Math.max(0, boxTop) }}
            />
            <div
              className="absolute left-0 right-0 bottom-0 bg-black/65 pointer-events-none"
              style={{ top: Math.min(displayedHeight, boxTop + boxHeight) }}
            />
            <div
              className="absolute left-0 bg-black/65 pointer-events-none"
              style={{
                top: Math.max(0, boxTop),
                height: Math.max(0, boxHeight),
                width: Math.max(0, boxLeft),
              }}
            />
            <div
              className="absolute right-0 bg-black/65 pointer-events-none"
              style={{
                top: Math.max(0, boxTop),
                height: Math.max(0, boxHeight),
                left: Math.min(displayedWidth, boxLeft + boxWidth),
              }}
            />

            {/* Crop Box with Rule-of-Thirds Grid */}
            <div
              style={{
                left: boxLeft,
                top: boxTop,
                width: boxWidth,
                height: boxHeight,
                touchAction: "none",
              }}
              className="absolute border border-white/90 shadow-sm cursor-move touch-none z-20"
              onPointerDown={handleBoxPointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerCancel={handlePointerUp}
            >
              {/* Rule of Thirds Grid */}
              <div className="absolute inset-0 pointer-events-none grid grid-cols-3 grid-rows-3">
                <div className="border-r border-b border-white/25" />
                <div className="border-r border-b border-white/25" />
                <div className="border-b border-white/25" />
                <div className="border-r border-b border-white/25" />
                <div className="border-r border-b border-white/25" />
                <div className="border-b border-white/25" />
                <div className="border-r border-white/25" />
                <div className="border-r border-white/25" />
                <div />
              </div>

              {/* 4 Corner Handles (always visible) */}
              <div
                className="w-11 h-11 flex items-center justify-center absolute top-0 left-0 -translate-x-1/2 -translate-y-1/2 cursor-nwse-resize touch-none z-30 select-none"
                onPointerDown={(e) => handleHandlePointerDown(e, "tl")}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onPointerCancel={handlePointerUp}
              >
                <div className="w-3.5 h-3.5 rounded-full bg-white border-2 border-indigo-600 shadow-md pointer-events-none" />
              </div>
              <div
                className="w-11 h-11 flex items-center justify-center absolute top-0 right-0 translate-x-1/2 -translate-y-1/2 cursor-nesw-resize touch-none z-30 select-none"
                onPointerDown={(e) => handleHandlePointerDown(e, "tr")}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onPointerCancel={handlePointerUp}
              >
                <div className="w-3.5 h-3.5 rounded-full bg-white border-2 border-indigo-600 shadow-md pointer-events-none" />
              </div>
              <div
                className="w-11 h-11 flex items-center justify-center absolute bottom-0 right-0 translate-x-1/2 translate-y-1/2 cursor-nwse-resize touch-none z-30 select-none"
                onPointerDown={(e) => handleHandlePointerDown(e, "br")}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onPointerCancel={handlePointerUp}
              >
                <div className="w-3.5 h-3.5 rounded-full bg-white border-2 border-indigo-600 shadow-md pointer-events-none" />
              </div>
              <div
                className="w-11 h-11 flex items-center justify-center absolute bottom-0 left-0 -translate-x-1/2 translate-y-1/2 cursor-nesw-resize touch-none z-30 select-none"
                onPointerDown={(e) => handleHandlePointerDown(e, "bl")}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onPointerCancel={handlePointerUp}
              >
                <div className="w-3.5 h-3.5 rounded-full bg-white border-2 border-indigo-600 shadow-md pointer-events-none" />
              </div>

              {/* 4 Edge Handles (Free ratio only) */}
              {aspectPreset === "free" && (
                <>
                  <div
                    className="w-11 h-11 flex items-center justify-center absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 cursor-ns-resize touch-none z-30 select-none"
                    onPointerDown={(e) => handleHandlePointerDown(e, "t")}
                    onPointerMove={handlePointerMove}
                    onPointerUp={handlePointerUp}
                    onPointerCancel={handlePointerUp}
                  >
                    <div className="w-3.5 h-3.5 rounded-full bg-white border-2 border-indigo-600 shadow-md pointer-events-none" />
                  </div>
                  <div
                    className="w-11 h-11 flex items-center justify-center absolute top-1/2 right-0 translate-x-1/2 -translate-y-1/2 cursor-ew-resize touch-none z-30 select-none"
                    onPointerDown={(e) => handleHandlePointerDown(e, "r")}
                    onPointerMove={handlePointerMove}
                    onPointerUp={handlePointerUp}
                    onPointerCancel={handlePointerUp}
                  >
                    <div className="w-3.5 h-3.5 rounded-full bg-white border-2 border-indigo-600 shadow-md pointer-events-none" />
                  </div>
                  <div
                    className="w-11 h-11 flex items-center justify-center absolute bottom-0 left-1/2 -translate-x-1/2 translate-y-1/2 cursor-ns-resize touch-none z-30 select-none"
                    onPointerDown={(e) => handleHandlePointerDown(e, "b")}
                    onPointerMove={handlePointerMove}
                    onPointerUp={handlePointerUp}
                    onPointerCancel={handlePointerUp}
                  >
                    <div className="w-3.5 h-3.5 rounded-full bg-white border-2 border-indigo-600 shadow-md pointer-events-none" />
                  </div>
                  <div
                    className="w-11 h-11 flex items-center justify-center absolute top-1/2 left-0 -translate-x-1/2 -translate-y-1/2 cursor-ew-resize touch-none z-30 select-none"
                    onPointerDown={(e) => handleHandlePointerDown(e, "l")}
                    onPointerMove={handlePointerMove}
                    onPointerUp={handlePointerUp}
                    onPointerCancel={handlePointerUp}
                  >
                    <div className="w-3.5 h-3.5 rounded-full bg-white border-2 border-indigo-600 shadow-md pointer-events-none" />
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Inline Error Message */}
      {applyError && (
        <div className="px-4 py-1.5 flex justify-center">
          <p className="text-xs text-rose-400 font-medium px-4 py-1.5 bg-rose-950/70 border border-rose-800/80 rounded-lg shadow">
            {applyError}
          </p>
        </div>
      )}

      {/* Bottom Toolbar & Action Buttons */}
      <div className="px-4 py-3 sm:py-4 border-t border-slate-800/80 bg-slate-900/60 flex flex-col sm:flex-row items-center justify-between gap-3">
        {/* Preset Chips */}
        <div className="flex items-center gap-1.5 overflow-x-auto max-w-full pb-1 sm:pb-0 scrollbar-none">
          {PRESETS.map((p) => {
            const isActive = aspectPreset === p.id;
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => handleSelectPreset(p.id, p.ratio)}
                disabled={isApplying || isLoading}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer select-none active:scale-95 ${
                  isActive
                    ? "bg-indigo-600 text-white shadow-sm ring-1 ring-indigo-400"
                    : "bg-slate-800/80 hover:bg-slate-700/80 text-slate-300 hover:text-white"
                }`}
              >
                {p.label}
              </button>
            );
          })}
        </div>

        {/* Action Buttons: Cancel and Apply (at least 44px tall) */}
        <div className="flex items-center gap-2.5 w-full sm:w-auto justify-end">
          <button
            type="button"
            onClick={onCancel}
            disabled={isApplying}
            className="flex-1 sm:flex-initial h-11 min-h-[44px] px-5 rounded-xl border border-slate-700 bg-slate-900/80 hover:bg-slate-800 text-slate-300 hover:text-white font-semibold text-xs transition-all active:scale-95 cursor-pointer disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleApply}
            disabled={isApplying || isLoading || !!loadError}
            className="flex-1 sm:flex-initial h-11 min-h-[44px] px-6 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs tracking-wide shadow-lg shadow-indigo-600/20 active:scale-95 transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 disabled:pointer-events-none"
          >
            {isApplying ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin text-white" />
                <span>Applying…</span>
              </>
            ) : (
              <>
                <Check className="w-4 h-4" />
                <span>Apply Crop</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
