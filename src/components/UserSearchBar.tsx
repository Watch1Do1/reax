import React, { useState, useMemo, useRef, useEffect } from "react";
import { Search, X, User, Sparkles, ChevronRight, Film } from "lucide-react";
import { Clip } from "../types";

export interface UserSearchBarProps {
  clips: Clip[];
  activeUserFilter: string | null;
  onSelectUserFilter: (username: string | null) => void;
  onOpenUserProfile: (username: string) => void;
  searchQuery: string;
  onSearchQueryChange: (query: string) => void;
}

export default function UserSearchBar({
  clips,
  activeUserFilter,
  onSelectUserFilter,
  onOpenUserProfile,
  searchQuery,
  onSearchQueryChange
}: UserSearchBarProps) {
  const [isFocused, setIsFocused] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Compute unique creators with their reaction metrics
  const creators = useMemo(() => {
    const map = new Map<string, { username: string; clean: string; totalClips: number; rootPosts: number; replies: number; likes: number }>();

    clips.forEach(clip => {
      const raw = clip.authorName || "Guest";
      const clean = raw.trim().replace(/^@/, "");
      const key = clean.toLowerCase();

      if (!map.has(key)) {
        map.set(key, {
          username: clean,
          clean,
          totalClips: 0,
          rootPosts: 0,
          replies: 0,
          likes: 0
        });
      }

      const entry = map.get(key)!;
      entry.totalClips += 1;
      entry.likes += clip.likesCount || 0;
      if (clip.parentId === null) {
        entry.rootPosts += 1;
      } else {
        entry.replies += 1;
      }
    });

    return Array.from(map.values()).sort((a, b) => b.totalClips - a.totalClips);
  }, [clips]);

  // Filter creators based on search query
  const queryLower = searchQuery.trim().toLowerCase().replace(/^@/, "");
  const matchingCreators = useMemo(() => {
    if (!queryLower) return creators.slice(0, 5); // Default top creators
    return creators.filter(c => c.clean.toLowerCase().includes(queryLower));
  }, [creators, queryLower]);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsFocused(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div ref={containerRef} className="relative w-full">
      {/* Search Input Box */}
      <div className={`relative flex items-center bg-slate-900/90 border transition-all rounded-2xl ${
        isFocused ? "border-indigo-500 shadow-[0_0_15px_rgba(99,102,241,0.15)] ring-1 ring-indigo-500/30" : "border-slate-800/80 hover:border-slate-700"
      }`}>
        <Search className="w-4 h-4 text-slate-400 ml-3.5 flex-shrink-0" />
        
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => onSearchQueryChange(e.target.value)}
          onFocus={() => setIsFocused(true)}
          placeholder="Search user @username or text..."
          className="w-full bg-transparent py-2.5 px-3 text-xs sm:text-sm text-slate-100 placeholder-slate-500 outline-none"
        />

        {searchQuery && (
          <button
            onClick={() => onSearchQueryChange("")}
            className="p-1.5 mr-2 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
            title="Clear search"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* Active User Filter Chip if a user filter is active */}
      {activeUserFilter && (
        <div className="mt-2 flex items-center justify-between bg-indigo-950/40 border border-indigo-500/30 rounded-xl px-3 py-1.5 text-xs">
          <div className="flex items-center gap-2 truncate">
            <span className="text-slate-400 font-mono text-[11px]">Filtered user:</span>
            <button
              onClick={() => onOpenUserProfile(activeUserFilter)}
              className="font-bold text-indigo-300 hover:text-indigo-200 hover:underline cursor-pointer flex items-center gap-1"
            >
              <span>@{activeUserFilter}</span>
            </button>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => onOpenUserProfile(activeUserFilter)}
              className="px-2 py-0.5 rounded-md bg-indigo-500/20 hover:bg-indigo-500/30 text-indigo-300 text-[10px] font-mono transition-colors cursor-pointer"
            >
              Profile
            </button>
            <button
              onClick={() => onSelectUserFilter(null)}
              className="p-1 text-slate-400 hover:text-rose-400 rounded transition-colors cursor-pointer"
              title="Remove filter"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* Suggested Users Dropdown (Opens on Focus or Typing) */}
      {isFocused && (
        <div className="absolute top-full left-0 right-0 mt-1.5 bg-slate-900/98 backdrop-blur-xl border border-slate-800 rounded-2xl shadow-2xl py-2 z-40 overflow-hidden">
          <div className="px-3 py-1.5 flex items-center justify-between border-b border-slate-800/60 text-[10px] font-mono text-slate-400 uppercase tracking-wider">
            <span>{queryLower ? `Matching Users (${matchingCreators.length})` : "Active Creators"}</span>
            <span className="text-slate-500">Tap to inspect reactions</span>
          </div>

          <div className="max-h-56 overflow-y-auto divide-y divide-slate-800/40">
            {matchingCreators.length === 0 ? (
              <div className="p-4 text-center text-xs text-slate-500">
                No users found matching "@{queryLower}".
              </div>
            ) : (
              matchingCreators.map((creator) => (
                <div
                  key={creator.clean}
                  className="px-3 py-2.5 hover:bg-slate-800/60 flex items-center justify-between gap-3 transition-colors group cursor-pointer"
                  onClick={() => {
                    setIsFocused(false);
                    onOpenUserProfile(creator.clean);
                  }}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-7 h-7 rounded-full bg-indigo-600/30 border border-indigo-500/30 text-indigo-300 font-bold font-mono text-xs flex items-center justify-center flex-shrink-0 group-hover:bg-indigo-600 group-hover:text-white transition-colors">
                      {creator.clean[0]?.toUpperCase() || "U"}
                    </div>
                    <div className="truncate">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-bold text-slate-200 group-hover:text-white truncate">
                          @{creator.clean}
                        </span>
                        {creator.clean.startsWith("~") ? (
                          <span className="text-[8px] px-1 bg-slate-950 border border-slate-800 rounded text-slate-500 font-mono">GUEST</span>
                        ) : (
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" title="Member" />
                        )}
                      </div>
                      <span className="text-[10px] text-slate-500 font-mono">
                        {creator.totalClips} {creator.totalClips === 1 ? "reaction" : "reactions"} • {creator.likes} likes
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 opacity-80 group-hover:opacity-100 flex-shrink-0">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setIsFocused(false);
                        onSelectUserFilter(creator.clean);
                      }}
                      className="px-2 py-1 rounded-lg bg-slate-800 hover:bg-indigo-600/30 border border-slate-700 hover:border-indigo-500/40 text-[10px] font-mono text-slate-300 hover:text-indigo-200 transition-all"
                      title="Filter main feed to this user"
                    >
                      Filter Feed
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setIsFocused(false);
                        onOpenUserProfile(creator.clean);
                      }}
                      className="px-2 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-[10px] font-mono font-bold flex items-center gap-1 shadow-sm transition-all"
                      title="View user profile & reactions"
                    >
                      <span>View</span>
                      <ChevronRight className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Quick filter chips for top creators */}
          <div className="p-2.5 bg-slate-950/60 border-t border-slate-800/80 flex items-center gap-1.5 overflow-x-auto text-xs">
            <span className="text-[10px] font-mono text-slate-500 whitespace-nowrap pl-1">Quick:</span>
            {creators.slice(0, 4).map(c => (
              <button
                key={`quick-${c.clean}`}
                onClick={() => {
                  setIsFocused(false);
                  onOpenUserProfile(c.clean);
                }}
                className="px-2 py-0.5 rounded-lg bg-slate-800 hover:bg-indigo-950/60 border border-slate-700 hover:border-indigo-500/40 text-[10px] font-mono text-slate-300 hover:text-indigo-300 whitespace-nowrap transition-colors cursor-pointer"
              >
                @{c.clean}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
