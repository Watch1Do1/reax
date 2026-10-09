import React from "react";
import { BadgeCheck } from "lucide-react";

export interface OfficialBadgeProps {
  className?: string;
  size?: "sm" | "md";
}

export function OfficialBadge({ className = "", size = "sm" }: OfficialBadgeProps) {
  return (
    <span
      className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-indigo-500/15 border border-indigo-500/30 text-indigo-300 font-bold font-mono tracking-wide select-none ${
        size === "md" ? "text-[10px]" : "text-[9px]"
      } ${className}`}
      title="Official Account"
    >
      <BadgeCheck className={`${size === "md" ? "w-3 h-3" : "w-2.5 h-2.5"} text-indigo-400 shrink-0`} />
      <span>Official</span>
    </span>
  );
}

export default OfficialBadge;
