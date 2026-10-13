import React, { useEffect } from "react";
import { createPortal } from "react-dom";
import { X, Share2, Mic } from "lucide-react";
import { isVoiceItEligible } from "../utils/voiceIt";
import { Clip } from "../types";
import { protectedMediaProps, blockMediaEvent } from "../utils/mediaProtection";
import { PackStyleLayer, PackTag, packMediaEffectClass } from "../packs/render";
import { useBackToClose } from "../hooks/useBackToClose";
import { useBodyScrollLock } from "../hooks/useBodyScrollLock";

interface MediaLightboxProps {
  clip: Clip | null;
  onClose: () => void;
  onShare?: (clip: Clip) => void;
  onVoiceIt?: (clip: Clip) => void;
}

const isVideoUrl = (url: string) =>
  /\.(mp4|webm|mov)(\?.*)?$/i.test(url) || url.includes("mixkit-");

export default function MediaLightbox({ clip, onClose, onShare, onVoiceIt }: MediaLightboxProps) {
  const isOpen = !!clip;
  useBackToClose(isOpen, onClose);
  useBodyScrollLock(isOpen);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [isOpen, onClose]);

  if (!clip || typeof document === "undefined") return null;

  const caption = clip.overlayText || clip.voiceText || "";

  return createPortal(
    <div
      className="fixed inset-0 z-[45] bg-black/90 flex flex-col items-center justify-center p-3 sm:p-6"
      onClick={(e) => {
        e.stopPropagation();
        onClose();
      }}
      role="dialog"
      aria-modal="true"
    >
      <div className="absolute top-3 right-3 flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
        {onVoiceIt && isVoiceItEligible(clip) && (
          <button
            type="button"
            onClick={() => onVoiceIt(clip)}
            aria-label="Voice it"
            title="Voice it: reply with your voice on this same picture"
            className="flex items-center gap-1 px-3 py-2 rounded-lg text-xs font-mono font-bold border bg-slate-900 hover:bg-slate-800 text-slate-200 border-slate-700 cursor-pointer"
          >
            <Mic className="w-4 h-4 text-emerald-400" />
            <span>Voice it</span>
          </button>
        )}
        {onShare && (
          <button
            type="button"
            onClick={() => onShare(clip)}
            aria-label="Share"
            title="Share reaction via text, email, link, or download"
            className="flex items-center gap-1 px-3 py-2 rounded-lg text-xs font-mono font-bold border bg-slate-900 hover:bg-slate-800 text-slate-200 border-slate-700 cursor-pointer"
          >
            <Share2 className="w-4 h-4 text-indigo-400" />
            <span>Share</span>
          </button>
        )}
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="p-2 rounded-full bg-slate-900 border border-slate-700 text-slate-200 hover:bg-slate-800 cursor-pointer"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      <div
        className="relative max-w-full max-h-[78vh] flex items-center justify-center overflow-hidden rounded-lg reax-protected-media"
        onClick={(e) => e.stopPropagation()}
        onContextMenu={blockMediaEvent}
      >
        {isVideoUrl(clip.mediaUrl) ? (
          <video
            {...protectedMediaProps}
            key={clip.id}
            src={clip.mediaUrl}
            controls
            controlsList="nodownload noremoteplayback"
            disablePictureInPicture
            playsInline
            autoPlay
            loop
            className={`max-w-full max-h-[78vh] object-contain rounded-lg reax-protected-media select-none ${packMediaEffectClass(clip.style) || ""}`}
          />
        ) : (
          <img
            {...protectedMediaProps}
            key={clip.id}
            src={clip.mediaUrl}
            alt={caption || "reaction"}
            referrerPolicy="no-referrer"
            className={`max-w-full max-h-[78vh] object-contain rounded-lg reax-protected-media select-none ${packMediaEffectClass(clip.style) || ""}`}
          />
        )}
        <PackStyleLayer style={clip.style} />
      </div>

      <div className="mt-3 max-w-xl text-center" onClick={(e) => e.stopPropagation()}>
        <p className="text-sm font-bold text-slate-200">@{clip.authorName}</p>
        {caption && <p className="text-xs text-slate-400 italic mt-1 break-words">"{caption}"</p>}
        {clip.style && <PackTag style={clip.style} className="mt-1" />}
      </div>
    </div>,
    document.body
  );
}
