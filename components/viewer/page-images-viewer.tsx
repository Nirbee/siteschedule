"use client";

import { useEffect, useRef, useState } from "react";
import { PAGE_WIDTHS } from "@/lib/storage/page-render-widths";
import { ZoomBar, pageAtScroll, useJumpToPage } from "./zoom-bar";

/**
 * Viewer for scanned books: pages are rendered on the server (MuPDF) and shown as images.
 * The browser loads only pages near the screen (native lazy loading); the image width follows
 * zoom and screen density, picked from a few fixed sizes so the server cache is reused.
 */
export function PageImagesViewer({
  mediaId,
  fromViewCopy,
  pageCount,
  initialPage,
}: {
  mediaId: string;
  /** Office/DjVu files: render the PDF copy, not the original. */
  fromViewCopy: boolean;
  pageCount: number;
  initialPage?: number;
}) {
  const scroller = useRef<HTMLDivElement>(null);
  const pages = useRef<(HTMLDivElement | null)[]>([]);
  const [baseWidth, setBaseWidth] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [ratio, setRatio] = useState(1.414);
  const [current, setCurrent] = useState(1);
  const width = Math.round(baseWidth * zoom);
  const realign = useJumpToPage(scroller, pages, initialPage, width > 0, `${width}:${ratio}`);

  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const observer = new ResizeObserver(() => setBaseWidth(Math.min(el.clientWidth - 24, 1100)));
    observer.observe(el);
    const onScroll = () => setCurrent(pageAtScroll(el, pages.current));
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      observer.disconnect();
      el.removeEventListener("scroll", onScroll);
    };
  }, []);

  const pixelRatio = typeof window === "undefined" ? 1 : Math.min(window.devicePixelRatio || 1, 2);
  const imageWidth =
    PAGE_WIDTHS.find((w) => w >= width * pixelRatio) ?? PAGE_WIDTHS[PAGE_WIDTHS.length - 1];
  const pageUrl = (page: number) =>
    `/media/${mediaId}/page/${page}?w=${imageWidth}${fromViewCopy ? "&src=view" : ""}`;

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <div ref={scroller} className="min-h-0 flex-1 overflow-auto bg-viewer py-3">
        {width > 0 ? (
          <div className="mx-auto flex w-max min-w-full flex-col items-center gap-3 px-3">
            {Array.from({ length: pageCount }, (_, i) => (
              <div
                key={i}
                ref={(node) => {
                  pages.current[i] = node;
                }}
                className="bg-paper shadow-md"
                style={{ width, height: Math.round(width * ratio) }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- private, session-checked page images */}
                <img
                  src={pageUrl(i + 1)}
                  alt={`Страница ${i + 1}`}
                  loading={i < 2 ? "eager" : "lazy"}
                  decoding="async"
                  className="block size-full"
                  onLoad={(e) => {
                    const img = e.currentTarget;
                    const pageRatio = img.naturalHeight / img.naturalWidth;
                    if (i === 0) setRatio(pageRatio);
                    img.parentElement!.style.height = `${Math.round(width * pageRatio)}px`;
                    realign();
                  }}
                />
              </div>
            ))}
          </div>
        ) : null}
      </div>
      <ZoomBar current={current} total={pageCount} onZoom={setZoom} />
    </div>
  );
}
