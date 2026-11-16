import { useSyncExternalStore } from "react";

import { resolveTheme, type ResolvedTheme } from "@/lib/theme";
import { useAppStore } from "@/store/useAppStore";

const DARK_QUERY = "(prefers-color-scheme: dark)";

function subscribe(callback: () => void) {
  const media = window.matchMedia(DARK_QUERY);
  media.addEventListener("change", callback);
  return () => media.removeEventListener("change", callback);
}

function getSystemPrefersDark() {
  return window.matchMedia(DARK_QUERY).matches;
}

// The OS preference is state outside React that can change while the page is open ("system" follows it live);
// useSyncExternalStore is the subscription React recommends for that, without a state copy in an effect.
export function useResolvedTheme(): ResolvedTheme {
  const theme = useAppStore(state => state.theme);
  const systemPrefersDark = useSyncExternalStore(subscribe, getSystemPrefersDark);
  return resolveTheme(theme, systemPrefersDark);
}
