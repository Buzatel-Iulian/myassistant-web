// Where RequireAuth sent a logged-out visitor from, so login (or registering) brings them back to that page. The
// whole location is kept, query string and hash included (QA-7-2), and it travels between /login and /register in
// the router state (QA-7-3).

export interface ReturnState {
  from: string;
}

export const DEFAULT_RETURN_PATH = "/chat";

/** The state RequireAuth puts on the redirect to /login. */
export function returnStateFor(location: { pathname: string; search: string; hash: string }): ReturnState {
  return { from: `${location.pathname}${location.search}${location.hash}` };
}

/**
 * The page to go to after logging in. Only a path of this app: "//host" would be another site
 * (a protocol-relative URL), so it falls back to the chat.
 */
export function returnPathFrom(state: unknown): string {
  const from = (state as { from?: unknown } | null)?.from;
  return typeof from === "string" && from.startsWith("/") && !from.startsWith("//") ? from : DEFAULT_RETURN_PATH;
}
