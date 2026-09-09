import React, { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Mail, Send, Copy, Check, ExternalLink, MessageSquare, AlertCircle, CheckCircle2 } from "lucide-react";

interface ContactModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultEmail?: string;
}

export default function ContactModal({
  isOpen,
  onClose,
  defaultEmail = ""
}: ContactModalProps) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState(defaultEmail);
  const [category, setCategory] = useState<string>("general");
  const [message, setMessage] = useState("");
  const [copied, setCopied] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitSuccess, setSubmitSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleCopyEmail = () => {
    navigator.clipboard.writeText("support@getreax.com");
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const cleanEmail = email.trim();
    const cleanMsg = message.trim();

    if (!cleanEmail || !cleanEmail.includes("@")) {
      setError("Please enter a valid email address so we can reply to you.");
      return;
    }

    if (!cleanMsg) {
      setError("Please enter a message.");
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          email: cleanEmail,
          category,
          message: cleanMsg
        })
      });

      if (!res.ok) {
        throw new Error("Failed to send message. Please email support@getreax.com directly.");
      }

      setSubmitSuccess(true);
      setMessage("");
    } catch (err: any) {
      setError(err?.message || "Failed to send message.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 12 }}
        className="w-full max-w-lg bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col"
      >
        {/* Header */}
        <div className="p-5 border-b border-slate-800 bg-slate-950/70 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400 shadow-md">
              <Mail className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white font-sans">
                Contact Support
              </h2>
              <p className="text-xs text-slate-400 font-mono">
                We're here to help with questions, feedback, and requests
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-white text-xs font-mono p-1.5 rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
          >
            ✕
          </button>
        </div>

        {/* Direct Email Card */}
        <div className="p-5 border-b border-slate-800/80 bg-slate-950/30 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <span className="text-[11px] font-mono text-slate-400 uppercase tracking-wider block mb-0.5">
              Direct Support Email
            </span>
            <span className="text-sm font-mono font-bold text-indigo-300 select-all">
              support@getreax.com
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleCopyEmail}
              className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-mono rounded-xl border border-slate-700 transition-colors cursor-pointer flex items-center gap-1.5"
            >
              {copied ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                  <span className="text-emerald-400 font-bold">Copied!</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5 text-slate-400" />
                  <span>Copy</span>
                </>
              )}
            </button>

            <a
              href="mailto:support@getreax.com?subject=Reax%20Support%20Request"
              className="px-3 py-1.5 bg-indigo-600/30 hover:bg-indigo-600/50 text-indigo-200 text-xs font-mono rounded-xl border border-indigo-500/40 transition-colors cursor-pointer flex items-center gap-1.5"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              <span>Open Mail App</span>
            </a>
          </div>
        </div>

        {/* Message Form or Success view */}
        <div className="p-5 flex-1">
          {submitSuccess ? (
            <div className="text-center py-6 space-y-3">
              <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center mx-auto text-emerald-400 shadow-md">
                <CheckCircle2 className="w-6 h-6" />
              </div>
              <h3 className="text-base font-bold text-white font-sans">Message Sent</h3>
              <p className="text-xs text-slate-300 font-mono max-w-sm mx-auto leading-relaxed">
                Thank you for reaching out! Your message was delivered to our support desk at <strong className="text-indigo-400">support@getreax.com</strong>. We typically respond within 24–48 hours.
              </p>
              <div className="pt-3">
                <button
                  type="button"
                  onClick={() => {
                    setSubmitSuccess(false);
                    onClose();
                  }}
                  className="px-5 py-2 bg-slate-800 hover:bg-slate-700 text-white font-mono text-xs rounded-xl transition-colors cursor-pointer"
                >
                  Done
                </button>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-3.5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-mono text-slate-400 mb-1">
                    Your Name <span className="text-slate-600">(optional)</span>
                  </label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. Alex"
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-xs font-mono text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-mono text-slate-400 mb-1">
                    Your Email <span className="text-indigo-400">*</span>
                  </label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    required
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-xs font-mono text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-mono text-slate-400 mb-1">
                  Topic / Category
                </label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-xs font-mono text-white focus:outline-none focus:border-indigo-500 cursor-pointer"
                >
                  <option value="general">General Support & Inquiries</option>
                  <option value="feedback">Feedback & Suggestions</option>
                  <option value="bug">Report a Bug / Issue</option>
                  <option value="moderation">Content / Account Removal Request</option>
                  <option value="privacy">Privacy & Compliance</option>
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-mono text-slate-400 mb-1">
                  Message <span className="text-indigo-400">*</span>
                </label>
                <textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  rows={4}
                  placeholder="How can we help you?"
                  required
                  className="w-full px-3 py-2.5 bg-slate-950 border border-slate-700 rounded-xl text-xs font-mono text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500 resize-none"
                />
              </div>

              {error && (
                <div className="p-2.5 rounded-xl bg-rose-950/40 border border-rose-800/60 text-rose-300 text-xs font-mono flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              <div className="pt-1 flex items-center justify-between gap-3">
                <span className="text-[10px] font-mono text-slate-500">
                  Response within 24–48 hours
                </span>

                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-mono font-bold text-xs rounded-xl transition-all shadow-md active:scale-95 cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>{isSubmitting ? "Sending..." : "Send Message"}</span>
                </button>
              </div>
            </form>
          )}
        </div>
      </motion.div>
    </div>
  );
}
