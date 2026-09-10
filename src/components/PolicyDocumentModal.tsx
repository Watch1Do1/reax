import React from "react";
import { X, FileText, Shield, Mail } from "lucide-react";
import { 
  TERMS_VERSION, 
  PRIVACY_VERSION, 
  POLICY_EFFECTIVE_DATE, 
  TERMS_OF_SERVICE_SECTIONS, 
  PRIVACY_POLICY_SECTIONS 
} from "../constants/policy";

interface PolicyDocumentModalProps {
  type: "terms" | "privacy" | null;
  onClose: () => void;
  onOpenContact?: () => void;
}

export default function PolicyDocumentModal({ type, onClose, onOpenContact }: PolicyDocumentModalProps) {
  if (!type) return null;

  const isTerms = type === "terms";
  const title = isTerms ? "Terms of Service" : "Privacy Policy";
  const version = isTerms ? TERMS_VERSION : PRIVACY_VERSION;
  const sections = isTerms ? TERMS_OF_SERVICE_SECTIONS : PRIVACY_POLICY_SECTIONS;

  return (
    <div className="fixed inset-0 z-[120] bg-black/85 backdrop-blur-md flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-2xl max-h-[85vh] overflow-y-auto p-6 md:p-8 relative shadow-2xl space-y-6 text-slate-200">
        
        {/* Close Button */}
        <button 
          onClick={onClose}
          className="absolute top-4 right-4 text-slate-400 hover:text-white px-3 py-1.5 bg-slate-950 border border-slate-800 hover:border-slate-700 rounded-xl font-mono text-xs cursor-pointer flex items-center gap-1.5 transition-colors"
        >
          <X className="w-3.5 h-3.5" />
          <span>Close</span>
        </button>

        {/* Header */}
        <div className="border-b border-slate-800/80 pb-4">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-8 h-8 rounded-xl bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
              {isTerms ? <FileText className="w-4 h-4" /> : <Shield className="w-4 h-4" />}
            </div>
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 rounded-md bg-indigo-500/10 border border-indigo-500/20 text-indigo-300 font-mono text-[10px] font-bold uppercase tracking-wider">
                Version {version}
              </span>
              <span className="text-slate-500 text-[11px] font-mono">
                Effective: {POLICY_EFFECTIVE_DATE}
              </span>
            </div>
          </div>
          <h2 className="text-xl md:text-2xl font-sans font-black text-white tracking-tight">
            {title}
          </h2>
          <p className="text-xs text-slate-400 mt-1 font-mono">
            getreax.com • Reax Community Platform
          </p>
        </div>

        {/* Document Sections */}
        <div className="space-y-4 text-xs md:text-sm leading-relaxed text-slate-300">
          {sections.map((sec, idx) => (
            <div key={idx} className="bg-slate-950/40 border border-slate-800/50 rounded-2xl p-4">
              <h3 className="font-bold text-white text-sm mb-1.5 flex items-center gap-1.5">
                <span className="text-indigo-400 font-mono text-xs">§{idx + 1}</span>
                <span>{sec.title}</span>
              </h3>
              {Array.isArray(sec.content) ? (
                <div className="space-y-1 mt-1 text-slate-300">
                  {sec.content.map((line, lIdx) => (
                    <p key={lIdx} className={line.startsWith("•") ? "pl-3 text-slate-300" : ""}>
                      {line}
                    </p>
                  ))}
                </div>
              ) : (
                <p className="text-slate-300">
                  {sec.content}
                </p>
              )}
            </div>
          ))}
        </div>

        {/* Footer Contact & Actions */}
        <div className="pt-4 border-t border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-3 text-xs font-mono text-slate-400">
            <a href="mailto:support@getreax.com" className="text-amber-400 hover:underline flex items-center gap-1">
              <Mail className="w-3.5 h-3.5" />
              <span>support@getreax.com</span>
            </a>
            {onOpenContact && (
              <>
                <span>•</span>
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onOpenContact();
                  }}
                  className="text-indigo-400 hover:text-indigo-300 underline cursor-pointer"
                >
                  Contact Form
                </button>
              </>
            )}
          </div>

          <button 
            type="button"
            onClick={onClose}
            className="w-full sm:w-auto px-6 py-2 bg-indigo-600 hover:bg-indigo-500 font-bold text-xs text-white rounded-xl uppercase tracking-wider transition-colors cursor-pointer shadow-md"
          >
            I Understand
          </button>
        </div>

      </div>
    </div>
  );
}
