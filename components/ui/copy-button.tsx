"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";

/** Square copy-to-clipboard button. */
export function CopyButton({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      aria-label={label}
      onClick={async () => {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }}
      className="flex size-11 shrink-0 items-center justify-center rounded-field border border-line-strong text-ink-2 hover:bg-chip"
    >
      {copied ? <Check size={18} aria-hidden /> : <Copy size={18} aria-hidden />}
    </button>
  );
}
