import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import type { TokenResponse, User } from "@/lib/types";

interface AuthState {
  token: string | null;
  expiresAt: string | null;
  user: User | null;
  login: (session: TokenResponse) => void;
  setUser: (user: User) => void;
  logout: () => void;
}

type PersistedAuth = Pick<AuthState, "token" | "expiresAt" | "user">;

const LOGGED_OUT: PersistedAuth = { token: null, expiresAt: null, user: null };

// setTimeout takes a signed 32-bit delay; a longer one fires at once.
const MAX_TIMER_DELAY_MS = 2_147_483_647;

export function isExpired(expiresAt: string | null, now: number = Date.now()): boolean {
  if (!expiresAt) return true;
  const expiry = Date.parse(expiresAt);
  return Number.isNaN(expiry) || expiry <= now;
}

function isPersistedSession(value: unknown): value is { token: string; expiresAt: string; user?: User | null } {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return typeof candidate.token === "string" && typeof candidate.expiresAt === "string";
}

let expiryTimer: ReturnType<typeof setTimeout> | undefined;

// The API refuses an expired token anyway (401 → logout in the client), but only on the next request: a tab left
// open past `expiresAt` would keep showing a logged-in app until then. The timer logs out at the expiry itself.
function scheduleExpiry(expiresAt: string | null, logout: () => void) {
  clearTimeout(expiryTimer);
  expiryTimer = undefined;
  if (!expiresAt) return;
  const delay = Date.parse(expiresAt) - Date.now();
  expiryTimer = setTimeout(
    () => (isExpired(expiresAt) ? logout() : scheduleExpiry(expiresAt, logout)),
    Math.min(Math.max(delay, 0), MAX_TIMER_DELAY_MS)
  );
}

// sessionStorage, not localStorage: the login ends with the tab, so a shared or forgotten computer does not keep
// the user logged in. `user` (the /api/users/me answer) is kept with the token so a reload shows the name at once;
// it is the session's identity, not a cache of the user's data, and it is dropped together with the token.
export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      ...LOGGED_OUT,
      login: ({ token, expiresAt }) => {
        set({ token, expiresAt, user: null });
        scheduleExpiry(expiresAt, get().logout);
      },
      setUser: user => set({ user }),
      logout: () => {
        scheduleExpiry(null, get().logout);
        set(LOGGED_OUT);
      }
    }),
    {
      name: "myassistant-auth",
      storage: createJSONStorage(() => sessionStorage),
      partialize: ({ token, expiresAt, user }) => ({ token, expiresAt, user }),
      // An expired or hand-edited session is a logged-out one: the app must never start "logged in" with a token
      // the API will refuse.
      merge: (persisted, current) => {
        if (!isPersistedSession(persisted) || isExpired(persisted.expiresAt)) return { ...current, ...LOGGED_OUT };
        const { token, expiresAt, user = null } = persisted;
        return { ...current, token, expiresAt, user };
      },
      onRehydrateStorage: () => state => {
        if (state) scheduleExpiry(state.expiresAt, state.logout);
      }
    }
  )
);
