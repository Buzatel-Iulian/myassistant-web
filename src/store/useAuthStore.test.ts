// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { isExpired, useAuthStore } from "@/store/useAuthStore";

const STORAGE_KEY = "myassistant-auth";
const HOUR = 60 * 60 * 1000;
const USER = { id: "u1", email: "ana@example.com", displayName: "Ana" };

function store(state: unknown) {
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ state, version: 0 }));
}

describe("useAuthStore", () => {
  beforeEach(() => {
    useAuthStore.getState().logout();
    sessionStorage.clear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("keeps the session in sessionStorage (it ends with the tab), not in localStorage", () => {
    const expiresAt = new Date(Date.now() + HOUR).toISOString();
    useAuthStore.getState().login({ token: "abc", expiresAt });
    useAuthStore.getState().setUser(USER);

    const stored = JSON.parse(sessionStorage.getItem(STORAGE_KEY) ?? "{}");
    expect(stored.state).toEqual({ token: "abc", expiresAt, user: USER });
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it("logout clears the token, its expiry and the user", () => {
    useAuthStore.getState().login({ token: "abc", expiresAt: new Date(Date.now() + HOUR).toISOString() });
    useAuthStore.getState().setUser(USER);

    useAuthStore.getState().logout();

    expect(useAuthStore.getState()).toMatchObject({ token: null, expiresAt: null, user: null, logoutReason: null });
  });

  it("restores a session that has not expired (a page reload)", async () => {
    const expiresAt = new Date(Date.now() + HOUR).toISOString();
    store({ token: "abc", expiresAt, user: USER });

    await useAuthStore.persist.rehydrate();

    expect(useAuthStore.getState()).toMatchObject({ token: "abc", expiresAt, user: USER });
  });

  it("treats an expired stored session as logged out", async () => {
    store({ token: "abc", expiresAt: new Date(Date.now() - 1000).toISOString(), user: USER });

    await useAuthStore.persist.rehydrate();

    expect(useAuthStore.getState()).toMatchObject({
      token: null,
      expiresAt: null,
      user: null,
      logoutReason: "expired"
    });
  });

  it("treats a stored session without a valid expiry as logged out", async () => {
    store({ token: "abc", expiresAt: "not a date" });
    await useAuthStore.persist.rehydrate();
    expect(useAuthStore.getState().token).toBeNull();

    store({ token: 42 });
    await useAuthStore.persist.rehydrate();
    expect(useAuthStore.getState().token).toBeNull();
  });

  it("logs out by itself when the token expires while the tab is open", () => {
    vi.useFakeTimers();
    useAuthStore.getState().login({ token: "abc", expiresAt: new Date(Date.now() + HOUR).toISOString() });

    vi.advanceTimersByTime(HOUR - 1);
    expect(useAuthStore.getState().token).toBe("abc");

    vi.advanceTimersByTime(1);
    expect(useAuthStore.getState().token).toBeNull();
    // The login page tells the user why they are there.
    expect(useAuthStore.getState().logoutReason).toBe("expired");
  });

  it("keeps the logout reason out of sessionStorage, and a new login clears it", () => {
    useAuthStore.getState().login({ token: "abc", expiresAt: new Date(Date.now() + HOUR).toISOString() });
    useAuthStore.getState().logout("expired");
    expect(sessionStorage.getItem(STORAGE_KEY)).not.toContain("logoutReason");

    useAuthStore.getState().login({ token: "new", expiresAt: new Date(Date.now() + HOUR).toISOString() });
    expect(useAuthStore.getState().logoutReason).toBeNull();
  });

  it("a logout cancels the expiry timer of the old session", () => {
    vi.useFakeTimers();
    useAuthStore.getState().login({ token: "old", expiresAt: new Date(Date.now() + 1000).toISOString() });
    useAuthStore.getState().logout();
    useAuthStore.getState().login({ token: "new", expiresAt: new Date(Date.now() + HOUR).toISOString() });

    vi.advanceTimersByTime(1000);

    expect(useAuthStore.getState().token).toBe("new");
  });
});

describe("isExpired", () => {
  const now = Date.parse("2026-11-16T12:00:00Z");

  it("is false before the expiry and true at or after it", () => {
    expect(isExpired("2026-11-16T12:00:01Z", now)).toBe(false);
    expect(isExpired("2026-11-16T12:00:00Z", now)).toBe(true);
    expect(isExpired("2026-11-16T11:59:59Z", now)).toBe(true);
  });

  it("is true without an expiry or with one that is not a date", () => {
    expect(isExpired(null, now)).toBe(true);
    expect(isExpired("tomorrow", now)).toBe(true);
  });
});
