"use client";

import { buttonClass } from "./button";

/** Submit button that asks before an irreversible action. */
export function ConfirmSubmit({
  message,
  children,
  className = buttonClass("danger", "w-full"),
}: {
  message: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <button
      type="submit"
      className={className}
      onClick={(e) => {
        if (!confirm(message)) e.preventDefault();
      }}
    >
      {children}
    </button>
  );
}
