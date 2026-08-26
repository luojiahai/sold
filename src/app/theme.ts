import "server-only";
import { cookies } from "next/headers";

export const THEME_COOKIE = "sold-theme";

/**
 * `system` is the absence of a choice, not a third palette.
 *
 * Stored as a cookie rather than localStorage so the choice is known during
 * server render and the stamped `<html>` matches the final paint — a client
 * script that corrects the theme after hydration flashes the wrong one first.
 */
export type Theme = "system" | "light" | "dark";

const THEMES: Theme[] = ["system", "light", "dark"];

export function isTheme(value: unknown): value is Theme {
  return typeof value === "string" && THEMES.includes(value as Theme);
}

export async function readTheme(): Promise<Theme> {
  const value = (await cookies()).get(THEME_COOKIE)?.value;
  return isTheme(value) ? value : "system";
}
