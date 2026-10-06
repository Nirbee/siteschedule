"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { Route } from "next";
import QRCode from "qrcode";
import { ArrowLeft } from "lucide-react";
import { classCodeAction } from "@/app/(staff)/manage/topics/actions";

type State = Awaited<ReturnType<typeof classCodeAction>>;

/**
 * Shown on the starosta's phone or the classroom screen: a 4-digit code and a QR code that
 * change every 30 s, and how many people have joined and taken topics.
 */
export function CodeScreen({ listId, title }: { listId: string; title: string }) {
  const [state, setState] = useState<State | null>(null);
  const [qr, setQr] = useState("");

  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    const tick = async () => {
      try {
        const next = await classCodeAction(listId);
        if (stopped) return;
        setState(next);
        if (next.ok) {
          const url = `${window.location.origin}/topics/${listId}?code=${next.code}`;
          setQr(await QRCode.toString(url, { type: "svg", margin: 1, errorCorrectionLevel: "M" }));
        }
        // Refresh right after the code changes, and every few seconds for the counters.
        timer = setTimeout(tick, next.ok ? Math.min(next.msLeft + 200, 4000) : 4000);
      } catch {
        if (!stopped) timer = setTimeout(tick, 4000);
      }
    };
    void tick();
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [listId]);

  return (
    <div className="flex min-h-dvh flex-col bg-viewer p-4 text-on-viewer">
      <Link
        href={`/manage/topics/${listId}` as Route}
        className="inline-flex items-center gap-1.5 self-start text-[14px] font-semibold text-on-viewer"
      >
        <ArrowLeft size={16} aria-hidden /> Управление
      </Link>
      <div className="flex flex-1 flex-col items-center justify-center gap-5 text-center">
        <p className="text-[17px] opacity-80">{title}</p>
        {state === null ? (
          <p className="opacity-70">Загружаем код…</p>
        ) : !state.ok ? (
          <p>{state.error}</p>
        ) : state.open ? (
          <p className="max-w-sm text-[20px] font-bold">
            Список уже открыт для всех — код больше не нужен.
          </p>
        ) : (
          <>
            <p className="text-[15px] opacity-80">Код для тех, кто на паре</p>
            <p className="font-mono text-[88px] leading-none font-bold tracking-[0.15em]">
              {state.code}
            </p>
            {qr ? (
              <div
                className="size-[min(70vw,280px)] rounded-[16px] bg-paper p-3"
                // Generated locally from our own URL.
                dangerouslySetInnerHTML={{ __html: qr }}
              />
            ) : null}
            <p className="text-[14px] opacity-70">
              Код меняется каждые 30 секунд · осталось {Math.ceil(state.msLeft / 1000)} с
            </p>
            <p className="text-[17px] font-semibold">
              Ввели код: {state.present} · тем выбрано: {state.taken}
            </p>
          </>
        )}
      </div>
    </div>
  );
}
