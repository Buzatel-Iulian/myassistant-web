// An error that is not an ApiError should not happen (apiFetch wraps network failures and error answers), but a bug
// must not turn a click into a silent unhandled rejection either (QA-9-1): the user gets a generic message in the
// form, and the console gets the real error for whoever has to fix it.
export const UNEXPECTED_ERROR = "Something unexpected went wrong. Try again; if it keeps happening, reload the page.";

export function reportUnexpected(context: string, error: unknown): string {
  console.error(context, error);
  return UNEXPECTED_ERROR;
}
