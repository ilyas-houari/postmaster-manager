"use client";

import { useEffect, useSyncExternalStore } from "react";

type Theme = "dark" | "light";
const key = "postmaster-manager-theme";
const eventName = "postmaster-theme-change";
let themeSwitchTimer: number | undefined;

function getTheme(): Theme {
  try {
    return window.localStorage.getItem(key) === "light" ? "light" : "dark";
  } catch {
    return "dark";
  }
}

function subscribe(callback: () => void) {
  window.addEventListener(eventName, callback);
  window.addEventListener("storage", callback);
  return () => {
    window.removeEventListener(eventName, callback);
    window.removeEventListener("storage", callback);
  };
}

function serverTheme(): Theme {
  return "dark";
}

export default function ThemeToggle() {
  const theme = useSyncExternalStore(subscribe, getTheme, serverTheme);

  // Always read the persisted preference, never paint the server's dark snapshot.
  useEffect(() => {
    const saved = getTheme();
    document.documentElement.dataset.pmTheme = saved;
    document.documentElement.style.colorScheme = saved;
  }, [theme]);

  function toggle() {
    const next = theme === "dark" ? "light" : "dark";
    const root = document.documentElement;

    // Transition colors together only when the user switches theme.
    // This class is NOT set during initial page loading or hydration.
    root.classList.add("pm-theme-switching");
    if (themeSwitchTimer !== undefined) window.clearTimeout(themeSwitchTimer);

    try { window.localStorage.setItem(key, next); } catch { /* storage unavailable */ }
    root.dataset.pmTheme = next;
    root.style.colorScheme = next;
    window.dispatchEvent(new Event(eventName));

    themeSwitchTimer = window.setTimeout(() => {
      root.classList.remove("pm-theme-switching");
      themeSwitchTimer = undefined;
    }, 380);
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
      title={theme === "dark" ? "Light mode" : "Dark mode"}
      className="pm-theme-button inline-flex h-9 items-center gap-2 rounded-lg border px-3 text-xs font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-500"
    >
      {theme === "dark" ? (
        <svg className="h-4 w-4" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M4.93 4.93l1.42 1.42m11.3 11.3 1.42 1.42M2 12h2m16 0h2M4.93 19.07l1.42-1.42m11.3-11.3 1.42-1.42"/></svg>
      ) : (
        <svg className="h-4 w-4" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M20.98 13.03A9 9 0 0 1 10.97 3.02 9 9 0 1 0 20.98 13.03Z"/></svg>
      )}
      <span className="hidden sm:inline">{theme === "dark" ? "Light" : "Dark"}</span>
    </button>
  );
}
