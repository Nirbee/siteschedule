"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Download, X, ZoomIn, ZoomOut } from "lucide-react";

export interface ViewerPhoto {
  id: string;
  width: number | null;
  height: number | null;
  caption?: string;
}

/** Grid of 4:3 previews (slides are landscape); a tap opens the full-screen viewer. */
export function PhotoGrid({ photos }: { photos: ViewerPhoto[] }) {
  const [open, setOpen] = useState<number | null>(null);

  return (
    <>
      <ul className="grid grid-cols-[repeat(auto-fill,minmax(140px,1fr))] gap-2">
        {photos.map((photo, i) => (
          <li key={photo.id}>
            <button
              type="button"
              onClick={() => setOpen(i)}
              aria-label={`Открыть фото ${i + 1} из ${photos.length}`}
              className="block aspect-[4/3] w-full overflow-hidden rounded-[10px] bg-chip"
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- private, session-checked URLs */}
              <img
                src={`/media/${photo.id}/preview`}
                alt=""
                loading="lazy"
                decoding="async"
                className="size-full object-cover transition-transform hover:scale-[1.03]"
              />
            </button>
          </li>
        ))}
      </ul>
      {open !== null ? (
        <PhotoViewer photos={photos} start={open} onClose={() => setOpen(null)} />
      ) : null}
    </>
  );
}

/**
 * Full-screen viewer: swipe or arrows between photos, double tap / button to zoom
 * (zoomed photo scrolls to pan — enough to read small text on a slide), Esc to close.
 */
function PhotoViewer({
  photos,
  start,
  onClose,
}: {
  photos: ViewerPhoto[];
  start: number;
  onClose: () => void;
}) {
  const [index, setIndex] = useState(start);
  const [zoomed, setZoomed] = useState(false);
  const swipe = useRef<{ x: number; y: number } | null>(null);
  const lastTap = useRef(0);
  const stage = useRef<HTMLDivElement>(null);
  /** Where the zoom was requested, as a fraction of the photo (0..1). */
  const focus = useRef({ x: 0.5, y: 0.5 });
  const photo = photos[index]!;

  // Keep the tapped spot under the finger after zooming in.
  useEffect(() => {
    const box = stage.current;
    if (!zoomed || !box) return;
    const img = box.querySelector("img");
    if (!img) return;
    box.scrollLeft = focus.current.x * img.clientWidth - box.clientWidth / 2;
    box.scrollTop = focus.current.y * img.clientHeight - box.clientHeight / 2;
  }, [zoomed]);

  const toggleZoomAt = (clientX: number, clientY: number) => {
    const img = stage.current?.querySelector("img");
    if (img && !zoomed) {
      const r = img.getBoundingClientRect();
      focus.current = {
        x: Math.min(1, Math.max(0, (clientX - r.left) / r.width)),
        y: Math.min(1, Math.max(0, (clientY - r.top) / r.height)),
      };
    }
    setZoomed((z) => !z);
  };

  const go = useCallback(
    (delta: number) => {
      setZoomed(false);
      setIndex((i) => (i + delta + photos.length) % photos.length);
    },
    [photos.length],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowRight") go(1);
      else if (e.key === "ArrowLeft") go(-1);
    };
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = overflow;
      window.removeEventListener("keydown", onKey);
    };
  }, [go, onClose]);

  // Preload neighbours so swiping feels instant.
  useEffect(() => {
    for (const delta of [1, -1]) {
      const next = photos[(index + delta + photos.length) % photos.length];
      if (next) new Image().src = `/media/${next.id}`;
    }
  }, [index, photos]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Просмотр фото"
      className="fixed inset-0 z-50 flex flex-col bg-viewer text-on-viewer"
    >
      <div className="flex h-14 shrink-0 items-center gap-1 px-2">
        <button
          type="button"
          onClick={onClose}
          aria-label="Закрыть"
          className="flex size-11 items-center justify-center rounded-full hover:bg-on-viewer/10"
        >
          <X size={24} />
        </button>
        <span className="flex-1 text-center font-mono text-[14px]">
          {index + 1} / {photos.length}
        </span>
        <button
          type="button"
          onClick={() => {
            focus.current = { x: 0.5, y: 0.5 };
            setZoomed((z) => !z);
          }}
          aria-label={zoomed ? "Уменьшить" : "Увеличить"}
          className="flex size-11 items-center justify-center rounded-full hover:bg-on-viewer/10"
        >
          {zoomed ? <ZoomOut size={22} /> : <ZoomIn size={22} />}
        </button>
        <a
          href={`/media/${photo.id}?download=1`}
          aria-label="Скачать"
          className="flex size-11 items-center justify-center rounded-full text-on-viewer hover:bg-on-viewer/10"
        >
          <Download size={22} />
        </a>
      </div>

      <div
        ref={stage}
        className={`relative flex-1 ${zoomed ? "overflow-auto" : "flex items-center justify-center overflow-hidden"}`}
        onPointerDown={(e) => {
          swipe.current = zoomed ? null : { x: e.clientX, y: e.clientY };
        }}
        onPointerUp={(e) => {
          const startPoint = swipe.current;
          swipe.current = null;
          if (!startPoint) return;
          const dx = e.clientX - startPoint.x;
          if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(e.clientY - startPoint.y)) {
            go(dx < 0 ? 1 : -1);
            return;
          }
          const now = Date.now();
          if (now - lastTap.current < 300) toggleZoomAt(e.clientX, e.clientY);
          lastTap.current = now;
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- private, session-checked URLs */}
        <img
          key={photo.id}
          src={`/media/${photo.id}`}
          alt={photo.caption ?? ""}
          draggable={false}
          className={
            zoomed
              ? "max-w-none select-none"
              : "max-h-full max-w-full touch-pan-y object-contain select-none"
          }
          style={zoomed ? { width: "250%" } : undefined}
        />
        {photos.length > 1 && !zoomed ? (
          <>
            <button
              type="button"
              onClick={() => go(-1)}
              aria-label="Предыдущее фото"
              className="absolute top-1/2 left-2 hidden size-12 -translate-y-1/2 items-center justify-center rounded-full bg-viewer/60 md:flex"
            >
              <ChevronLeft size={26} />
            </button>
            <button
              type="button"
              onClick={() => go(1)}
              aria-label="Следующее фото"
              className="absolute top-1/2 right-2 hidden size-12 -translate-y-1/2 items-center justify-center rounded-full bg-viewer/60 md:flex"
            >
              <ChevronRight size={26} />
            </button>
          </>
        ) : null}
      </div>
    </div>
  );
}
