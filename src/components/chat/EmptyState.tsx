import { Bot, Cpu, FileText } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { Configuration } from "@/lib/types";

// Each entry only fills the composer: the user sees, and can change, the question before anything is sent.
const SUGGESTIONS = [
  "Say hi",
  "Explain what WebGPU is in two sentences.",
  "Write a haiku about the sea.",
  "Give me three tips for writing clear emails."
];

interface EmptyStateProps {
  configuration: Pick<Configuration, "name" | "description" | "modelId" | "template" | "templateId">;
  onSuggestion: (prompt: string) => void;
}

function templateLabel({ template, templateId }: EmptyStateProps["configuration"]): string {
  if (template) return template.name;
  return templateId ? "Template deleted (default prompt)" : "No template (default prompt)";
}

export function EmptyState({ configuration, onSuggestion }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center gap-6 text-center">
      <div className="flex flex-col items-center gap-2">
        <Bot className="size-8 text-muted-foreground" />
        <h1 className="text-2xl font-semibold">{configuration.name}</h1>
        <p className="max-w-xl text-muted-foreground">{configuration.description || "How can I help?"}</p>
        {/* The active context, as in SkillForge: without it, the only way to know which prompt and model answer would
            be to guess from the answers. */}
        <div className="flex flex-wrap justify-center gap-2" aria-label="Active context" data-testid="active-context">
          <Badge variant="secondary" className="h-auto max-w-sm py-1 whitespace-normal">
            <FileText /> Template: {templateLabel(configuration)}
          </Badge>
          <Badge variant="secondary" className="h-auto max-w-sm py-1 font-mono whitespace-normal">
            <Cpu /> {configuration.modelId}
          </Badge>
        </div>
        <p className="text-xs text-muted-foreground">
          The model runs on your own GPU: nothing you type leaves this browser.
        </p>
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
