"use client";

import { useEffect, useRef, useState } from "react";
import { Minus, Plus } from "lucide-react";

export const MIN_ZOOM = 0.5;
export const MAX_ZOOM = 3;

/** Floating «− 12 / 372 +» bar at the bottom of document viewers. */
export function ZoomBar({
  current,
  total,
  onZoom,
}: {
  current: number;
  total: number;
  onZoom: (update: (zoom: number) => number) => void;
}) {
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-[max(12px,env(safe-area-inset-bottom))] flex justify-center">
      <div className="pointer-events-auto flex items-center gap-1 rounded-full bg-viewer/85 px-2 py-1 text-on-viewer shadow-lg">
        <button
          type="button"
          aria-label="Уменьшить"
          onClick={() => onZoom((z) => Math.max(MIN_ZOOM, +(z - 0.25).toFixed(2)))}
          className="flex size-10 items-center justify-center rounded-full hover:bg-on-viewer/10"
        >
          <Minus size={20} />
        </button>
        <span className="min-w-[88px] text-center font-mono text-[13px]">
          {current} / {total}
        </span>
        <button
          type="button"
          aria-label="Увеличить"
          onClick={() => onZoom((z) => Math.min(MAX_ZOOM, +(z + 0.25).toFixed(2)))}
          className="flex size-10 items-center justify-center rounded-full hover:bg-on-viewer/10"
        >
          <Plus size={20} />
        </button>
      </div>
    </div>
  );
}

/** Page under the upper third of the scroller (for the «12 / 372» counter). */
export function pageAtScroll(scroller: HTMLElement, pages: (HTMLElement | null)[]): number {
  const line = scroller.scrollTop + scroller.clientHeight / 3;
  let current = 1;
  pages.forEach((box, i) => {
    if (box && box.offsetTop <= line) current = i + 1;
  });
  return current;
}

/**
 * Opens a document at a given page (from search results). Keeps re-aligning while page
 * heights settle, until the reader touches the document. Returns a function to call after
 * a page changed its height.
 */
export function useJumpToPage(
  scroller: React.RefObject<HTMLDivElement | null>,
  pages: React.RefObject<(HTMLDivElement | null)[]>,
  page: number | undefined,
  ready: boolean,
  layout: unknown,
): () => void {
  const pending = useRef(page && page > 1 ? page : 0);

  // Stable across renders (the renderer's callbacks depend on it); reads refs only when called.
  const [align] = useState(() => () => {
    const el = scroller.current;
    const box = pages.current[pending.current - 1];
    if (el && box && pending.current) el.scrollTo({ top: box.offsetTop - 12 });
  });

  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const stop = () => (pending.current = 0);
    el.addEventListener("wheel", stop, { passive: true });
    el.addEventListener("touchstart", stop, { passive: true });
    el.addEventListener("pointerdown", stop);
    el.addEventListener("keydown", stop);
    return () => {
      el.removeEventListener("wheel", stop);
      el.removeEventListener("touchstart", stop);
      el.removeEventListener("pointerdown", stop);
      el.removeEventListener("keydown", stop);
    };
  }, [scroller]);

  useEffect(() => {
    if (ready) align();
  }, [ready, layout, align]);

  return align;
}
