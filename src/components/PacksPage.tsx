import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X, Lock, Bell, Check, Ticket, Sparkles } from "lucide-react";
import { REACTION_PACKS, ReactionPack, findPackItem } from "../packs/manifest";
import { PackFrame } from "../packs/render";
import { usePackOwnership } from "../packs/usePackOwnership";
import { getAuthToken } from "../utils/supabaseClient";
import { useBodyScrollLock } from "../hooks/useBodyScrollLock";
import { useBackToClose } from "../hooks/useBackToClose";

interface PacksPageProps {
  focusPackId?: string | null;
  username?: string | null;
  onClose: () => void;
}

const TONE_LABEL: Record<string, string> = {
  chaotic: "Chaos",
  funny: "Funny",
  dramatic: "Drama",
  sarcastic: "Sarcasm",
  chill: "Chill",
};

const pad = (n: number) => String(n).padStart(3, "0");
const packName = (id: string | null | undefined) => REACTION_PACKS.find((p) => p.id === id)?.name || "new";

// Quiet Packs page: what's in each pack, what you can use today (free samples),
// and a "Notify me" per pack. Not a store: no prices, no pushing.
function formatDeadline(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" });
}

export default function PacksPage({ focusPackId = null, username = null, onClose }: PacksPageProps) {
  useBodyScrollLock(true);
  useBackToClose(true, onClose);
  const ownership = usePackOwnership(username);
  const [interest, setInterest] = useState<string[]>([]);
  const [pendingPack, setPendingPack] = useState<string | null>(null);
  const [notifyError, setNotifyError] = useState<string | null>(null);
  const packRefs = useRef<Record<string, HTMLElement | null>>({});
  const [founder, setFounder] = useState<{
    foundingNumber: number | null;
    hasCode: boolean;
    codeExpiresAt: string | null;
    codeExpired: boolean;
    redeemedPackId: string | null;
    claimed: number | null;
    limit: number;
    full: boolean;
  } | null>(null);
  const [codeInput, setCodeInput] = useState("");
  const [codePack, setCodePack] = useState("");
  const [redeemBusy, setRedeemBusy] = useState(false);
  const [redeemMsg, setRedeemMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    if (!ownership.signedIn) return;
    let cancelled = false;
    (async () => {
      try {
        const token = await getAuthToken();
        const res = await fetch("/api/me/pack-interest", { headers: { Authorization: `Bearer ${token}` } });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (!cancelled) setInterest(Array.isArray(data.packIds) ? data.packIds : []);
      } catch (err) {
        console.error("Could not load pack notifications:", err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [ownership.signedIn]);

  useEffect(() => {
    if (focusPackId && packRefs.current[focusPackId]) {
      packRefs.current[focusPackId]!.scrollIntoView({ block: "start" });
    }
  }, [focusPackId]);

  const handleNotify = async (pack: ReactionPack) => {
    setNotifyError(null);
    setPendingPack(pack.id);
    try {
      const token = await getAuthToken();
      const res = await fetch("/api/me/pack-interest", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ packId: pack.id }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Could not save that. Try again.");
      setInterest((prev) => (prev.includes(pack.id) ? prev : [...prev, pack.id]));
    } catch (err: any) {
      setNotifyError(err?.message || "Could not save that. Try again.");
    } finally {
      setPendingPack(null);
    }
  };

  const loadFounder = async () => {
    try {
      const token = ownership.signedIn ? await getAuthToken() : null;
      const res = await fetch("/api/me/founder", token ? { headers: { Authorization: `Bearer ${token}` } } : undefined);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setFounder(await res.json());
    } catch (err) {
      console.error("Could not load founder status:", err);
    }
  };

  useEffect(() => {
    loadFounder();
  }, [ownership.signedIn]);

  const submitRedeem = async (url: string, body: Record<string, unknown>) => {
    setRedeemMsg(null);
    setRedeemBusy(true);
    try {
      const token = await getAuthToken();
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Could not redeem that. Try again.");
      setRedeemMsg({ ok: true, text: `Unlocked: the ${packName(data.packId)} Pack is yours forever.` });
      setCodeInput("");
      setCodePack("");
      await Promise.all([ownership.reload(), loadFounder()]);
      if (data.packId && packRefs.current[data.packId]) packRefs.current[data.packId]!.scrollIntoView({ block: "start", behavior: "smooth" });
    } catch (err: any) {
      setRedeemMsg({ ok: false, text: err?.message || "Could not redeem that. Try again." });
    } finally {
      setRedeemBusy(false);
    }
  };

  const handleRedeem = () => submitRedeem("/api/me/redeem", { code: codeInput, packId: codePack || null });
  const handleClaim = (packId: string) => submitRedeem("/api/me/founder/claim", { packId });

  const owns = (pack: ReactionPack) => ownership.isOfficial || ownership.ownedPackIds.includes(pack.id);

  return createPortal(
    <div className="fixed inset-0 z-[70] bg-[#050608]/97 backdrop-blur-md overflow-y-auto" role="dialog" aria-modal="true" aria-label="Reaction Packs">
      <div className="max-w-3xl mx-auto px-4 py-5 sm:py-8 space-y-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-black text-white tracking-tight">Reaction Packs</h1>
            <p className="text-xs text-slate-400 mt-1">
              Style kits for your reactions: fonts, colors, stickers, a frame, and effects. Every pack has one free item anyone can use.
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="p-2 rounded-full bg-slate-900 border border-slate-700 text-slate-200 hover:bg-slate-800 cursor-pointer">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Founder codes */}
        {founder?.foundingNumber && !ownership.isOfficial && (
          <div className="rounded-2xl border border-amber-500/40 bg-amber-950/20 p-4 space-y-2">
            {founder.redeemedPackId ? (
              <p className="text-sm font-bold text-amber-200">
                Founding #{pad(founder.foundingNumber)} · You picked the {packName(founder.redeemedPackId)} Pack. It's yours forever.
              </p>
            ) : founder.hasCode ? (
              <>
                <p className="text-sm font-bold text-amber-200">You're Founding #{pad(founder.foundingNumber)}. Pick your free pack.</p>
                <p className="text-[11px] text-amber-100/70">
                  One pack, free forever. No need to find the email, just tap one.
                  {founder.codeExpiresAt && <> Claim it by <b>{formatDeadline(founder.codeExpiresAt)}</b>.</>}
                </p>
                <div className="flex flex-wrap gap-2">
                  {REACTION_PACKS.filter((p) => !ownership.ownedPackIds.includes(p.id)).map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      disabled={redeemBusy}
                      onClick={() => handleClaim(p.id)}
                      className="px-3 py-1.5 rounded-xl text-xs font-bold bg-amber-500 text-black hover:bg-amber-400 disabled:opacity-50 cursor-pointer"
                    >
                      Claim {p.name}
                    </button>
                  ))}
                </div>
              </>
            ) : founder.codeExpired ? (
              <p className="text-sm font-bold text-amber-200">
                You're Founding #{pad(founder.foundingNumber)}. Your founder code expired{founder.codeExpiresAt ? ` on ${formatDeadline(founder.codeExpiresAt)}` : ""}. Email support@getreax.com if you missed it.
              </p>
            ) : (
              <p className="text-sm font-bold text-amber-200">
                You're Founding #{pad(founder.foundingNumber)}. Your founder code is on its way by email.
              </p>
            )}
          </div>
        )}

        {/* Founding 100 progress */}
        {founder && typeof founder.claimed === "number" && (
          <p className="text-[11px] font-mono text-amber-300/80">
            {founder.full
              ? `Founding ${founder.limit} is full. Thanks to everyone who joined early.`
              : `Founding ${founder.limit}: ${founder.claimed} of ${founder.limit} claimed.`}
          </p>
        )}

        <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-4 space-y-2">
          <div className="flex items-center gap-2 text-xs font-bold text-slate-300">
            <Ticket className="w-4 h-4 text-amber-400" />
            <span>Redeem a code</span>
          </div>
          {ownership.signedIn ? (
            <form
              className="flex flex-col sm:flex-row gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                handleRedeem();
              }}
            >
              <input
                type="text"
                value={codeInput}
                onChange={(e) => setCodeInput(e.target.value.toUpperCase())}
                placeholder="FOUNDER-XXXX-XXXX"
                autoCapitalize="characters"
                autoComplete="off"
                spellCheck={false}
                maxLength={24}
                className="flex-1 min-w-0 px-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-xs font-mono text-white placeholder:text-slate-600 focus:outline-none focus:border-amber-500"
              />
              <select
                value={codePack}
                onChange={(e) => setCodePack(e.target.value)}
                aria-label="Pack to unlock"
                className="px-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-xs text-white"
              >
                <option value="">Pick a pack…</option>
                {REACTION_PACKS.filter((p) => !ownership.ownedPackIds.includes(p.id)).map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
              <button
                type="submit"
                disabled={redeemBusy || !codeInput.trim()}
                className="px-3 py-2 rounded-xl text-xs font-bold bg-amber-500 text-black hover:bg-amber-400 disabled:bg-slate-800 disabled:text-slate-500 cursor-pointer"
              >
                {redeemBusy ? "Redeeming…" : "Redeem"}
              </button>
            </form>
          ) : (
            <p className="text-[10px] font-mono text-slate-500">Sign in to redeem a code.</p>
          )}
          {redeemMsg && (
            <p className={`text-[11px] font-mono ${redeemMsg.ok ? "text-emerald-300" : "text-rose-300"}`}>{redeemMsg.text}</p>
          )}
        </div>

        {ownership.isOfficial && (
          <p className="text-[11px] font-mono text-emerald-300 bg-emerald-950/30 border border-emerald-800/50 rounded-xl px-3 py-2">
            Official account: every pack is unlocked.
          </p>
        )}
        {notifyError && (
          <p className="text-[11px] font-mono text-rose-300 bg-rose-950/30 border border-rose-800/50 rounded-xl px-3 py-2">{notifyError}</p>
        )}

        {REACTION_PACKS.map((pack) => {
          const owned = owns(pack);
          const sampleId = pack.freeSampleId;
          const sampleKind = findPackItem(sampleId)?.kind;
          const unlocked = (id: string) => owned || id === sampleId;
          const notified = interest.includes(pack.id);
          return (
            <section
              key={pack.id}
              ref={(el) => {
                packRefs.current[pack.id] = el;
              }}
              className={`rounded-2xl border bg-slate-950/60 overflow-hidden scroll-mt-4 ${focusPackId === pack.id ? "border-indigo-500/60" : "border-slate-800"}`}
            >
              <img src={pack.cover} alt={`${pack.name} Pack preview`} className="w-full aspect-[1200/630] object-cover" />
              <div className="p-4 space-y-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h2 className="text-lg font-black text-white">{pack.name} Pack</h2>
                    <p className="text-xs text-slate-400 italic">"{pack.tagline}"</p>
                    <p className="text-[10px] font-mono text-slate-500 mt-1">Shows first when your mood is {TONE_LABEL[pack.tone]}</p>
                  </div>
                  {owned ? (
                    <span className="flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-emerald-600/20 text-emerald-300 border border-emerald-600/40">
                      <Check className="w-3 h-3" /> Unlocked
                    </span>
                  ) : (
                    <div className="flex flex-col items-end gap-1.5">
                      <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-slate-800 text-slate-300 border border-slate-700">Coming soon</span>
                      {ownership.signedIn ? (
                        <button
                          type="button"
                          disabled={notified || pendingPack === pack.id}
                          onClick={() => handleNotify(pack)}
                          className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold border transition-colors ${
                            notified ? "bg-indigo-600/20 text-indigo-300 border-indigo-600/40" : "bg-slate-900 text-slate-200 border-slate-700 hover:border-indigo-500 cursor-pointer"
                          }`}
                        >
                          {notified ? <Check className="w-3 h-3" /> : <Bell className="w-3 h-3" />}
                          {notified ? "We'll let you know" : pendingPack === pack.id ? "Saving…" : "Notify me"}
                        </button>
                      ) : (
                        <span className="text-[9px] font-mono text-slate-500">Sign in to get notified</span>
                      )}
                    </div>
                  )}
                </div>

                <p className="text-[11px] text-slate-300 flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                  Free for everyone: <span className="font-bold">{sampleKind === "frame" ? `the ${pack.frame.name} frame` : `the ${pack.stickers.find((s) => s.id === sampleId)?.name || "sample"} sticker`}</span> (in the post editor)
                </p>

                {/* Fonts */}
                <div className="space-y-1.5">
                  <h3 className="text-[10px] font-mono font-bold text-slate-500 uppercase tracking-wider">Fonts</h3>
                  <div className="grid grid-cols-2 gap-2">
                    {pack.fonts.map((f) => (
                      <div key={f.id} className="relative rounded-xl bg-slate-900 border border-slate-800 px-3 py-2">
                        <span className="block text-lg text-white truncate" style={{ fontFamily: `"${f.family}", sans-serif` }}>Aa Reax!</span>
                        <span className="text-[9px] font-mono text-slate-500">{f.name} · {f.role}</span>
                        {!unlocked(f.id) && <Lock className="absolute top-2 right-2 w-3 h-3 text-slate-500" />}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Palette */}
                <div className="space-y-1.5">
                  <h3 className="text-[10px] font-mono font-bold text-slate-500 uppercase tracking-wider">Palette</h3>
                  <div className="flex gap-2">
                    {pack.palette.map((c) => (
                      <div key={c.id} className="flex flex-col items-center gap-1" title={`${c.name} ${c.hex}`}>
                        <span className="w-8 h-8 rounded-lg border border-white/10" style={{ background: c.hex }} />
                        <span className="text-[8px] font-mono text-slate-500">{c.hex}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Stickers */}
                <div className="space-y-1.5">
                  <h3 className="text-[10px] font-mono font-bold text-slate-500 uppercase tracking-wider">Stickers</h3>
                  <div className="grid grid-cols-4 sm:grid-cols-8 gap-2">
                    {pack.stickers.map((s) => (
                      <div key={s.id} className="relative aspect-square rounded-xl bg-slate-900 border border-slate-800 p-1.5" title={s.name}>
                        <img src={s.src} alt={s.name} className={`w-full h-full ${unlocked(s.id) ? "" : "opacity-50"}`} />
                        {unlocked(s.id) ? (
                          s.id === sampleId && !owned && <span className="absolute -top-1.5 -right-1.5 px-1 rounded bg-amber-500 text-[7px] font-black text-black">FREE</span>
                        ) : (
                          <Lock className="absolute top-1 right-1 w-3 h-3 text-slate-400" />
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Frame, effects, caption style */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <div className="rounded-xl bg-slate-900 border border-slate-800 p-2 space-y-1.5">
                    <h3 className="text-[10px] font-mono font-bold text-slate-500 uppercase tracking-wider flex items-center justify-between">
                      Frame {!unlocked(pack.frame.id) && <Lock className="w-3 h-3" />}
                      {unlocked(pack.frame.id) && pack.frame.id === sampleId && !owned && <span className="px-1 rounded bg-amber-500 text-[7px] font-black text-black">FREE</span>}
                    </h3>
                    <div className="relative aspect-video rounded-lg bg-gradient-to-br from-slate-700 to-slate-800 overflow-hidden" style={{ containerType: "size" }}>
                      <PackFrame frameId={pack.frame.id} />
                    </div>
                    <p className="text-[10px] text-slate-300">{pack.frame.name}</p>
                  </div>
                  <div className="rounded-xl bg-slate-900 border border-slate-800 p-2 space-y-1">
                    <h3 className="text-[10px] font-mono font-bold text-slate-500 uppercase tracking-wider flex items-center justify-between">
                      Effects {!owned && <Lock className="w-3 h-3" />}
                    </h3>
                    {pack.effects.map((fx) => (
                      <p key={fx.id} className="text-[10px] text-slate-300"><span className="font-bold">{fx.name}</span> <span className="text-slate-500">· {fx.description}</span></p>
                    ))}
                  </div>
                  <div className="rounded-xl bg-slate-900 border border-slate-800 p-2 space-y-1">
                    <h3 className="text-[10px] font-mono font-bold text-slate-500 uppercase tracking-wider flex items-center justify-between">
                      Caption style {!owned && <Lock className="w-3 h-3" />}
                    </h3>
                    <p className="text-sm text-white" style={{ fontFamily: `"${pack.fonts.find((f) => f.id === pack.captionStyle.fontId)?.family}", sans-serif` }}>
                      {pack.captionStyle.name}
                    </p>
                  </div>
                </div>
              </div>
            </section>
          );
        })}

        <p className="text-[10px] font-mono text-slate-600 text-center pb-6">
          Fonts are SIL Open Font License. Stickers and frames are original Reax art.
        </p>
      </div>
    </div>,
    document.body
  );
}
