import React from "react";

// A hashtag is "#" + letters/numbers/underscore (any language), not preceded by a word char,
// "/", "&" or another "#" (so URL anchors like site.com/#top and "&#39;" are ignored).
const HASHTAG_RE = /(^|[^\p{L}\p{N}_/&#])#([\p{L}\p{N}_]+)/gu;
const TAG_ONLY_RE = /^#([\p{L}\p{N}_]+)$/u;
const URL_RE = /https?:\/\/\S+|www\.\S+/giu;

export const HASHTAG_EVENT = "reax_hashtag";

/** Lower-cased tags (without "#") found in text, ignoring anything inside URLs. */
export function extractHashtags(text: string | null | undefined): string[] {
  if (!text) return [];
  const clean = text.replace(URL_RE, " ");
  const out: string[] = [];
  for (const m of clean.matchAll(HASHTAG_RE)) out.push(m[2].toLowerCase());
  return out;
}

/** If the query is exactly one hashtag ("#Cats"), return "cats"; otherwise null. */
export function parseTagQuery(query: string): string | null {
  const m = query.trim().match(TAG_ONLY_RE);
  return m ? m[1].toLowerCase() : null;
}

export function openHashtag(tag: string) {
  window.dispatchEvent(new CustomEvent(HASHTAG_EVENT, { detail: { tag } }));
}

/** Render text with each #tag as a tappable button that opens the tag's filtered feed. */
export function renderWithHashtags(text: string | null | undefined, className = ""): React.ReactNode {
  if (!text) return text;
  const nodes: React.ReactNode[] = [];
  let last = 0;
  let key = 0;
  // Skip tags inside URLs by walking URL ranges separately.
  const urlRanges: Array<[number, number]> = [];
  for (const u of text.matchAll(URL_RE)) urlRanges.push([u.index!, u.index! + u[0].length]);
  for (const m of text.matchAll(HASHTAG_RE)) {
    const start = m.index! + m[1].length;
    if (urlRanges.some(([a, b]) => start >= a && start < b)) continue;
    const tag = m[2];
    if (start > last) nodes.push(text.slice(last, start));
    nodes.push(
      <button
        key={`tag-${key++}`}
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          e.preventDefault();
          openHashtag(tag);
        }}
        className={`pointer-events-auto inline cursor-pointer text-sky-300 hover:underline ${className}`}
        title={`See posts with #${tag}`}
      >
        #{tag}
      </button>
    );
    last = start + 1 + tag.length;
  }
  if (nodes.length === 0) return text;
  if (last < text.length) nodes.push(text.slice(last));
  return <>{nodes}</>;
}
