"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** Shown while the PDF copy is being made; re-checks every few seconds. */
export function Preparing() {
  const router = useRouter();
  useEffect(() => {
    const timer = window.setInterval(() => router.refresh(), 4000);
    return () => window.clearInterval(timer);
  }, [router]);
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center text-on-viewer">
      <span
        aria-hidden
        className="inline-block size-7 animate-spin rounded-full border-2 border-on-viewer/30 border-t-on-viewer"
      />
      <p className="font-semibold">Готовим документ к просмотру</p>
      <p className="max-w-sm text-[14px] opacity-70">
        Обычно это занимает несколько секунд. Страница обновится сама.
      </p>
    </div>
  );
}
