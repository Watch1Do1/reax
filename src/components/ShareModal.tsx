import React, { useEffect, useState } from "react";
import { X, MessageSquare, Mail, Copy, Check, Download, Share2, ExternalLink, Image as ImageIcon, Film } from "lucide-react";
import { Clip } from "../types";
import { protectedMediaProps, blockMediaEvent } from "../utils/mediaProtection";
import { WATERMARK_POSITIONS, loadWatermarkPosition, saveWatermarkPosition, type WatermarkPosition } from "../utils/watermarkExporter";

const WATERMARK_POS_LABELS: Record<WatermarkPosition, string> = {
  "top-left": "↖ Top L",
  "top-right": "↗ Top R",
  "bottom-left": "↙ Bot L",
  "bottom-right": "↘ Bot R",
  strip: "▭ Strip",
};

interface ShareModalProps {
  isOpen: boolean;
  onClose: () => void;
  clip: Clip;
  onDownloadWatermark: (watermarkPos: WatermarkPosition) => void;
  isGeneratingWatermark?: boolean;
  onCopyPicture?: (watermarkPos: WatermarkPosition) => void;
  isCopyingPicture?: boolean;
  onDownloadVideo?: (watermarkPos: WatermarkPosition) => void;
  /** Show "Create Video" (videos, and pictures with a voice note). Defaults to clip.mediaType === "video". */
  canCreateVideo?: boolean;
  isGeneratingVideo?: boolean;
  videoProgress?: number;
  isVideoReady?: boolean;
  onSaveVideo?: () => void;
}

