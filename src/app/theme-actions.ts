"use server";

import { cookies } from "next/headers";
import { isTheme, THEME_COOKIE } from "./theme";

const ONE_YEAR = 60 * 60 * 24 * 365;

/**
 * Persists the theme choice.
 *
 * Setting a cookie in a server function re-renders the current route, so the
 * `<html data-theme>` stamp comes back correct in the same round trip; the
 * client stamps it immediately as well, so the switch is not gated on the
 * network.
 */
export async function setTheme(value: string): Promise<void> {
  if (!isTheme(value)) return;

  const store = await cookies();
  if (value === "system") {
    store.delete(THEME_COOKIE);
    return;
  }

  store.set(THEME_COOKIE, value, {
    path: "/",
    maxAge: ONE_YEAR,
    sameSite: "lax",
  });
}
