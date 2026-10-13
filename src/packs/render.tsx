// Rendering helpers for Reaction Pack styles on posts and in the editor.
import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { ClipStyle, PlacedSticker } from "./style";
import { findCaptionStyle, findColor, findEffect, findFont, findSticker, getPack } from "./manifest";

export const OPEN_PACKS_EVENT = "reax_open_packs";

export function openPacksPage(packId?: string) {
  window.dispatchEvent(new CustomEvent(OPEN_PACKS_EVENT, { detail: { packId: packId || null } }));
}

// Class for the picture/video element (or its animated wrapper), or null.
export function packMediaEffectClass(style: ClipStyle | null | undefined): string | null {
  const fx = findEffect(style?.effect);
  return fx && fx.target === "media" ? fx.className : null;
}

// Font / color / caption-style presentation for the caption text, or null when
// the style doesn't touch the caption.
export function packCaptionPresentation(
  style: ClipStyle | null | undefined
): { className: string; style: React.CSSProperties } | null {
  if (!style) return null;
  const cap = findCaptionStyle(style.caption);
  const font = findFont(style.font || cap?.fontId);
  const color = findColor(style.color || cap?.colorId);
  const fx = findEffect(style.effect);
  const classes: string[] = [];
  if (cap) classes.push(cap.className);
  if (fx && fx.target === "caption") classes.push(fx.className);
  if (!font && !color && classes.length === 0) return null;
  const css: React.CSSProperties = {};
  if (font) css.fontFamily = `"${font.family}", ui-sans-serif, system-ui, sans-serif`;
  if (color) css.color = color.hex;
  return { className: classes.join(" "), style: css };
}

type Rect = { left: number; top: number; width: number; height: number };

function computeMediaRect(w: number, h: number, aspect: number | null, fit: "contain" | "cover"): Rect {
  if (!aspect || !w || !h) return { left: 0, top: 0, width: w, height: h };
  const box = w / h;
  let mw: number;
  let mh: number;
  if ((fit === "contain") === (aspect > box)) {
    mw = w;
    mh = w / aspect;
  } else {
    mh = h;
    mw = h * aspect;
  }
  return { left: (w - mw) / 2, top: (h - mh) / 2, width: mw, height: mh };
}

const MEDIA_SELECTOR = 'img:not([aria-hidden="true"]):not([data-pack-asset]), video';

function readAspect(el: Element | null): number | null {
  if (el instanceof HTMLVideoElement && el.videoWidth && el.videoHeight) return el.videoWidth / el.videoHeight;
  if (el instanceof HTMLImageElement && el.naturalWidth && el.naturalHeight) return el.naturalWidth / el.naturalHeight;
  return null;
}

interface PackStyleLayerProps {
  style: ClipStyle | null | undefined;
  // How the sibling media element is fitted in the shared parent box.
  fit?: "contain" | "cover";
  // Editor mode: stickers can be dragged; the parent owns selection + updates.
  editable?: boolean;
  selectedSticker?: number | null;
  onSelectSticker?: (index: number | null) => void;
  onMoveSticker?: (index: number, x: number, y: number) => void;
}

