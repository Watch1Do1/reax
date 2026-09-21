import React, { useState } from "react";
import { X, MessageSquare, Mail, Copy, Check, Download, Share2, ExternalLink, Image as ImageIcon } from "lucide-react";
import { Clip } from "../types";

interface ShareModalProps {
  isOpen: boolean;
  onClose: () => void;
  clip: Clip;
  onDownloadWatermark: () => void;
  isGeneratingWatermark?: boolean;
  onCopyPicture?: () => void;
  isCopyingPicture?: boolean;
}

export default function ShareModal({
  isOpen,
  onClose,
  clip,
  onDownloadWatermark,
  isGeneratingWatermark = false,
  onCopyPicture,
  isCopyingPicture = false,
}: ShareModalProps) {
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedText, setCopiedText] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

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
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl p-6 text-white"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-slate-800/80">
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
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Clip Preview Snippet with Watermark Badge */}
        <div className="my-4 p-3 bg-slate-950/70 rounded-xl border border-slate-800/80 flex items-center gap-3">
          <div className="relative w-18 h-18 rounded-lg bg-slate-800 overflow-hidden shrink-0 border border-slate-700/50">
            {clip.mediaType === "video" ? (
              <video
                src={clip.mediaUrl}
                className="w-full h-full object-cover"
                muted
                playsInline
                preload="metadata"
              />
            ) : (
              <img
                src={clip.mediaUrl}
                alt={clip.overlayText || "Reaction"}
                className="w-full h-full object-cover"
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

        {/* Primary Action Buttons */}
        <div className="space-y-2.5">
          {/* 1. Copy Picture (Paste directly into Email / 9gag / Slack / Discord) */}
          {onCopyPicture && (
            <button
              type="button"
              onClick={onCopyPicture}
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
                    Paste directly into Email, 9gag, Discord, or Chats
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
            onClick={onDownloadWatermark}
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
      </div>
    </div>
  );
}

