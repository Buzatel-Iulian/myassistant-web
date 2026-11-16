import { useLayoutEffect, type ReactNode } from "react";

import { useResolvedTheme } from "@/hooks/useResolvedTheme";

// The `dark:` variants in index.css match `.dark *`, so the class has to sit on <html>.
// A layout effect (not a plain effect) applies it before the first paint, so a dark user never sees a light flash.
export function ThemeProvider({ children }: { children: ReactNode }) {
  const resolvedTheme = useResolvedTheme();

  useLayoutEffect(() => {
    document.documentElement.classList.toggle("dark", resolvedTheme === "dark");
    document.documentElement.style.colorScheme = resolvedTheme;
  }, [resolvedTheme]);

  return children;
}
