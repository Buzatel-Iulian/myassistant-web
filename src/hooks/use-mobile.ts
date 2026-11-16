import * as React from "react";

const MOBILE_BREAKPOINT = 768;

function subscribe(callback: () => void) {
  const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`);
  mql.addEventListener("change", callback);
  return () => mql.removeEventListener("change", callback);
}

function getSnapshot() {
  return window.innerWidth < MOBILE_BREAKPOINT;
}

// Why not the generated useState + useEffect version: the viewport is external state, and setting state
// synchronously inside an effect causes a second render (react-hooks/set-state-in-effect). Ported from SkillForge.
export function useIsMobile() {
  return React.useSyncExternalStore(subscribe, getSnapshot);
}