// Draws frame, stickers and overlay effects over the media. Place it inside the
// same positioned box as the <img>/<video>; it lines itself up with the media's
// visible area, so positions match across the feed, threads and the editor.
export function PackStyleLayer({ style, fit = "contain", editable = false, selectedSticker = null, onSelectSticker, onMoveSticker }: PackStyleLayerProps) {
  const anchorRef = useRef<HTMLDivElement | null>(null);
  const layerRef = useRef<HTMLDivElement | null>(null);
  const [rect, setRect] = useState<Rect | null>(null);
  const dragRef = useRef<{ index: number; pointerId: number } | null>(null);

  useLayoutEffect(() => {
    const anchor = anchorRef.current;
    const parent = anchor?.parentElement;
    if (!anchor || !parent) return;
    let media: Element | null = null;
    const update = () => {
      const found = parent.querySelector(MEDIA_SELECTOR);
      if (found !== media) {
        media?.removeEventListener("load", update);
        media?.removeEventListener("loadedmetadata", update);
        media = found;
        media?.addEventListener("load", update);
        media?.addEventListener("loadedmetadata", update);
      }
      const next = computeMediaRect(parent.clientWidth, parent.clientHeight, readAspect(media), fit);
      setRect((prev) =>
        prev && prev.left === next.left && prev.top === next.top && prev.width === next.width && prev.height === next.height ? prev : next
      );
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(parent);
    const mo = new MutationObserver(update);
    mo.observe(parent, { childList: true, subtree: true, attributes: true, attributeFilter: ["src"] });
    return () => {
      ro.disconnect();
      mo.disconnect();
      media?.removeEventListener("load", update);
      media?.removeEventListener("loadedmetadata", update);
    };
  }, [fit]);

  useEffect(() => {
    if (!editable) dragRef.current = null;
  }, [editable]);

  const pack = getPack(style?.packId);
  const fx = findEffect(style?.effect);
  const stickerFx = fx && fx.target === "stickers" ? fx.className : "";
  const frameId = style?.frame;
  const stickers = style?.stickers || [];
  const hasAnything = Boolean(pack && (frameId || stickers.length || (fx && fx.target === "overlay")));

  const pointToFraction = (clientX: number, clientY: number) => {
    const box = layerRef.current?.getBoundingClientRect();
    if (!box || !box.width || !box.height) return null;
    return {
      x: Math.min(1, Math.max(0, (clientX - box.left) / box.width)),
      y: Math.min(1, Math.max(0, (clientY - box.top) / box.height)),
    };
  };

  return (
    <>
      <div ref={anchorRef} aria-hidden="true" style={{ display: "none" }} />
      {hasAnything && rect && (
        <div
          ref={layerRef}
          className="pack-layer"
          style={{ left: rect.left, top: rect.top, width: rect.width, height: rect.height }}
          onPointerDown={editable ? () => onSelectSticker?.(null) : undefined}
        >
          {fx && fx.target === "overlay" && <div className={fx.className} />}
          {frameId && <PackFrame frameId={frameId} />}
          {stickers.map((s: PlacedSticker, i: number) => {
            const def = findSticker(s.id);
            if (!def) return null;
            return (
              <div
                key={`${s.id}-${i}`}
                className={`pack-sticker ${editable ? "pack-sticker-editable" : ""} ${editable && selectedSticker === i ? "pack-sticker-selected" : ""}`}
                style={{ left: `${s.x * 100}%`, top: `${s.y * 100}%`, transform: `translate(-50%, -50%) rotate(${s.rot}deg) scale(${s.scale})` }}
                onPointerDown={editable ? (e) => {
                  e.stopPropagation();
                  e.preventDefault();
                  onSelectSticker?.(i);
                  dragRef.current = { index: i, pointerId: e.pointerId };
                  e.currentTarget.setPointerCapture(e.pointerId);
                } : undefined}
                onPointerMove={editable ? (e) => {
                  const drag = dragRef.current;
                  if (!drag || drag.pointerId !== e.pointerId) return;
                  const p = pointToFraction(e.clientX, e.clientY);
                  if (p) onMoveSticker?.(drag.index, p.x, p.y);
                } : undefined}
                onPointerUp={editable ? (e) => {
                  if (dragRef.current?.pointerId === e.pointerId) dragRef.current = null;
                } : undefined}
                onPointerCancel={editable ? () => { dragRef.current = null; } : undefined}
              >
                <div className={stickerFx} style={{ width: "100%", height: "100%", animationDelay: `${i * 0.15}s` }}>
                  <img data-pack-asset="" src={def.src} alt={def.name} draggable={false} />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}

export function PackFrame({ frameId }: { frameId: string }) {
  switch (frameId) {
    case "chaos-frame-signal-lost":
      return <div className="pack-frame pack-frame-signal-lost"><i /><i /><i /></div>;
    case "funny-frame-comic-panel":
      return <div className="pack-frame pack-frame-comic-panel"><i /><i /><i /><i /></div>;
    case "drama-frame-letterbox":
      return <div className="pack-frame pack-frame-letterbox"><i /><i /></div>;
    case "sarcasm-frame-memo":
      return <div className="pack-frame pack-frame-memo"><span>RE: your take</span></div>;
    case "chill-frame-soft-focus":
      return <div className="pack-frame pack-frame-soft-focus" />;
    default:
      return null;
  }
}

// Small "made with the X Pack" tag; opens the Packs page on that pack.
export function PackTag({ style, className = "" }: { style: ClipStyle | null | undefined; className?: string }) {
  const pack = getPack(style?.packId);
  if (!pack) return null;
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        openPacksPage(pack.id);
      }}
      className={`inline-flex items-center gap-1 text-[9px] font-mono text-slate-500 hover:text-indigo-300 transition-colors cursor-pointer ${className}`}
      title={`See the ${pack.name} Pack`}
    >
      <span className="w-1.5 h-1.5 rounded-full" style={{ background: pack.accent }} />
      <span>made with the {pack.name} Pack</span>
    </button>
  );
}
