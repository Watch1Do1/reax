import React, { useState } from "react";
import { ShieldCheck, FileText, Shield, AlertCircle, LogOut, CheckCircle2, ArrowRight } from "lucide-react";
import { 
  TERMS_VERSION, 
  PRIVACY_VERSION, 
  POLICY_EFFECTIVE_DATE,
  TERMS_OF_SERVICE_SECTIONS, 
  PRIVACY_POLICY_SECTIONS 
} from "../constants/policy";

interface PolicyReacceptModalProps {
  isOpen: boolean;
  username: string;
  onAccept: () => Promise<void>;
  onSignOut: () => void;
}

export default function PolicyReacceptModal({
  isOpen,
  username,
  onAccept,
  onSignOut
}: PolicyReacceptModalProps) {
  const [activeTab, setActiveTab] = useState<"terms" | "privacy">("terms");
  const [agreed, setAgreed] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleAccept = async () => {
    if (!agreed) {
      setError("Please check the box to agree to the updated policies before continuing.");
      return;
    }
    setError(null);
    setIsSubmitting(true);
    try {
      await onAccept();
    } catch (err: any) {
      setError(err?.message || "Failed to record acceptance. Please try again.");
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[200] bg-black/90 backdrop-blur-lg flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-indigo-500/40 rounded-3xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col shadow-2xl shadow-indigo-950/50">
        
        {/* Header (Blocking - No close button) */}
        <div className="p-6 border-b border-slate-800 bg-slate-950/60 flex items-start gap-4">
          <div className="w-12 h-12 rounded-2xl bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400 shrink-0">
            <ShieldCheck className="w-6 h-6" />
          </div>
          <div className="flex-1">
            <div className="flex flex-wrap items-center gap-2 mb-1">
              <span className="px-2 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-300 font-mono text-[10px] font-bold uppercase tracking-wider">
                Action Required
              </span>
              <span className="px-2 py-0.5 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-300 font-mono text-[10px] font-bold">
                Terms v{TERMS_VERSION} • Privacy v{PRIVACY_VERSION}
              </span>
              <span className="text-slate-500 text-[11px] font-mono">
                {POLICY_EFFECTIVE_DATE}
              </span>
            </div>
            <h2 className="text-lg md:text-xl font-sans font-black text-white tracking-tight">
              Updated Terms of Service & Privacy Policy
            </h2>
            <p className="text-xs text-slate-300 font-mono mt-1">
              Welcome back{username ? `, @${username}` : ""}! Please review and accept our updated policies to continue using Reax.
            </p>
          </div>
        </div>

        {/* Tab Switcher */}
        <div className="flex border-b border-slate-800 bg-slate-950/40 px-6 pt-3 gap-2">
          <button
            type="button"
            onClick={() => setActiveTab("terms")}
            className={`flex items-center gap-2 pb-3 px-3 text-xs font-mono font-bold transition-colors border-b-2 cursor-pointer ${
              activeTab === "terms"
                ? "border-indigo-500 text-white"
                : "border-transparent text-slate-400 hover:text-slate-200"
            }`}
          >
            <FileText className="w-3.5 h-3.5" />
            <span>Terms of Service (v{TERMS_VERSION})</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("privacy")}
            className={`flex items-center gap-2 pb-3 px-3 text-xs font-mono font-bold transition-colors border-b-2 cursor-pointer ${
              activeTab === "privacy"
                ? "border-indigo-500 text-white"
                : "border-transparent text-slate-400 hover:text-slate-200"
            }`}
          >
            <Shield className="w-3.5 h-3.5" />
            <span>Privacy Policy (v{PRIVACY_VERSION})</span>
          </button>
        </div>

        {/* Scrollable Document Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4 text-xs md:text-sm text-slate-300">
          
          {/* Key Changes Quick Summary */}
          <div className="p-3.5 bg-indigo-950/30 border border-indigo-800/40 rounded-2xl text-xs font-mono text-indigo-200 space-y-1">
            <p className="font-bold text-white flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4 text-indigo-400" />
              <span>Key Policy Highlights:</span>
            </p>
            <ul className="list-disc pl-5 space-y-0.5 text-indigo-200/90 text-[11px]">
              <li><strong>Minimum Age:</strong> Confirms users must be at least 13 years old.</li>
              <li><strong>Remixes & Reactions:</strong> Clarifies reaction and remix chains as core platform features.</li>
              <li><strong>Account Enforcement:</strong> Detailed rules on spam, abuse, copyright, and suspension.</li>
              <li><strong>Copyright Complaints:</strong> Direct DMCA reporting via support@getreax.com.</li>
              <li><strong>Data Retention & Providers:</strong> Transparent operational storage and infrastructure disclosures.</li>
            </ul>
          </div>

          {/* Full Sections */}
          {activeTab === "terms" ? (
            <div className="space-y-3">
              {TERMS_OF_SERVICE_SECTIONS.map((sec, idx) => (
                <div key={idx} className="bg-slate-950/50 border border-slate-800/60 rounded-xl p-3.5">
                  <h4 className="font-bold text-white text-xs mb-1 flex items-center gap-1.5">
                    <span className="text-indigo-400 font-mono text-[10px]">§{idx + 1}</span>
                    <span>{sec.title}</span>
                  </h4>
                  {Array.isArray(sec.content) ? (
                    <div className="space-y-1 text-slate-300 text-xs">
                      {sec.content.map((l, lIdx) => (
                        <p key={lIdx} className={l.startsWith("•") ? "pl-3 text-slate-300" : ""}>{l}</p>
                      ))}
                    </div>
                  ) : (
                    <p className="text-slate-300 text-xs">{sec.content}</p>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="space-y-3">
              {PRIVACY_POLICY_SECTIONS.map((sec, idx) => (
                <div key={idx} className="bg-slate-950/50 border border-slate-800/60 rounded-xl p-3.5">
                  <h4 className="font-bold text-white text-xs mb-1 flex items-center gap-1.5">
                    <span className="text-indigo-400 font-mono text-[10px]">§{idx + 1}</span>
                    <span>{sec.title}</span>
                  </h4>
                  {Array.isArray(sec.content) ? (
                    <div className="space-y-1 text-slate-300 text-xs">
                      {sec.content.map((l, lIdx) => (
                        <p key={lIdx} className={l.startsWith("•") ? "pl-3 text-slate-300" : ""}>{l}</p>
                      ))}
                    </div>
                  ) : (
                    <p className="text-slate-300 text-xs">{sec.content}</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Acceptance Footer */}
        <div className="p-5 border-t border-slate-800 bg-slate-950/80 space-y-3">
          
          {error && (
            <div className="p-2.5 rounded-xl bg-rose-950/40 border border-rose-800/60 text-rose-300 text-xs font-mono flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Mandatory Checkbox */}
          <label className="flex items-start gap-3 p-3 bg-slate-900 border border-slate-800 rounded-xl cursor-pointer select-none hover:border-slate-700 transition-colors">
            <input
              type="checkbox"
              checked={agreed}
              onChange={(e) => setAgreed(e.target.checked)}
              className="mt-0.5 rounded border-slate-700 text-indigo-600 focus:ring-0 bg-slate-950 cursor-pointer w-4 h-4"
            />
            <span className="text-xs font-mono text-slate-200 leading-snug">
              I have read and agree to the updated <strong>Terms of Service (v{TERMS_VERSION})</strong> and <strong>Privacy Policy (v{PRIVACY_VERSION})</strong>.
            </span>
          </label>

          {/* Action Buttons */}
          <div className="flex items-center justify-between gap-3 pt-1">
            <button
              type="button"
              onClick={onSignOut}
              className="px-4 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-400 hover:text-rose-300 text-xs font-mono flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Sign Out</span>
            </button>

            <button
              type="button"
              onClick={handleAccept}
              disabled={!agreed || isSubmitting}
              className="flex-1 py-2.5 px-6 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white font-mono font-bold text-xs uppercase tracking-wider transition-all shadow-lg shadow-indigo-900/30 flex items-center justify-center gap-2 cursor-pointer disabled:cursor-not-allowed"
            >
              <span>{isSubmitting ? "Recording Acceptance..." : "Accept & Continue"}</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>

        </div>

      </div>
    </div>
  );
}
