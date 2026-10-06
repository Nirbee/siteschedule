"use client";

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
