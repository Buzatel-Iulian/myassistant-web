// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";

import { useAppStore } from "@/store/useAppStore";
import { useAuthStore } from "@/store/useAuthStore";

const STORAGE_KEY = "myassistant-app";

describe("useAppStore", () => {
  beforeEach(() => {
    localStorage.clear();
    useAppStore.setState({ theme: "system", activeConfigurationId: null });
  });

  it("starts on the system theme", () => {
    expect(useAppStore.getState().theme).toBe("system");
  });

  it("persists the chosen theme in localStorage", () => {
    useAppStore.getState().setTheme("dark");

    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}");
    expect(stored.state).toEqual({ theme: "dark", activeConfigurationId: null });
  });

  it("restores a saved theme", async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ state: { theme: "light" }, version: 0 }));

    await useAppStore.persist.rehydrate();

    expect(useAppStore.getState().theme).toBe("light");
  });

  it("falls back to the current theme when the saved one is not valid", async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ state: { theme: "blue" }, version: 0 }));

    await useAppStore.persist.rehydrate();

    expect(useAppStore.getState().theme).toBe("system");
  });

  describe("activeConfigurationId", () => {
    it("persists the last opened assistant's id", () => {
      useAppStore.getState().setActiveConfigurationId("c-42");

      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}");
      expect(stored.state.activeConfigurationId).toBe("c-42");
    });

    it("restores it, and ignores a value that is not an id", async () => {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ state: { theme: "dark", activeConfigurationId: "c-7" } }));
      await useAppStore.persist.rehydrate();
      expect(useAppStore.getState().activeConfigurationId).toBe("c-7");

      localStorage.setItem(STORAGE_KEY, JSON.stringify({ state: { activeConfigurationId: 42 } }));
      await useAppStore.persist.rehydrate();
      expect(useAppStore.getState().activeConfigurationId).toBeNull();
    });

    it("is forgotten on logout", () => {
      useAuthStore.getState().login({ token: "t", expiresAt: new Date(Date.now() + 60_000).toISOString() });
      useAppStore.getState().setActiveConfigurationId("c-1");

      useAuthStore.getState().logout();

      expect(useAppStore.getState().activeConfigurationId).toBeNull();
    });

    it("is kept when the session changes without a logout (a login)", () => {
      useAppStore.getState().setActiveConfigurationId("c-1");

      useAuthStore.getState().login({ token: "t2", expiresAt: new Date(Date.now() + 60_000).toISOString() });

      expect(useAppStore.getState().activeConfigurationId).toBe("c-1");
      useAuthStore.getState().logout();
    });
  });
});
