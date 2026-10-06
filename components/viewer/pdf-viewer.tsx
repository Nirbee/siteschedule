"use client";

import { useEffect, useRef, useState } from "react";
import { Minus, Plus } from "lucide-react";
import type { PDFDocumentLoadingTask, PDFDocumentProxy, RenderTask } from "pdfjs-dist";

const ASSETS = "/vendor/pdfjs";
const MIN_ZOOM = 0.5;
const MAX_ZOOM = 3;

/**
 * PDF viewer drawn with pdf.js, so it works the same on every phone (Android Chrome would
 * otherwise download PDFs). Pages are rendered only near the screen; far ones free their memory.
 * The file is fetched with Range requests: a 400-page book opens without downloading all of it.
 */
export function PdfViewer({ url }: { url: string }) {
  const scroller = useRef<HTMLDivElement>(null);
  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [width, setWidth] = useState(0);
  const [ratio, setRatio] = useState(1.414);
  const [zoom, setZoom] = useState(1);
  const [current, setCurrent] = useState(1);

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
    const observer = new ResizeObserver(() => setWidth(Math.min(el.clientWidth - 24, 1100)));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const pageWidth = Math.round(width * zoom);

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <div ref={scroller} className="min-h-0 flex-1 overflow-auto bg-viewer py-3">
        {error ? (
          <p className="p-6 text-center text-on-viewer">{error}</p>
        ) : !doc ? (
          <p className="p-6 text-center text-on-viewer opacity-70">Открываем документ…</p>
        ) : (
          <div className="mx-auto flex w-max min-w-full flex-col items-center gap-3 px-3">
            {Array.from({ length: doc.numPages }, (_, i) => (
              <PdfPage
                key={i + 1}
                doc={doc}
                number={i + 1}
                width={pageWidth}
                defaultRatio={ratio}
                onVisible={setCurrent}
              />
            ))}
          </div>
        )}
      </div>

      {doc ? (
        <div className="pointer-events-none absolute inset-x-0 bottom-[max(12px,env(safe-area-inset-bottom))] flex justify-center">
          <div className="pointer-events-auto flex items-center gap-1 rounded-full bg-viewer/85 px-2 py-1 text-on-viewer shadow-lg">
            <button
              type="button"
              aria-label="Уменьшить"
              onClick={() => setZoom((z) => Math.max(MIN_ZOOM, +(z - 0.25).toFixed(2)))}
              className="flex size-10 items-center justify-center rounded-full hover:bg-on-viewer/10"
            >
              <Minus size={20} />
            </button>
            <span className="min-w-[88px] text-center font-mono text-[13px]">
              {current} / {doc.numPages}
            </span>
            <button
              type="button"
              aria-label="Увеличить"
              onClick={() => setZoom((z) => Math.min(MAX_ZOOM, +(z + 0.25).toFixed(2)))}
              className="flex size-10 items-center justify-center rounded-full hover:bg-on-viewer/10"
            >
              <Plus size={20} />
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function PdfPage({
  doc,
  number,
  width,
  defaultRatio,
  onVisible,
}: {
  doc: PDFDocumentProxy;
  number: number;
  width: number;
  defaultRatio: number;
  onVisible: (page: number) => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [near, setNear] = useState(number <= 2);
  const [ratio, setRatio] = useState(defaultRatio);

  // Render pages within ~2 screens; track which page is mostly on screen for the counter.
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const nearObserver = new IntersectionObserver(([e]) => setNear(e!.isIntersecting), {
      rootMargin: "200% 0px",
    });
    const visibleObserver = new IntersectionObserver(
      ([e]) => e!.isIntersecting && onVisible(number),
      { threshold: 0.5 },
    );
    nearObserver.observe(el);
    visibleObserver.observe(el);
    return () => {
      nearObserver.disconnect();
      visibleObserver.disconnect();
    };
  }, [number, onVisible]);

  useEffect(() => {
    const el = canvas.current;
    if (!el || width <= 0) return;
    if (!near) {
      el.width = 0; // free the bitmap
      el.height = 0;
      return;
    }
    let task: RenderTask | null = null;
    let cancelled = false;
    void (async () => {
      const page = await doc.getPage(number);
      if (cancelled) return;
      const base = page.getViewport({ scale: 1 });
      setRatio(base.height / base.width);
      const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
      const viewport = page.getViewport({ scale: (width / base.width) * pixelRatio });
      el.width = Math.floor(viewport.width);
      el.height = Math.floor(viewport.height);
      task = page.render({ canvas: el, viewport });
      await task.promise.catch(() => {}); // cancelled renders reject; that's fine
    })();
    return () => {
      cancelled = true;
      task?.cancel();
    };
  }, [doc, number, width, near]);

  return (
    <div
      ref={box}
      className="relative bg-paper shadow-md"
      style={{ width, height: Math.round(width * ratio) }}
    >
      <canvas ref={canvas} className="block size-full" aria-label={`Страница ${number}`} />
    </div>
  );
}
