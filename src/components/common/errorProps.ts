/** The `aria-invalid` / `aria-describedby` pair for a field with an optional error. */
export function errorProps(errorId: string, message: string | undefined) {
  return message ? { "aria-invalid": true, "aria-describedby": errorId } : {};
}
