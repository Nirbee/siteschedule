"use client";

import { useActionState, useState } from "react";
import { buttonClass } from "@/components/ui/button";
import { createLoginLinkAction, type LoginLinkState } from "./actions";

export function LoginLinkButton({ userId }: { userId: string }) {
  const [state, action, pending] = useActionState<LoginLinkState, FormData>(
    createLoginLinkAction,
    {},
  );
  const [copied, setCopied] = useState(false);

  if (state.url) {
    const url = state.url;
    return (
      <div className="flex flex-col gap-2 rounded-[12px] bg-surface-muted p-3">
        <p className="text-[13px] text-muted">
          Одноразовая ссылка, действует 7 дней. Отправьте её лично этому человеку.
        </p>
        <code className="font-mono text-[12px] break-all">{url}</code>
        <button
          type="button"
          className={buttonClass("secondary")}
          onClick={async () => {
            await navigator.clipboard.writeText(url);
            setCopied(true);
          }}
        >
          {copied ? "Скопировано" : "Скопировать"}
        </button>
      </div>
    );
  }

  return (
    <form action={action}>
      <input type="hidden" name="userId" value={userId} />
      <button type="submit" disabled={pending} className={buttonClass("secondary", "w-full")}>
        {pending ? "Создаём…" : "Ссылка для входа"}
      </button>
    </form>
  );
}
