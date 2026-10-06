"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { buttonClass } from "@/components/ui/button";
import { POLL_TOKEN_HEADER } from "@/lib/auth/constants";
import type { PollResponse } from "@/app/api/auth/poll/route";
import {
  devLoginAction,
  startQrLoginAction,
  startTelegramLoginAction,
  type StartLoginResult,
} from "./actions";

type DevUser = { id: string; displayName: string; role: string };

type State =
  | { mode: "telegram"; step: "starting" }
  | { mode: "telegram"; step: "ready" | "waiting"; botUrl: string; pollToken: string }
  | { mode: "qr"; step: "starting" }
  | { mode: "qr"; step: "waiting"; qrSvg: string; approveUrl: string; pollToken: string }
  | { mode: "telegram" | "qr"; step: "expired" }
  | { mode: "telegram" | "qr"; step: "error"; error: string };

const POLL_INTERVAL_MS = 2000;

export function LoginPanel({ devUsers }: { devUsers: DevUser[] }) {
  const [state, setState] = useState<State>({ mode: "telegram", step: "starting" });
  // Each tab polls its own login request; the cookie only helps a tab opened from the bot.
  const pollToken =
    (state.step === "waiting" || state.step === "ready") && "pollToken" in state
      ? state.pollToken
      : null;

  const startTelegram = useCallback(async () => {
    setState({ mode: "telegram", step: "starting" });
    setState(telegramState(await startTelegramLoginAction()));
  }, []);

  const startQr = useCallback(async () => {
    setState({ mode: "qr", step: "starting" });
    const result = await startQrLoginAction();
    setState(
      result.ok
        ? {
            mode: "qr",
            step: "waiting",
            qrSvg: result.qrSvg,
            approveUrl: result.approveUrl,
            pollToken: result.pollToken,
          }
        : { mode: "qr", step: "error", error: result.error },
    );
  }, []);

  // First finish a login that was already confirmed (e.g. this tab was opened by the bot's
  // «Вернуться на сайт» button); otherwise prepare the bot link right away for a one-tap login.
  useEffect(() => {
    let cancelled = false;
    void initialLogin().then((result) => {
      if (result === "logged-in") window.location.replace("/");
      else if (!cancelled) setState(telegramState(result));
    });
    return () => {
      cancelled = true;
    };
  }, []);

  usePoll(pollToken, () => setState((s) => ({ mode: s.mode, step: "expired" })));

  return (
    <div className="flex flex-col gap-5">
      {state.mode === "telegram" ? (
        <TelegramStep
          state={state}
          onRestart={startTelegram}
          onOpened={() => markWaiting(setState)}
        />
      ) : (
        <QrStep state={state} onRestart={startQr} />
      )}

      <div className="border-t border-line pt-5">
        {state.mode === "telegram" ? (
          <>
            <button type="button" onClick={startQr} className={buttonClass("secondary", "w-full")}>
              Войти по QR-коду
            </button>
            <p className="mt-2 text-[13px] text-muted">
              Если на телефоне вы уже вошли — отсканируйте им код, Telegram не понадобится.
            </p>
          </>
        ) : (
          <button
            type="button"
            onClick={startTelegram}
            className={buttonClass("secondary", "w-full")}
          >
            Войти через Telegram
          </button>
        )}
      </div>

      {devUsers.length > 0 ? <DevLogin users={devUsers} /> : null}
    </div>
  );
}

/**
 * Starts at most one login per mount, even though React mounts effects twice in development:
 * a second request would overwrite the poll cookie and break the «return from the bot» path.
 * Reused only for a moment, so a later visit to /login (e.g. after logout) starts fresh.
 */
let initialLoginCache: { at: number; promise: Promise<"logged-in" | StartLoginResult> } | null =
  null;
function initialLogin() {
  if (!initialLoginCache || Date.now() - initialLoginCache.at > 2000) {
    initialLoginCache = {
      at: Date.now(),
      promise: (async () =>
        (await pollOnce()) === "ok" ? ("logged-in" as const) : startTelegramLoginAction())(),
    };
  }
  return initialLoginCache.promise;
}

function telegramState(result: Awaited<ReturnType<typeof startTelegramLoginAction>>): State {
  return result.ok
    ? { mode: "telegram", step: "ready", botUrl: result.botUrl, pollToken: result.pollToken }
    : { mode: "telegram", step: "error", error: result.error };
}

function markWaiting(setState: React.Dispatch<React.SetStateAction<State>>) {
  setState((s) => (s.mode === "telegram" && s.step === "ready" ? { ...s, step: "waiting" } : s));
}

