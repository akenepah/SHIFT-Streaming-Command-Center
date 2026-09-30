"use client";
import { Info } from "lucide-react";
import { useState } from "react";
import { AnchoredPopover } from "./Popover";

export function Help({ label, children }: { label: string; children: React.ReactNode }) {
  const [anchor, setAnchor] = useState<HTMLButtonElement | null>(null);
  return <>
    <button type="button" aria-label={`About ${label}`} aria-expanded={!!anchor} aria-haspopup="dialog" onClick={e => setAnchor(anchor ? null : e.currentTarget)} className="inline-flex size-11 shrink-0 items-center justify-center rounded-control text-ink-2 hover:bg-surface-muted"><Info aria-hidden className="size-4" /></button>
    {anchor && <AnchoredPopover anchor={anchor} onClose={() => setAnchor(null)} label={`About ${label}`} width={280} placement="below-end"><div className="p-3 text-body-sm text-ink"><p>{children}</p><button type="button" className="mt-2 min-h-11 font-semibold text-primary-strong" onClick={() => { const trigger = anchor; setAnchor(null); trigger.focus(); }}>Got it</button></div></AnchoredPopover>}
  </>;
}
