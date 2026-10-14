import React, { useEffect, useState } from "react";
import { Lock, Trash2, ArrowRight } from "lucide-react";
import { ReactionPack, canUseItem, packsForTone } from "../packs/manifest";
import { ClipStyle, MAX_STICKERS, PlacedSticker, STICKER_SCALE_MAX, STICKER_SCALE_MIN } from "../packs/style";
import { PackFrame, openPacksPage } from "../packs/render";

export type PackStyleDraft = Omit<ClipStyle, "v" | "packId">;

export const EMPTY_PACK_DRAFT: PackStyleDraft = {};

interface PackStylePickerProps {
  tone: string;
  ownedPackIds: string[];
  draft: PackStyleDraft;
  onChange: (next: PackStyleDraft) => void;
  selectedSticker: number | null;
  onSelectSticker: (index: number | null) => void;
  hasCaption: boolean;
}

type SingleKey = "font" | "color" | "frame" | "caption" | "effect";

// Reaction Pack styling for the reply editor. Only owned items (and each pack's
// free sample) can be picked; the rest show a lock. The pack matching the
// current mood is listed first.
export default function PackStylePicker({ tone, ownedPackIds, draft, onChange, selectedSticker, onSelectSticker, hasCaption }: PackStylePickerProps) {
  const ordered = packsForTone(tone);
  const [activeId, setActiveId] = useState<string>(ordered[0].id);

  // When the mood changes, jump to the matching pack.
  useEffect(() => {
    setActiveId(packsForTone(tone)[0].id);
  }, [tone]);

  const pack: ReactionPack = ordered.find((p) => p.id === activeId) || ordered[0];
  const usable = (id: string) => canUseItem(id, ownedPackIds);
  const stickers = draft.stickers || [];

  const toggle = (key: SingleKey, id: string) => {
    if (!usable(id)) return;
    onChange({ ...draft, [key]: draft[key] === id ? undefined : id });
  };

  const addSticker = (id: string) => {
    if (!usable(id) || stickers.length >= MAX_STICKERS) return;
    // Stagger new stickers a little so they don't stack exactly.
    const offset = (stickers.length % 4) * 0.06;
    const next: PlacedSticker = { id, x: 0.5 + offset - 0.09, y: 0.4 + offset - 0.09, scale: 1, rot: 0 };
    onChange({ ...draft, stickers: [...stickers, next] });
    onSelectSticker(stickers.length);
  };

  const updateSticker = (index: number, patch: Partial<PlacedSticker>) => {
    onChange({ ...draft, stickers: stickers.map((s, i) => (i === index ? { ...s, ...patch } : s)) });
  };

  const removeSticker = (index: number) => {
    onChange({ ...draft, stickers: stickers.filter((_, i) => i !== index) });
    onSelectSticker(null);
  };

  const hasAny = Boolean(draft.font || draft.color || draft.frame || draft.caption || draft.effect || stickers.length);

  const chip = (selected: boolean, locked: boolean) =>
    `relative flex items-center justify-center rounded-lg border text-center transition-all ${
      locked
        ? "bg-slate-900/40 border-slate-800/60 text-slate-600 cursor-not-allowed"
        : selected
          ? "bg-indigo-600/20 border-indigo-500 text-indigo-200 cursor-pointer"
          : "bg-slate-900/80 border-slate-800 hover:border-slate-700 text-slate-300 cursor-pointer"
    }`;

  const LockBadge = () => <Lock className="absolute top-0.5 right-0.5 w-2.5 h-2.5 text-slate-500" aria-label="Coming soon" />;
  const label = "block text-[9px] font-bold text-slate-400 font-mono tracking-wider uppercase";

  return (
    <div className="space-y-2.5 pt-2 border-t border-slate-800/40">
      <div className="flex items-center justify-between">
        <label className="block text-[10px] font-bold text-slate-400 font-mono tracking-wider">REACTION PACK STYLES:</label>
        {hasAny && (
          <button
            type="button"
            onClick={() => {
              onChange(EMPTY_PACK_DRAFT);
              onSelectSticker(null);
            }}
            className="text-[9px] font-mono text-slate-500 hover:text-rose-300 font-bold uppercase cursor-pointer"
          >
            Clear
          </button>
        )}
      </div>

      {/* Pack tabs (mood match first) */}
      <div className="flex gap-1 overflow-x-auto pb-0.5">
        {ordered.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => setActiveId(p.id)}
            className={`flex-shrink-0 flex items-center gap-1 px-2 py-1 rounded-full border text-[9px] font-bold transition-all cursor-pointer ${
              p.id === pack.id ? "bg-slate-800 border-slate-600 text-white" : "bg-slate-900/80 border-slate-800 text-slate-400 hover:text-slate-200"
            }`}
          >
            <span className="w-1.5 h-1.5 rounded-full" style={{ background: p.accent }} />
            {p.name}
            {!ownedPackIds.includes(p.id) && <Lock className="w-2.5 h-2.5 text-slate-500" />}
          </button>
        ))}
      </div>

      {/* Caption style + fonts */}
      <div className="space-y-1">
        <span className={label}>Caption{!hasCaption && <span className="normal-case font-normal text-slate-600"> · add overlay text to see it</span>}</span>
        <div className="grid grid-cols-3 gap-1">
          {(() => {
            const cap = pack.captionStyle;
            const locked = !usable(cap.id);
            const font = pack.fonts.find((f) => f.id === cap.fontId);
            return (
              <button type="button" disabled={locked} onClick={() => toggle("caption", cap.id)} className={`${chip(draft.caption === cap.id, locked)} py-1.5 px-1 text-[10px]`} title={locked ? "Coming soon" : `One-tap style: ${cap.name}`} style={{ fontFamily: `"${font?.family}", sans-serif` }}>
                <span className="truncate">{cap.name}</span>
                {locked && <LockBadge />}
              </button>
            );
          })()}
          {pack.fonts.map((f) => {
            const locked = !usable(f.id);
            return (
              <button key={f.id} type="button" disabled={locked} onClick={() => toggle("font", f.id)} className={`${chip(draft.font === f.id, locked)} py-1.5 px-1 text-[11px]`} title={locked ? "Coming soon" : f.name} style={{ fontFamily: `"${f.family}", sans-serif` }}>
                <span className="truncate">{f.name}</span>
                {locked && <LockBadge />}
              </button>
            );
          })}
        </div>
      </div>

      {/* Colors */}
      <div className="space-y-1">
        <span className={label}>Caption color</span>
        <div className="flex gap-1.5">
          {pack.palette.map((c) => {
            const locked = !usable(c.id);
            return (
              <button
                key={c.id}
                type="button"
                disabled={locked}
                onClick={() => toggle("color", c.id)}
                title={locked ? `${c.name} (coming soon)` : c.name}
                className={`relative w-7 h-7 rounded-lg border-2 transition-all ${locked ? "opacity-40 cursor-not-allowed border-transparent" : draft.color === c.id ? "border-indigo-400 scale-110 cursor-pointer" : "border-white/10 cursor-pointer"}`}
                style={{ background: c.hex }}
              >
                {locked && <Lock className="absolute inset-0 m-auto w-3 h-3 text-white mix-blend-difference" />}
              </button>
            );
          })}
        </div>
      </div>

      {/* Frame + effects (None clears pack effect; selected when unset) */}
      <div className="grid grid-cols-4 gap-1">
        {(() => {
          const locked = !usable(pack.frame.id);
          return (
            <button type="button" disabled={locked} onClick={() => toggle("frame", pack.frame.id)} className={`${chip(draft.frame === pack.frame.id, locked)} flex-col p-1`} title={locked ? "Coming soon" : `Frame: ${pack.frame.name}`}>
              <span className="relative block w-full aspect-video rounded bg-slate-700 overflow-hidden" style={{ containerType: "size" }}>
                <PackFrame frameId={pack.frame.id} />
              </span>
              <span className="text-[8px] font-bold mt-0.5 truncate max-w-full">{pack.frame.name}</span>
              {locked && <LockBadge />}
            </button>
          );
        })()}
        <button
          type="button"
          onClick={() => onChange({ ...draft, effect: undefined })}
          className={`${chip(!draft.effect, false)} flex-col p-1.5`}
          title="No visual effect"
        >
          <span className="text-[9px] font-black uppercase">None</span>
          <span className="text-[7.5px] font-mono text-slate-500">effect</span>
        </button>
        {pack.effects.map((fx) => {
          const locked = !usable(fx.id);
          return (
            <button key={fx.id} type="button" disabled={locked} onClick={() => toggle("effect", fx.id)} className={`${chip(draft.effect === fx.id, locked)} flex-col p-1.5`} title={locked ? "Coming soon" : fx.description}>
              <span className="text-[9px] font-black uppercase">{fx.name}</span>
              <span className="text-[7.5px] font-mono text-slate-500">effect</span>
              {locked && <LockBadge />}
            </button>
          );
        })}
      </div>

      {/* Stickers */}
      <div className="space-y-1">
        <span className={label}>Stickers <span className="normal-case font-normal text-slate-600">· tap to add, drag on the picture ({stickers.length}/{MAX_STICKERS})</span></span>
        <div className="grid grid-cols-8 gap-1">
          {pack.stickers.map((s) => {
            const locked = !usable(s.id);
            return (
              <button key={s.id} type="button" disabled={locked || stickers.length >= MAX_STICKERS} onClick={() => addSticker(s.id)} className={`${chip(false, locked)} aspect-square p-1`} title={locked ? `${s.name} (coming soon)` : `Add ${s.name}`}>
                <img src={s.src} alt={s.name} className={`w-full h-full ${locked ? "opacity-30" : ""}`} draggable={false} />
                {locked && <LockBadge />}
              </button>
            );
          })}
        </div>
      </div>

      {selectedSticker !== null && stickers[selectedSticker] && (
        <div className="flex items-center gap-2 bg-slate-900/60 border border-slate-800 rounded-xl p-2">
          <label className="flex-1 text-[9px] font-mono text-slate-400">
            Size
            <input
              type="range"
              min={STICKER_SCALE_MIN}
              max={STICKER_SCALE_MAX}
              step={0.05}
              value={stickers[selectedSticker].scale}
              onChange={(e) => updateSticker(selectedSticker, { scale: Number(e.target.value) })}
              className="w-full"
            />
          </label>
          <label className="flex-1 text-[9px] font-mono text-slate-400">
            Turn
            <input
              type="range"
              min={-180}
              max={180}
              step={1}
              value={stickers[selectedSticker].rot}
              onChange={(e) => updateSticker(selectedSticker, { rot: Number(e.target.value) })}
              className="w-full"
            />
          </label>
          <button type="button" onClick={() => removeSticker(selectedSticker)} className="p-1.5 rounded-lg bg-rose-950/60 border border-rose-800/60 text-rose-300 hover:text-white cursor-pointer" title="Remove sticker">
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      <div className="flex justify-end">
        <button type="button" onClick={() => openPacksPage(pack.id)} className="flex items-center gap-1 text-[9px] font-mono text-indigo-400 hover:text-indigo-300 cursor-pointer">
          Get more styles <ArrowRight className="w-3 h-3" />
        </button>
      </div>
    </div>
  );
}
