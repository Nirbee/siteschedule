"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { PDFDocumentLoadingTask, PDFDocumentProxy } from "pdfjs-dist";
import { ZoomBar, useJumpToPage } from "./zoom-bar";

const ASSETS = "/vendor/pdfjs";
/** Pages kept rendered around the screen, in screens above/below. */
const KEEP_SCREENS = 2;

/**
 * PDF viewer drawn with pdf.js, so it works the same on every phone (Android Chrome would
 * otherwise download PDFs). Large scanned books stay fast:
 * - pages are rendered one at a time, nearest to the screen first;
 * - each page is drawn off-screen and shown only when complete (no half-drawn black pages);
 * - pages far from the screen release their bitmaps;
 * - the file is read with Range requests, so a 400-page book is not downloaded up front.
 */
export function PdfViewer({ url, initialPage }: { url: string; initialPage?: number }) {
  const scroller = useRef<HTMLDivElement>(null);
  const pages = useRef<(HTMLDivElement | null)[]>([]);
  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [baseWidth, setBaseWidth] = useState(0);
  const [ratio, setRatio] = useState(1.414);
  const [zoom, setZoom] = useState(1);
  const [current, setCurrent] = useState(1);
  const width = Math.round(baseWidth * zoom);
  // Declared before the renderer's effects, so it scrolls before the first render round.
  const realign = useJumpToPage(
    scroller,
    pages,
    initialPage,
    !!doc && width > 0,
    `${width}:${ratio}`,
  );

  useEffect(() => {
    let cancelled = false;
    let task: PDFDocumentLoadingTask | null = null;
    void (async () => {
      try {
        const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
        pdfjs.GlobalWorkerOptions.workerSrc = `${ASSETS}/pdf.worker.min.mjs`;
        task = pdfjs.getDocument({
          url,
          cMapUrl: `${ASSETS}/cmaps/`,
          cMapPacked: true,
          standardFontDataUrl: `${ASSETS}/standard_fonts/`,
          wasmUrl: `${ASSETS}/wasm/`,
          iccUrl: `${ASSETS}/iccs/`,
          disableAutoFetch: true,
        });
        const loaded = await task.promise;
        const first = (await loaded.getPage(1)).getViewport({ scale: 1 });
        if (cancelled) return;
        setRatio(first.height / first.width);
        setDoc(loaded);
      } catch {
        if (!cancelled) setError("Не удалось открыть документ");
      }
    })();
    return () => {
      cancelled = true;
      void task?.destroy();
    };
  }, [url]);

  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const observer = new ResizeObserver(() => setBaseWidth(Math.min(el.clientWidth - 24, 1100)));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Renderer state lives in refs: it changes on every scroll and must not re-render React.
  const rendered = useRef(new Map<number, number>()); // page → width it was rendered at
  const busy = useRef(false);
  const generation = useRef(0);
  const latestUpdate = useRef<() => void>(() => {});

  const update = useCallback(async () => {
    const el = scroller.current;
    if (!doc || !el || width <= 0 || busy.current) return;
    busy.current = true;
    const gen = generation.current;
    try {
      // Each round re-reads the scroll position: render the nearest missing page, repeat.
      for (;;) {
        if (gen !== generation.current) return;
        const top = el.scrollTop;
        const screen = el.clientHeight;

        // Pages near the screen, and the "current" page (the one crossing the upper third).
        const near: number[] = [];
        let currentPage = 1;
        pages.current.forEach((box, i) => {
          if (!box) return;
          const y = box.offsetTop;
          if (
            y + box.offsetHeight >= top - KEEP_SCREENS * screen &&
            y <= top + (KEEP_SCREENS + 1) * screen
          ) {
            near.push(i + 1);
          }
          if (y <= top + screen / 3) currentPage = i + 1;
        });
        setCurrent(currentPage);

        // Free far pages.
        for (const [page] of rendered.current) {
          if (!near.includes(page)) {
            pages.current[page - 1]?.replaceChildren();
            rendered.current.delete(page);
          }
        }

        const next = near
          .filter((p) => rendered.current.get(p) !== width)
          .sort((a, b) => Math.abs(a - currentPage) - Math.abs(b - currentPage))[0];
        if (next === undefined) return;

        try {
          const page = await doc.getPage(next);
          const base = page.getViewport({ scale: 1 });
          const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
          const viewport = page.getViewport({ scale: (width / base.width) * pixelRatio });
          const canvas = document.createElement("canvas");
          canvas.width = Math.floor(viewport.width);
          canvas.height = Math.floor(viewport.height);
          canvas.className = "block size-full";
          canvas.setAttribute("aria-label", `Страница ${next}`);
          await page.render({ canvas, viewport }).promise;
          const box = pages.current[next - 1];
          if (box && gen === generation.current) {
            box.style.height = `${Math.round((width * base.height) / base.width)}px`;
            box.replaceChildren(canvas);
            realign();
          }
        } catch {
          // broken page: leave it blank, don't retry forever
        }
        rendered.current.set(next, width);
      }
    } finally {
      busy.current = false;
      // Zoom/resize happened mid-render: continue with the new size.
      if (gen !== generation.current) queueMicrotask(() => latestUpdate.current());
    }
  }, [doc, width, realign]);

  // Width/zoom changed: everything must be redrawn at the new size.
  useEffect(() => {
    latestUpdate.current = () => void update();
    generation.current += 1;
    rendered.current.clear();
    void update();
  }, [update]);

  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    let frame = 0;
    const onScroll = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => void update());
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      el.removeEventListener("scroll", onScroll);
    };
  }, [update]);

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <div ref={scroller} className="min-h-0 flex-1 overflow-auto bg-viewer py-3">
        {error ? (
          <p className="p-6 text-center text-on-viewer">{error}</p>
        ) : !doc || width <= 0 ? (
          <p className="p-6 text-center text-on-viewer opacity-70">Открываем документ…</p>
        ) : (
          <div className="mx-auto flex w-max min-w-full flex-col items-center gap-3 px-3">
            {Array.from({ length: doc.numPages }, (_, i) => (
              <div
                key={i}
                ref={(node) => {
                  pages.current[i] = node;
                }}
                className="bg-paper shadow-md"
                style={{ width, height: Math.round(width * ratio) }}
              />
            ))}
          </div>
        )}
      </div>

      {doc ? <ZoomBar current={current} total={doc.numPages} onZoom={setZoom} /> : null}
    </div>
  );
}
