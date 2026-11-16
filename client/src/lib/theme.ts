import { useEffect, useState } from "react";

/**
 * Light/dark theme. Until someone picks, the app follows the computer's own
 * setting (and keeps following it if that changes); once they click the toggle,
 * their choice is remembered in this browser.
 *
 * index.html applies the same logic in an inline script before the page draws,
 * so dark mode doesn't flash white on load. Keep the two in step.
 */
export type ThemeChoice = "light" | "dark";

const KEY = "theme";
const media = () => window.matchMedia("(prefers-color-scheme: dark)");

function stored(): ThemeChoice | null {
  try {
    const v = localStorage.getItem(KEY);
    return v === "light" || v === "dark" ? v : null;
  } catch {
    return null; // storage blocked — just follow the system
  }
}

function resolve(): ThemeChoice {
  return stored() ?? (media().matches ? "dark" : "light");
}

function apply(theme: ThemeChoice) {
  document.documentElement.classList.toggle("dark", theme === "dark");
}

export function useTheme() {
  const [theme, setTheme] = useState<ThemeChoice>(resolve);

  // While no explicit choice is saved, track the system setting live.
  useEffect(() => {
    const m = media();
    const onChange = () => {
      if (!stored()) {
        const next = m.matches ? "dark" : "light";
        apply(next);
        setTheme(next);
      }
    };
    m.addEventListener("change", onChange);
    return () => m.removeEventListener("change", onChange);
  }, []);

  function toggle() {
    const next: ThemeChoice = theme === "dark" ? "light" : "dark";
    try {
      localStorage.setItem(KEY, next);
    } catch {
      /* not persisted, but still switches for this visit */
    }
    apply(next);
    setTheme(next);
  }

  return { theme, toggle };
}
