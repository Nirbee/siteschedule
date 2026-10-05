import { setTheme } from "@/lib/theme/actions";
import type { Theme } from "@/lib/theme/theme";

const OPTIONS: { value: Theme; label: string }[] = [
  { value: "system", label: "Как в системе" },
  { value: "light", label: "Светлая" },
  { value: "dark", label: "Тёмная" },
];

/** Plain form: works without client JS. */
export function ThemeSwitch({ current }: { current: Theme }) {
  return (
    <form action={setTheme}>
      <fieldset>
        <legend className="mb-2 text-[13px] font-bold text-ink-2">Тема оформления</legend>
        <div className="grid grid-cols-3 gap-1.5 rounded-[14px] bg-bg p-1">
          {OPTIONS.map((option) => {
            const active = option.value === current;
            return (
              <button
                key={option.value}
                type="submit"
                name="theme"
                value={option.value}
                aria-pressed={active}
                className={`h-11 rounded-[10px] text-sm ${
                  active
                    ? "bg-emph font-bold text-on-emph"
                    : "font-semibold text-ink-2 hover:bg-chip"
                }`}
              >
                {option.label}
              </button>
            );
          })}
        </div>
      </fieldset>
    </form>
  );
}
