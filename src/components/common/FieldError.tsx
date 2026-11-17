// The message next to a field. Its id is what the field points to with `aria-describedby`.
export function FieldError({ id, message }: { id: string; message: string | undefined }) {
  if (!message) return null;
  return (
    <p id={id} className="text-sm text-destructive" data-field-error>
      {message}
    </p>
  );
}
