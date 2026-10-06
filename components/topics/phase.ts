import type { ListPhase } from "@/lib/topics/rules";
import { formatDateTime } from "@/lib/time";

/** One line about where a list stands. */
export function phaseText(list: {
  phase: ListPhase;
  opensAt: Date | null;
  pickDeadline: Date | null;
}): string {
  switch (list.phase) {
    case "draft":
      return "Черновик — студенты пока не видят";
    case "scheduled":
      return `Запись откроется ${formatDateTime(list.opensAt!)}`;
    case "class":
      return list.opensAt
        ? `Выбирают те, кто на паре · для всех — ${formatDateTime(list.opensAt)}`
        : "Выбирают те, кто на паре";
    case "open":
      return list.pickDeadline
        ? `Выбор открыт до ${formatDateTime(list.pickDeadline)}`
        : "Выбор открыт";
    case "closed":
      return "Выбор закрыт";
  }
}

export const STATUS_LABELS = {
  done: "Сдано",
  mine: "Твоя",
  full: "Занята",
  partial: "Есть места",
  free: "Свободна",
} as const;

export const STATUS_STYLES = {
  done: "bg-chip text-muted",
  mine: "bg-add-bg text-add",
  full: "bg-chip text-ink-2",
  partial: "bg-change-bg text-change",
  free: "bg-add-bg text-add",
} as const;