function TelegramStep({
  state,
  onRestart,
  onOpened,
}: {
  state: State;
  onRestart: () => void;
  onOpened: () => void;
}) {
  if (state.step === "expired" || state.step === "error") {
    return (
      <Problem
        text={state.step === "error" ? state.error : "Время на вход вышло. Попробуйте ещё раз."}
        onRestart={onRestart}
      />
    );
  }
  const botUrl = "botUrl" in state ? state.botUrl : undefined;

  return (
    <>
      <p className="text-ink-2">
        Вход — через Telegram-бота группы. Если Telegram у вас работает только с VPN, включите его
        на время входа, потом можно выключить.
      </p>
      {state.step === "waiting" ? (
        <div className="flex flex-col gap-3 rounded-[14px] bg-surface-muted p-4">
          <div className="flex items-center gap-3 font-semibold">
            <Spinner />
            Ждём подтверждения
          </div>
          <p className="text-[14px] text-ink-2">
            Нажмите «Запустить» (Start) в боте и вернитесь на эту страницу — вход завершится сам.
          </p>
          <a
            href={botUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[14px] font-semibold"
          >
            Открыть Telegram ещё раз
          </a>
        </div>
      ) : (
        <a
          href={botUrl}
          target="_blank"
          rel="noopener noreferrer"
          onClick={onOpened}
          aria-disabled={!botUrl}
          className={buttonClass(
            "primary",
            `w-full ${botUrl ? "" : "pointer-events-none opacity-50"}`,
          )}
        >
          Войти через Telegram
        </a>
      )}
    </>
  );
}

function QrStep({ state, onRestart }: { state: State; onRestart: () => void }) {
  if (state.step === "expired" || state.step === "error") {
    return (
      <Problem
        text={state.step === "error" ? state.error : "QR-код устарел. Создайте новый."}
        onRestart={onRestart}
      />
    );
  }
  if (state.step !== "waiting" || !("qrSvg" in state)) {
    return (
      <div className="flex items-center gap-3 text-ink-2">
        <Spinner /> Создаём код…
      </div>
    );
  }
  return (
    <>
      <p className="text-ink-2">
        Отсканируйте код камерой телефона, на котором вы уже вошли на сайт, и подтвердите вход.
      </p>
      <div
        className="mx-auto w-full max-w-[260px] rounded-[14px] bg-[#fff] p-3"
        // SVG is generated on our server from our own URL.
        dangerouslySetInnerHTML={{ __html: state.qrSvg }}
      />
      <div className="flex items-center justify-center gap-3 text-[14px] text-ink-2">
        <Spinner /> Ждём подтверждения с телефона
      </div>
    </>
  );
}

function Problem({ text, onRestart }: { text: string; onRestart: () => void }) {
  return (
    <div className="flex flex-col gap-3">
      <p className="rounded-[14px] bg-cancel-bg p-4 font-semibold text-cancel">{text}</p>
      <button type="button" onClick={onRestart} className={buttonClass("primary", "w-full")}>
        Начать заново
      </button>
    </div>
  );
}

function DevLogin({ users }: { users: DevUser[] }) {
  return (
    <details className="rounded-[14px] border border-dashed border-line-strong p-4">
      <summary className="cursor-pointer text-[13px] font-bold text-muted">
        Dev-вход (только в режиме разработки)
      </summary>
      <div className="mt-3 flex flex-col gap-2">
        {users.map((user) => (
          <form key={user.id} action={devLoginAction}>
            <input type="hidden" name="userId" value={user.id} />
            <button type="submit" className={buttonClass("ghost", "w-full justify-between px-3")}>
              <span>{user.displayName}</span>
              <span className="font-mono text-xs text-muted">{user.role}</span>
            </button>
          </form>
        ))}
      </div>
    </details>
  );
}

function Spinner() {
  return (
    <span
      aria-hidden
      className="inline-block size-5 animate-spin rounded-full border-2 border-line-strong border-t-accent"
    />
  );
}

async function pollOnce(pollToken?: string | null): Promise<PollResponse["status"] | "error"> {
  try {
    const response = await fetch("/api/auth/poll", {
      cache: "no-store",
      headers: pollToken ? { [POLL_TOKEN_HEADER]: pollToken } : {},
    });
    return ((await response.json()) as PollResponse).status;
  } catch {
    return "error"; // network hiccup (e.g. VPN switching) — try again on the next tick
  }
}

/**
 * Polls /api/auth/poll while active: every 2 s (also in background tabs — on desktop the tab is
 * often hidden behind Telegram while the user presses Start) and immediately on returning to the tab.
 */
function usePoll(pollToken: string | null, onExpired: () => void) {
  const onExpiredRef = useRef(onExpired);
  useEffect(() => {
    onExpiredRef.current = onExpired;
  });

  useEffect(() => {
    if (!pollToken) return;
    let stopped = false;
    let inFlight = false;

    async function check() {
      if (stopped || inFlight) return;
      inFlight = true;
      const status = await pollOnce(pollToken);
      inFlight = false;
      if (stopped) return;
      if (status === "ok") {
        stopped = true;
        window.location.replace("/");
      } else if (status === "expired") {
        stopped = true;
        onExpiredRef.current();
      }
    }

    const timer = window.setInterval(check, POLL_INTERVAL_MS);
    document.addEventListener("visibilitychange", check);
    window.addEventListener("focus", check);
    return () => {
      stopped = true;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", check);
      window.removeEventListener("focus", check);
    };
  }, [pollToken]);
}
