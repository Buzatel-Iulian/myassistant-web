import { Cpu } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

// Each entry only fills the composer: the user sees, and can change, the question before anything is sent.
const SUGGESTIONS = [
  "Say hi",
  "Explain what WebGPU is in two sentences.",
  "Write a haiku about the sea.",
  "Give me three tips for writing clear emails."
];

interface EmptyStateProps {
  modelId: string;
  onSuggestion: (prompt: string) => void;
}

export function EmptyState({ modelId, onSuggestion }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center gap-6 text-center">
      <div className="flex flex-col items-center gap-2">
        <Cpu className="size-8 text-muted-foreground" />
        <h1 className="text-2xl font-semibold">How can I help?</h1>
        <p className="text-muted-foreground">The model runs on your own GPU: nothing you type leaves this browser.</p>
        {/* The badge says which model answers, so the user knows what is applied. */}
        <Badge variant="secondary" className="font-mono">
          {modelId}
        </Badge>
      </div>

      <div className="flex flex-wrap justify-center gap-2">
        {SUGGESTIONS.map(suggestion => (
          <Button key={suggestion} variant="outline" size="sm" onClick={() => onSuggestion(suggestion)}>
            {suggestion}
          </Button>
        ))}
      </div>
    </div>
  );
}
