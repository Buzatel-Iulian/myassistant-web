// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";

import { useAppStore } from "@/store/useAppStore";

const STORAGE_KEY = "myassistant-app";

describe("useAppStore", () => {
  beforeEach(() => {
    localStorage.clear();
    useAppStore.setState({ theme: "system" });
  });

  it("starts on the system theme", () => {
    expect(useAppStore.getState().theme).toBe("system");
  });

  it("persists the chosen theme in localStorage", () => {
    useAppStore.getState().setTheme("dark");

    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}");
    expect(stored.state).toEqual({ theme: "dark" });
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
});
