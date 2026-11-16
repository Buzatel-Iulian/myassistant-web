import type { ProblemDetail } from "@/lib/types";
import { useAuthStore } from "@/store/useAuthStore";

const NETWORK_ERROR = "Cannot reach the MyAssistant server. Check that it is running and try again.";
const SERVER_UNAVAILABLE = "The MyAssistant server is not available right now. Try again in a moment.";
const UNEXPECTED_ANSWER = "The server sent an unexpected answer. Try again.";

// Every failure of an API call, so callers handle one error type. `status` 0 means the request never got an
// answer (the server is down or the network is gone).
export class ApiError extends Error {
  readonly status: number;
  readonly title: string;
  readonly detail: string;
  readonly fieldErrors: Record<string, string>;

  constructor(status: number, title: string, detail: string, fieldErrors: Record<string, string> = {}) {
    super(detail);
    this.name = "ApiError";
    this.status = status;
    this.title = title;
    this.detail = detail;
    this.fieldErrors = fieldErrors;
  }
}

interface ApiFetchInit extends Omit<RequestInit, "body"> {
  // Serialized as JSON: every API body is JSON.
  body?: unknown;
}

function isProblem(response: Response): boolean {
  return response.headers.get("Content-Type")?.includes("application/problem+json") ?? false;
}

async function toApiError(response: Response): Promise<ApiError> {
  if (isProblem(response)) {
    const problem = (await response.json().catch(() => ({}))) as ProblemDetail;
    return new ApiError(
      problem.status ?? response.status,
      problem.title ?? response.statusText,
      problem.detail ?? UNEXPECTED_ANSWER,
      problem.fieldErrors ?? {}
    );
  }
  // Not from the API: nginx answers 502/504 with an HTML page when the API container is down, and the Vite proxy a
  // bare 500 when nothing listens on :8080.
  const detail = response.status >= 500 ? SERVER_UNAVAILABLE : UNEXPECTED_ANSWER;
  return new ApiError(response.status, response.statusText || "Error", detail);
}

// The only place in the app that calls `fetch` (AGENTS.md §2). Paths are relative to /api, e.g. "/users/me".
export async function apiFetch<T>(path: string, init: ApiFetchInit = {}): Promise<T> {
  const { body, ...rest } = init;
  const token = useAuthStore.getState().token;

  const headers = new Headers(rest.headers);
  headers.set("Accept", "application/json, application/problem+json");
  if (body !== undefined) headers.set("Content-Type", "application/json");
  if (token) headers.set("Authorization", `Bearer ${token}`);

  let response: Response;
  try {
    response = await fetch(`/api${path}`, {
      ...rest,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body)
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    throw new ApiError(0, "Network error", NETWORK_ERROR);
  }

  if (!response.ok) {
    const error = await toApiError(response);
    // A 401 ends the session only when the request carried the token: then the token is expired or no longer
    // valid. A 401 without a token is the answer to wrong credentials on the login form, which must show its
    // message instead of logging out. The check against the current token keeps a late answer to an old session
    // from logging out a newer one. Logging out is enough to redirect: `RequireAuth` sends a logged-out visitor
    // to /login.
    if (response.status === 401 && token && useAuthStore.getState().token === token) {
      useAuthStore.getState().logout();
    }
    throw error;
  }

  if (response.status === 204 || response.headers.get("Content-Length") === "0") return undefined as T;
  return (await response.json()) as T;
}
