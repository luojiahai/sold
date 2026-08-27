"use client";

import { useOptimistic, useTransition } from "react";
import { setTheme } from "./theme-actions";
import type { Theme } from "./theme";

const OPTIONS: { value: Theme; label: string; title: string }[] = [
  { value: "system", label: "Auto", title: "Match system" },
  { value: "light", label: "Light", title: "Light" },
  { value: "dark", label: "Dark", title: "Dark" },
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
    <div className="segmented full" role="radiogroup" aria-label="Colour theme">
      {OPTIONS.map((option) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={shown === option.value}
          title={option.title}
          onClick={() => choose(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
