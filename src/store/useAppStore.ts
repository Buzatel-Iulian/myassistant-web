import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import { isTheme, type Theme } from "@/lib/theme";

interface AppState {
  theme: Theme;
  setTheme: (theme: Theme) => void;
}

// UI preferences only. Server data (assistants, templates) belongs to the API and chat messages to the chat
// component, so neither is ever copied here: two owners of the same data drift apart.
// localStorage (not sessionStorage like the login token in Phase 7): a theme should survive closing the tab.
export const useAppStore = create<AppState>()(
  persist(
    set => ({
      theme: "system",
      setTheme: theme => set({ theme })
    }),
    {
      name: "myassistant-app",
      storage: createJSONStorage(() => localStorage),
      partialize: state => ({ theme: state.theme }),
      // A hand-edited or outdated value in localStorage must not leave the app without a valid theme.
      merge: (persisted, current) => {
        const theme = (persisted as Partial<AppState> | undefined)?.theme;
        return { ...current, theme: isTheme(theme) ? theme : current.theme };
      }
    }
  )
);