export default function ShareModal({
  isOpen,
  onClose,
  clip,
  onDownloadWatermark,
  isGeneratingWatermark = false,
  onCopyPicture,
  isCopyingPicture = false,
  onDownloadVideo,
  canCreateVideo,
  isGeneratingVideo = false,
  videoProgress = 0,
  isVideoReady = false,
  onSaveVideo,
}: ShareModalProps) {
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedText, setCopiedText] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [watermarkPos, setWatermarkPos] = useState<WatermarkPosition>(() => loadWatermarkPosition());
  const chooseWatermarkPos = (pos: WatermarkPosition) => {
    setWatermarkPos(pos);
    saveWatermarkPosition(pos);
  };

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  // Build canonical share URL with clip anchor
  const origin = typeof window !== "undefined" ? window.location.origin : "https://getreax.com";
  const shareUrl = `${origin}/#clip-${clip.id}`;
  const caption = clip.overlayText ? `"${clip.overlayText}"` : "Check out this reaction";
  const shareMessage = `${caption} by @${clip.authorName} on Reax\n${shareUrl}`;

  // Device-aware SMS URL
  const isIOS = typeof navigator !== "undefined" && /iPhone|iPad|iPod/i.test(navigator.userAgent);
  const smsUrl = isIOS
    ? `sms:&body=${encodeURIComponent(shareMessage)}`
    : `sms:?body=${encodeURIComponent(shareMessage)}`;

  // Mailto URL
  const emailSubject = `Reaction by @${clip.authorName} on Reax`;
  const emailBody = `Hey,\n\nCheck out this reaction by @${clip.authorName} on Reax:\n\n${clip.overlayText ? `"${clip.overlayText}"\n\n` : ""}Watch and react back here:\n${shareUrl}\n\nShared via getREAX.com`;
  const mailtoUrl = `mailto:?subject=${encodeURIComponent(emailSubject)}&body=${encodeURIComponent(emailBody)}`;

  // Picture (or GIF) with a voice note: export is a video with sound.
  const isVoicePicture = !!(canCreateVideo && clip.mediaType !== "video" && onDownloadVideo);

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopiedLink(true);
      setStatusMessage("Direct link copied to clipboard!");
      setTimeout(() => {
        setCopiedLink(false);
        setStatusMessage(null);
      }, 3000);
    } catch {
      setStatusMessage("Failed to copy link. Please copy manually.");
    }
  };

  const handleCopyMessage = async () => {
    try {
      await navigator.clipboard.writeText(shareMessage);
      setCopiedText(true);
      setStatusMessage("Message & link copied to clipboard! Paste into your chat app.");
      setTimeout(() => {
        setCopiedText(false);
        setStatusMessage(null);
      }, 3500);
    } catch {
      setStatusMessage("Failed to copy. Please copy manually.");
    }
  };

  const handleNativeShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: `Reax by @${clip.authorName}`,
          text: caption,
          url: shareUrl
        });
      } catch (err: any) {
        if (err?.name !== "AbortError") {
          handleCopyLink();
        }
      }
    } else {
      handleCopyLink();
    }
  };

  const canNativeShare = typeof navigator !== "undefined" && typeof navigator.share === "function";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 overscroll-contain bg-black/80 backdrop-blur-sm animate-fade-in"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-md max-h-[calc(100dvh-2rem)] overflow-y-auto overscroll-contain touch-pan-y [-webkit-overflow-scrolling:touch] bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl p-6 text-white"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky -top-6 z-10 -mx-6 -mt-6 px-6 pt-6 bg-slate-900 flex items-center justify-between pb-4 border-b border-slate-800/80">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center">
              <Share2 className="w-4 h-4 text-indigo-400" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-100">Share & Copy Reaction</h2>
              <p className="text-xs text-slate-400 font-mono">By @{clip.authorName}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-full bg-slate-800 text-slate-200 hover:text-white hover:bg-slate-700 transition-colors cursor-pointer"
            aria-label="Close"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Clip Preview Snippet with Watermark Badge */}
        <div className="my-4 p-3 bg-slate-950/70 rounded-xl border border-slate-800/80 flex items-center gap-3">
          <div className="relative w-18 h-18 rounded-lg bg-slate-800 overflow-hidden shrink-0 border border-slate-700/50 reax-protected-media" onContextMenu={blockMediaEvent}>
            {clip.mediaType === "video" ? (
              <video
                {...protectedMediaProps}
                controlsList="nodownload noremoteplayback"
                disablePictureInPicture
                src={clip.mediaUrl}
                className="w-full h-full object-cover reax-protected-media select-none"
                muted
                playsInline
                preload="metadata"
              />
            ) : (
              <img
                {...protectedMediaProps}
                src={clip.mediaUrl}
                alt={clip.overlayText || "Reaction"}
                className="w-full h-full object-cover reax-protected-media select-none"
              />
            )}
            <div className="absolute top-1 right-1 px-1.5 py-0.5 rounded-full bg-black/80 border border-white/20 text-[7px] font-mono font-bold text-white flex items-center gap-0.5 shadow-sm">
              <span className="w-1 h-1 rounded-full bg-cyan-400" />
              getREAX.com
            </div>
          </div>
          <div className="min-w-0 flex-1">
            {clip.overlayText ? (
              <p className="text-xs sm:text-sm font-semibold text-slate-200 break-words leading-snug">
                "{clip.overlayText}"
              </p>
            ) : (
              <p className="text-xs text-slate-400 italic">No overlay caption</p>
            )}
            <div className="flex items-center gap-1.5 text-[10px] text-cyan-400 mt-1 font-medium">
              <span>✓ Full text & watermark preserved</span>
            </div>
          </div>
        </div>

        {/* Status Toast */}
        {statusMessage && (
          <div className="mb-4 p-2.5 bg-indigo-950/80 border border-indigo-500/30 rounded-xl text-center text-xs font-medium text-indigo-200 animate-fade-in">
            {statusMessage}
          </div>
        )}

        {/* Watermark spot picker (applies to saved/copied pictures and created videos) */}
        <div className="mb-3">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400 mb-1.5">Watermark spot</div>
          <div className="grid grid-cols-5 gap-1.5" role="radiogroup" aria-label="Watermark spot">
            {WATERMARK_POSITIONS.map((pos) => (
              <button
                key={pos}
                type="button"
                role="radio"
                aria-checked={watermarkPos === pos}
                onClick={() => chooseWatermarkPos(pos)}
                title={pos === "strip" ? "Dark bar below the picture (videos use bottom-right)" : pos.replace("-", " ")}
                className={`px-1 py-1.5 rounded-lg text-[11px] font-semibold border transition-colors cursor-pointer ${
                  watermarkPos === pos
                    ? "bg-indigo-500/30 border-indigo-400 text-white"
                    : "bg-slate-800/60 border-slate-700/60 text-slate-300 hover:border-slate-500"
                }`}
              >
                {WATERMARK_POS_LABELS[pos]}
              </button>
            ))}
          </div>
        </div>

        {/* Primary Action Buttons */}
        <div className="space-y-2.5">
          {/* 0. Share with Sound (voice pictures only) - same action as the watermarked video button */}
          {isVoicePicture && (
            <button
              type="button"
              onClick={isVideoReady && onSaveVideo ? onSaveVideo : () => onDownloadVideo?.(watermarkPos)}
              disabled={isGeneratingVideo}
              className="flex items-center justify-between w-full px-4 py-3 bg-gradient-to-r from-pink-600/30 via-purple-600/30 to-indigo-600/30 hover:from-pink-600/45 hover:via-purple-600/45 hover:to-indigo-600/45 border border-pink-500/50 hover:border-pink-400 rounded-xl transition-all cursor-pointer group shadow-xl"
            >
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-pink-500/20 text-pink-300 flex items-center justify-center group-hover:scale-105 transition-transform border border-pink-500/30">
                  <Film className="w-5 h-5" />
                </div>
                <div className="text-left">
                  <div className="text-sm font-bold text-white">
                    {isGeneratingVideo ? `Share with Sound... ${videoProgress || 0}%` : "Share with Sound"}
                  </div>
                  <div className="text-xs text-slate-300">
                    {isVideoReady ? "Ready: tap to share or save" : "Saves as a video so your voice plays"}
                  </div>
                </div>
              </div>
              <span className="text-xs font-semibold text-pink-300 group-hover:text-white px-2 py-1 rounded-md bg-pink-500/10">
                {isGeneratingVideo ? `${videoProgress || 0}%` : isVideoReady ? "Share" : "Go"}
              </span>
            </button>
          )}
          {/* 1. Download Watermarked Video (MP4) - Ideal for TikTok, Instagram, Twitter, Discord */}
          {(canCreateVideo ?? clip.mediaType === "video") && onDownloadVideo && (
            <button
              type="button"
              onClick={isVideoReady && onSaveVideo ? onSaveVideo : () => onDownloadVideo?.(watermarkPos)}
              disabled={isGeneratingVideo}
              className="flex items-center justify-between w-full px-4 py-3 bg-gradient-to-r from-indigo-600/30 via-purple-600/30 to-pink-600/30 hover:from-indigo-600/45 hover:via-purple-600/45 hover:to-pink-600/45 border border-indigo-500/50 hover:border-indigo-400 rounded-xl transition-all cursor-pointer group shadow-xl"
            >
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-indigo-500/20 text-indigo-300 flex items-center justify-center group-hover:scale-105 transition-transform border border-indigo-500/30">
                  <Film className="w-5 h-5" />
                </div>
                <div className="text-left">
                  <div className="text-sm font-bold text-white flex items-center gap-1.5">
                    {isGeneratingVideo
                      ? `Creating Video... ${videoProgress || 0}%`
                      : isVideoReady ? "Save Video" : "Download Watermarked Video"}
                    <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-indigo-400/20 text-indigo-300 border border-indigo-400/30">
                      MP4
                    </span>
                  </div>
                  <div className="text-xs text-slate-300">
                    {isVideoReady 
                      ? "Ready: saves to Photos on phones, downloads on computers" 
                      : clip.mediaType === "video"
                        ? "MP4 with your caption + getREAX.com watermark. Works on X, TikTok, Instagram, Discord"
                        : "MP4 of this picture with the voice note + getREAX.com watermark. Works on X, TikTok, Instagram"}
                  </div>
                </div>
              </div>
              <span className="text-xs font-semibold text-indigo-300 group-hover:text-white px-2 py-1 rounded-md bg-indigo-500/10">
                {isGeneratingVideo ? `${videoProgress || 0}%` : isVideoReady ? "Save" : "Create"}
              </span>
            </button>
          )}


          {/* 2. Copy Picture (Paste directly into Email / Slack / Discord) */}
          {onCopyPicture && (
            <button
              type="button"
              onClick={() => onCopyPicture(watermarkPos)}
              disabled={isCopyingPicture}
              className="flex items-center justify-between w-full px-4 py-3 bg-gradient-to-r from-cyan-500/15 via-indigo-500/15 to-purple-500/15 hover:from-cyan-500/25 hover:via-indigo-500/25 hover:to-purple-500/25 border border-cyan-500/40 hover:border-cyan-400/70 rounded-xl transition-all cursor-pointer group shadow-lg"
            >
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-cyan-500/20 text-cyan-300 flex items-center justify-center group-hover:scale-105 transition-transform border border-cyan-500/30">
                  <ImageIcon className="w-5 h-5" />
                </div>
                <div className="text-left">
                  <div className="text-sm font-bold text-cyan-200 flex items-center gap-1.5">
                    {isCopyingPicture ? "Generating Picture..." : "Copy Picture to Clipboard"}
                    <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-cyan-400/20 text-cyan-300 border border-cyan-400/30">
                      Ctrl+V
                    </span>
                  </div>
                  <div className="text-xs text-slate-300">
                    Paste directly into Email, Discord, Slack, or Chats
                  </div>
                </div>
              </div>
              <span className="text-xs font-semibold text-cyan-300 group-hover:text-white px-2 py-1 rounded-md bg-cyan-500/10">
                {isCopyingPicture ? "Copying..." : "Copy Image"}
              </span>
            </button>
          )}

          {/* 2. Download Watermarked Card */}
          <button
            type="button"
            onClick={() => onDownloadWatermark(watermarkPos)}
            disabled={isGeneratingWatermark}
            className="flex items-center justify-between w-full px-4 py-3 bg-slate-800/60 hover:bg-slate-800 border border-slate-700/60 hover:border-slate-600 rounded-xl transition-all cursor-pointer group disabled:opacity-50"
          >
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-slate-700 text-slate-200 flex items-center justify-center group-hover:scale-105 transition-transform">
                <Download className="w-5 h-5" />
              </div>
              <div className="text-left">
                <div className="text-sm font-semibold text-slate-200">
                  {isGeneratingWatermark ? "Saving Picture..." : "Save Watermarked Image"}
                </div>
                <div className="text-xs text-slate-400">Download high-res PNG file with getREAX stamp</div>
              </div>
            </div>
            <span className="text-xs text-slate-400 group-hover:text-slate-200">
              {isGeneratingWatermark ? "Saving..." : "Save"}
            </span>
          </button>

          {/* 3. Send via Text (SMS) */}
          <a
            href={smsUrl}
            onClick={() => {
              if (!isIOS && !/Android/i.test(navigator.userAgent)) {
                handleCopyMessage();
              }
            }}
            className="flex items-center justify-between w-full px-4 py-3 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 hover:border-emerald-500/50 rounded-xl transition-all cursor-pointer group"
          >
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-emerald-500/20 text-emerald-400 flex items-center justify-center group-hover:scale-105 transition-transform">
                <MessageSquare className="w-5 h-5" />
              </div>
              <div className="text-left">
                <div className="text-sm font-semibold text-emerald-300">Send Text Message (SMS)</div>
                <div className="text-xs text-slate-400">Opens Messages with caption & link ready</div>
              </div>
            </div>
            <ExternalLink className="w-4 h-4 text-emerald-400 opacity-60 group-hover:opacity-100" />
          </a>

          {/* 4. Send via Email */}
          <a
            href={mailtoUrl}
            className="flex items-center justify-between w-full px-4 py-3 bg-sky-500/10 hover:bg-sky-500/20 border border-sky-500/30 hover:border-sky-500/50 rounded-xl transition-all cursor-pointer group"
          >
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-sky-500/20 text-sky-400 flex items-center justify-center group-hover:scale-105 transition-transform">
                <Mail className="w-5 h-5" />
              </div>
              <div className="text-left">
                <div className="text-sm font-semibold text-sky-300">Send via Email</div>
                <div className="text-xs text-slate-400">Opens email client with link & reaction</div>
              </div>
            </div>
            <ExternalLink className="w-4 h-4 text-sky-400 opacity-60 group-hover:opacity-100" />
          </a>

          {/* 5. Copy Link */}
          <button
            type="button"
            onClick={handleCopyLink}
            className="flex items-center justify-between w-full px-4 py-3 bg-slate-800/40 hover:bg-slate-800/80 border border-slate-700/40 rounded-xl transition-all cursor-pointer group"
          >
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-slate-700/60 text-slate-300 flex items-center justify-center group-hover:scale-105 transition-transform">
                {copiedLink ? <Check className="w-5 h-5 text-emerald-400" /> : <Copy className="w-5 h-5" />}
              </div>
              <div className="text-left">
                <div className="text-sm font-semibold text-slate-200">
                  {copiedLink ? "Link Copied!" : "Copy Direct Link"}
                </div>
                <div className="text-xs text-slate-400 font-mono truncate max-w-[220px]">
                  {shareUrl}
                </div>
              </div>
            </div>
            {copiedLink ? (
              <span className="text-xs font-semibold text-emerald-400">Copied</span>
            ) : (
              <span className="text-xs text-slate-400 group-hover:text-slate-200">Copy</span>
            )}
          </button>

          {/* 6. Native Share (if supported) */}
          {canNativeShare && (
            <button
              type="button"
              onClick={handleNativeShare}
              className="flex items-center justify-between w-full px-4 py-3 bg-indigo-500/10 hover:bg-indigo-500/20 border border-indigo-500/30 hover:border-indigo-500/50 rounded-xl transition-all cursor-pointer group"
            >
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-indigo-500/20 text-indigo-400 flex items-center justify-center group-hover:scale-105 transition-transform">
                  <Share2 className="w-5 h-5" />
                </div>
                <div className="text-left">
                  <div className="text-sm font-semibold text-indigo-300">More Apps & Share Sheet</div>
                  <div className="text-xs text-slate-400">AirDrop, WhatsApp, Instagram, and more</div>
                </div>
              </div>
              <ExternalLink className="w-4 h-4 text-indigo-400 opacity-60 group-hover:opacity-100" />
            </button>
          )}
        </div>

        <button
          type="button"
          onClick={onClose}
          className="mt-4 w-full py-3 rounded-xl border border-slate-700 bg-slate-800/80 text-sm font-semibold text-slate-200 hover:bg-slate-700 transition-colors cursor-pointer"
        >
          Close
        </button>
      </div>
    </div>
  );
}
