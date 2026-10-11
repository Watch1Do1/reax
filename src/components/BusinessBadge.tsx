import React from "react";
import { Building2 } from "lucide-react";

export interface BusinessBadgeProps {
  className?: string;
  size?: "sm" | "md";
}

export function BusinessBadge({ className = "", size = "sm" }: BusinessBadgeProps) {
  return (
    <span
      className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-amber-500/15 border border-amber-500/30 text-amber-300 font-bold font-mono tracking-wide select-none ${
        size === "md" ? "text-[10px]" : "text-[9px]"
      } ${className}`}
      title="Verified Business"
    >
      <Building2 className={`${size === "md" ? "w-3 h-3" : "w-2.5 h-2.5"} text-amber-400 shrink-0`} />
      <span>Business</span>
    </span>
  );
}

export default BusinessBadge;
