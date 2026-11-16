import { useSyncExternalStore } from "react";

import { useAuthStore } from "@/store/useAuthStore";

const subscribe = (onChange: () => void) => useAuthStore.persist.onFinishHydration(onChange);
const getSnapshot = () => useAuthStore.persist.hasHydrated();

// SkillForge's `useHydrated`, adapted to a Vite SPA: there is no server render to match, so the question is not
// "has the client started?" but "has the persisted session been read?". Until it has, `token` is null and a
// logged-in user would be sent to /login on a reload. sessionStorage is read synchronously today, so the guard is
// normally true at once; it keeps the app correct if the storage ever becomes asynchronous.
export function useHydrated(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot);
}
