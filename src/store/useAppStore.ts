import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import { isTheme, type Theme } from "@/lib/theme";
import { useAuthStore } from "@/store/useAuthStore";

interface AppState {
  theme: Theme;
  /** The assistant the chat opened last, so the app reopens on it. An id only: the assistant itself is the API's. */
  activeConfigurationId: string | null;
  setTheme: (theme: Theme) => void;
  setActiveConfigurationId: (id: string | null) => void;
}

type PersistedApp = Pick<AppState, "theme" | "activeConfigurationId">;

// UI preferences and the active assistant's id. Server data (assistants, templates) belongs to the API and chat
// messages to the in-memory conversation store (`useConversationStore`, never persisted), so neither is ever copied
// here: two owners of the same data drift apart, and this store is saved to localStorage.
// localStorage (not sessionStorage like the login token in Phase 7): a theme, and the assistant last used, should
// survive closing the tab.
export const useAppStore = create<AppState>()(
  persist(
    set => ({
      theme: "system",
      activeConfigurationId: null,
      setTheme: theme => set({ theme }),
      setActiveConfigurationId: activeConfigurationId => set({ activeConfigurationId })
    }),
    {
      name: "myassistant-app",
      storage: createJSONStorage(() => localStorage),
      partialize: ({ theme, activeConfigurationId }): PersistedApp => ({ theme, activeConfigurationId }),
      // A hand-edited or outdated value in localStorage must not leave the app without a valid theme or with a
      // non-string id.
      merge: (persisted, current) => {
        const saved = persisted as Partial<PersistedApp> | undefined;
        const id = saved?.activeConfigurationId;
        return {
          ...current,
          theme: isTheme(saved?.theme) ? saved.theme : current.theme,
          activeConfigurationId: typeof id === "string" && id ? id : null
        };
      }
    }
  )
);

// Logging out (the button, a 401 or the session's expiry) forgets the active assistant: the next person to log in
// on this browser must not be sent to it. A tab that starts logged out (a new tab) is not a logout, so the id
// survives closing the tab; it is checked against the user's own assistants before it is opened.
useAuthStore.subscribe((state, previous) => {
  if (previous.token && !state.token) useAppStore.getState().setActiveConfigurationId(null);
});
