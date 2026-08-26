"use client";

import { useOptimistic, useTransition } from "react";
import { setTheme } from "./theme-actions";
import type { Theme } from "./theme";

const OPTIONS: { value: Theme; label: string; icon: React.ReactNode }[] = [
  {
    value: "system",
    label: "Match system",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
        <rect x="2" y="4" width="20" height="13" rx="2" />
        <path d="M8 21h8M12 17v4" />
      </svg>
    ),
  },
  {
    value: "light",
    label: "Light",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
      </svg>
    ),
  },
  {
    value: "dark",
    label: "Dark",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
        <path d="M20 14.5A8.5 8.5 0 1 1 9.5 4a6.8 6.8 0 0 0 10.5 10.5Z" />
      </svg>
    ),
  },
];

/**
 * Theme switch.
 *
 * The DOM stamp is applied before the server action runs. Persisting the
 * choice is a round trip; repainting should not be — waiting on the network to
 * change a colour scheme reads as a broken control.
 */
export function ThemeToggle({ current }: { current: Theme }) {
  const [, startTransition] = useTransition();
  const [shown, setShown] = useOptimistic(current);

  function choose(value: Theme) {
    const root = document.documentElement;
    if (value === "system") root.removeAttribute("data-theme");
    else root.setAttribute("data-theme", value);

    startTransition(async () => {
      setShown(value);
      await setTheme(value);
    });
  }

  return (
    <div className="segmented icons" role="radiogroup" aria-label="Colour theme">
      {OPTIONS.map((option) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={shown === option.value}
          aria-label={option.label}
          title={option.label}
          onClick={() => choose(option.value)}
        >
          {option.icon}
        </button>
      ))}
    </div>
  );
}
