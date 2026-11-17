import { Label } from "@/components/ui/label";

// The rendered system prompt, read-only: exactly what the model will receive as its first message.
export function PromptPreview({ id, prompt, hint }: { id: string; prompt: string; hint: string }) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>System prompt preview</Label>
      <p className="text-xs text-muted-foreground">{hint}</p>
      <pre
        id={id}
        tabIndex={0}
        aria-live="polite"
        data-testid="prompt-preview"
        className="max-h-72 min-h-16 overflow-auto rounded-lg border bg-muted/40 p-3 font-mono text-xs whitespace-pre-wrap"
      >
        {prompt || <span className="text-muted-foreground italic">(empty)</span>}
      </pre>
    </div>
  );
}
