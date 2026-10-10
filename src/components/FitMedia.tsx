import React, { useState, useEffect, useRef } from "react";
import { protectedMediaProps } from "../utils/mediaProtection";

export interface FitMediaProps {
  src: string;
  isVideo: boolean;
  mediaRef?: React.Ref<HTMLImageElement | HTMLVideoElement>;
  videoProps?: React.VideoHTMLAttributes<HTMLVideoElement>;
  imgProps?: React.ImgHTMLAttributes<HTMLImageElement>;
  animClass?: string;
  minRatio?: number;
  maxRatio?: number;
  className?: string;
  onClick?: (e: React.MouseEvent<HTMLDivElement>) => void;
  onContextMenu?: (e: React.MouseEvent<HTMLDivElement>) => void;
  children?: React.ReactNode;
  outerChildren?: React.ReactNode;
}

export function FitMedia({
  src,
  isVideo,
  mediaRef,
  videoProps,
  imgProps,
  animClass,
  minRatio = 4 / 5,
  maxRatio = 1.91,
  className = "",
  onClick,
  onContextMenu,
  children,
  outerChildren,
}: FitMediaProps) {
  const [ratio, setRatio] = useState<number>(16 / 9);
  const imgRefInternal = useRef<HTMLImageElement | null>(null);

  // Check complete on mount or when src changes for cached images
  useEffect(() => {
    if (!isVideo && imgRefInternal.current) {
      const img = imgRefInternal.current;
      if (img.complete && img.naturalWidth && img.naturalHeight) {
        setRatio(img.naturalWidth / img.naturalHeight);
      }
    }
  }, [src, isVideo]);

  const handleImgRef = (el: HTMLImageElement | null) => {
    imgRefInternal.current = el;
    if (typeof mediaRef === "function") {
      mediaRef(el);
    } else if (mediaRef && "current" in mediaRef) {
      (mediaRef as React.MutableRefObject<HTMLImageElement | null>).current = el;
    }

    if (typeof imgProps?.ref === "function") {
      (imgProps.ref as any)(el);
    } else if (imgProps?.ref && "current" in imgProps.ref) {
      (imgProps.ref as any).current = el;
    }

    if (el && el.complete && el.naturalWidth && el.naturalHeight) {
      setRatio(el.naturalWidth / el.naturalHeight);
    }
  };

  const handleVideoRef = (el: HTMLVideoElement | null) => {
    if (typeof mediaRef === "function") {
      mediaRef(el);
    } else if (mediaRef && "current" in mediaRef) {
      (mediaRef as React.MutableRefObject<HTMLVideoElement | null>).current = el;
    }

    if (typeof videoProps?.ref === "function") {
      (videoProps.ref as any)(el);
    } else if (videoProps?.ref && "current" in videoProps.ref) {
      (videoProps.ref as any).current = el;
    }

    if (el && el.videoWidth && el.videoHeight) {
      setRatio(el.videoWidth / el.videoHeight);
    }
  };

  const safeRatio = Number.isFinite(ratio) && ratio > 0 ? ratio : 16 / 9;
  const boxRatio = Math.max(minRatio, Math.min(maxRatio, safeRatio));

  const stageStyle: React.CSSProperties =
    safeRatio >= boxRatio
      ? { width: "100%", aspectRatio: `${safeRatio}` }
      : { height: "100%", aspectRatio: `${safeRatio}` };

  return (
    <div
      className={`relative w-full overflow-hidden bg-slate-950 flex items-center justify-center reax-protected-media ${className}`}
      style={{ aspectRatio: `${boxRatio}` }}
      onClick={onClick}
      onContextMenu={onContextMenu}
    >
      {/* Background layer (images only): blurred cover letterbox */}
      {!isVideo && (
        <img
          src={src}
          crossOrigin={imgProps?.crossOrigin}
          referrerPolicy={imgProps?.referrerPolicy}
          {...protectedMediaProps}
          aria-hidden="true"
          alt=""
          className="absolute inset-0 w-full h-full object-cover scale-110 blur-2xl opacity-50 pointer-events-none select-none reax-protected-media"
        />
      )}

      {/* Stage: exactly matches the visible media area */}
      <div
        className={`relative flex items-center justify-center ${animClass || ""}`}
        style={stageStyle}
      >
        {isVideo ? (
          <video
            ref={handleVideoRef}
            src={src}
            {...protectedMediaProps}
            controlsList="nodownload noremoteplayback"
            disablePictureInPicture
            className="w-full h-full object-contain pointer-events-none select-none reax-protected-media"
            {...videoProps}
            onLoadedMetadata={(e) => {
              const v = e.currentTarget;
              if (v.videoWidth && v.videoHeight) {
                setRatio(v.videoWidth / v.videoHeight);
              }
              videoProps?.onLoadedMetadata?.(e);
            }}
          />
        ) : (
          <img
            ref={handleImgRef}
            src={src}
            {...protectedMediaProps}
            className="w-full h-full object-contain pointer-events-none select-none reax-protected-media"
            {...imgProps}
            onLoad={(e) => {
              const img = e.currentTarget;
              if (img.naturalWidth && img.naturalHeight) {
                setRatio(img.naturalWidth / img.naturalHeight);
              }
              imgProps?.onLoad?.(e);
            }}
          />
        )}
        {children}
      </div>

      {/* Outer children: overlays/controls rendered directly on the box */}
      {outerChildren}
    </div>
  );
}

export default FitMedia;
