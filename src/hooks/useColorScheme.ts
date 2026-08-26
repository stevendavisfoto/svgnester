import { useState, useCallback, useEffect } from "react";

export type ColorScheme = "dark" | "light";

const STORAGE_KEY = "color-scheme";

function getInitialScheme(): ColorScheme {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === "dark" || stored === "light") return stored;
  } catch {
    // localStorage may be unavailable in some contexts
  }
  return "dark";
}

export function useColorScheme() {
  const [scheme, setScheme] = useState<ColorScheme>(getInitialScheme);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", scheme);
    try {
      localStorage.setItem(STORAGE_KEY, scheme);
    } catch {
      // ignore
    }
  }, [scheme]);

  const toggle = useCallback(
    () => setScheme((s) => (s === "dark" ? "light" : "dark")),
    [],
  );

  return { scheme, toggle };
}
