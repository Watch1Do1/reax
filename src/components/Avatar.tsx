import React, { useState } from "react";

export interface AvatarProps {
  url?: string | null;
  name: string;
  size?: number;
  className?: string;
}

export function Avatar({ url, name, size = 28, className = "" }: AvatarProps) {
  const [hasError, setHasError] = useState(false);

  const ok =
    typeof url === "string" &&
    /^https:\/\/[a-z0-9-]+\.supabase\.co\/storage\/v1\/object\/public\/(media|reactions)\/avatars\//.test(
      url
    );

  const rounded = className.includes("rounded-") ? "" : "rounded-full";
  const defaultBg = className.includes("bg-")
    ? ""
    : "bg-gradient-to-tr from-indigo-500/20 to-purple-500/20 border border-white/10 text-indigo-300";

  if (ok && !hasError) {
    return (
      <img
        src={url}
        alt=""
        width={size}
        height={size}
        loading="lazy"
        draggable={false}
        onError={() => setHasError(true)}
        className={`${rounded} object-cover shrink-0 ${className}`.trim()}
        style={{ width: `${size}px`, height: `${size}px` }}
      />
    );
  }

  const initial = (name.replace(/^[@~]/, "")[0] || "U").toUpperCase();

  return (
    <div
      className={`${rounded} ${defaultBg} flex items-center justify-center font-bold shrink-0 select-none ${className}`.trim()}
      style={{
        width: `${size}px`,
        height: `${size}px`,
        fontSize: Math.max(10, Math.round(size * 0.42)),
      }}
    >
      {initial}
    </div>
  );
}

export default Avatar;
