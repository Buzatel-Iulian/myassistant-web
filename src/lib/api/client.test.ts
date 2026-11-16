// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError, apiFetch } from "@/lib/api/client";
import { useAuthStore } from "@/store/useAuthStore";

const FUTURE = new Date(Date.now() + 60 * 60 * 1000).toISOString();

function problem(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify({ status, ...body }), {
    status,
    headers: { "Content-Type": "application/problem+json" }
  });
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

async function caught(promise: Promise<unknown>): Promise<ApiError> {
  const error = await promise.catch((reason: unknown) => reason);
  expect(error).toBeInstanceOf(ApiError);
  return error as ApiError;
}

const fetchMock = vi.fn<typeof fetch>();

describe("apiFetch", () => {
  beforeEach(() => {
    sessionStorage.clear();
    useAuthStore.getState().logout();
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("prefixes /api, sends the token and returns the JSON body", async () => {
    useAuthStore.getState().login({ token: "abc", expiresAt: FUTURE });
    fetchMock.mockResolvedValue(json(200, { id: "1", email: "ana@example.com", displayName: "Ana" }));

    const user = await apiFetch<{ displayName: string }>("/users/me");

    expect(user.displayName).toBe("Ana");
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/users/me");
    expect(new Headers(init?.headers).get("Authorization")).toBe("Bearer abc");
  });

  it("sends the body as JSON", async () => {
    fetchMock.mockResolvedValue(json(200, { token: "t", expiresAt: FUTURE }));

    await apiFetch("/auth/login", { method: "POST", body: { email: "a@b.c", password: "secret-pass" } });

    const [, init] = fetchMock.mock.calls[0];
    expect(init?.body).toBe('{"email":"a@b.c","password":"secret-pass"}');
    expect(new Headers(init?.headers).get("Content-Type")).toBe("application/json");
    expect(new Headers(init?.headers).has("Authorization")).toBe(false);
  });

  it("turns a ProblemDetail into an ApiError with its field errors", async () => {
    fetchMock.mockResolvedValue(
      problem(400, {
        title: "Bad Request",
        detail: "Some fields are not valid.",
        fieldErrors: { password: "must be at least 8 characters" }
      })
    );

    const error = await caught(apiFetch("/auth/register", { method: "POST", body: {} }));

    expect(error.status).toBe(400);
    expect(error.title).toBe("Bad Request");
    expect(error.detail).toBe("Some fields are not valid.");
    expect(error.fieldErrors).toEqual({ password: "must be at least 8 characters" });
  });

  it("logs out on a 401 to a request that carried the token", async () => {
    useAuthStore.getState().login({ token: "expired", expiresAt: FUTURE });
    fetchMock.mockResolvedValue(problem(401, { title: "Unauthorized", detail: "A valid login token is required." }));

    const error = await caught(apiFetch("/configurations"));

    expect(error.status).toBe(401);
    expect(useAuthStore.getState().token).toBeNull();
    expect(sessionStorage.getItem("myassistant-auth")).not.toContain("expired");
  });

  it("does not log out on the 401 of a wrong login: it is the form's error message", async () => {
    fetchMock.mockResolvedValue(problem(401, { title: "Unauthorized", detail: "Invalid email or password." }));
    const logout = vi.spyOn(useAuthStore.getState(), "logout");

    const error = await caught(apiFetch("/auth/login", { method: "POST", body: {} }));

    expect(error.detail).toBe("Invalid email or password.");
    expect(logout).not.toHaveBeenCalled();
  });

  it("keeps a newer session when a 401 answers a request of an older one", async () => {
    useAuthStore.getState().login({ token: "old", expiresAt: FUTURE });
    let answer: (response: Response) => void = () => {};
    fetchMock.mockReturnValue(new Promise(resolve => (answer = resolve)));

    const request = apiFetch("/configurations");
    useAuthStore.getState().login({ token: "new", expiresAt: FUTURE });
    answer(problem(401, { detail: "A valid login token is required." }));
    await caught(request);

    expect(useAuthStore.getState().token).toBe("new");
  });

  it("turns a network failure into an ApiError with status 0", async () => {
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));

    const error = await caught(apiFetch("/configurations"));

    expect(error.status).toBe(0);
    expect(error.detail).toMatch(/Cannot reach the MyAssistant server/);
  });

  it("turns a gateway error page (API container down) into a readable ApiError", async () => {
    fetchMock.mockResolvedValue(
      new Response("<html>502 Bad Gateway</html>", {
        status: 502,
        statusText: "Bad Gateway",
        headers: { "Content-Type": "text/html" }
      })
    );

    const error = await caught(apiFetch("/configurations"));

    expect(error.status).toBe(502);
    expect(error.detail).toMatch(/not available right now/);
    expect(error.fieldErrors).toEqual({});
  });

  it("returns undefined for 204 No Content", async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));

    await expect(apiFetch("/configurations/1", { method: "DELETE" })).resolves.toBeUndefined();
  });
});
