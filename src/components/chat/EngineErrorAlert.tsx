import type { ReactNode } from "react";
import { CircleAlert, HardDriveDownload } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { useChatModels } from "@/hooks/useChatModels";
import type { EngineFailure } from "@/lib/llm/errors";
import { formatVram } from "@/lib/llm/models";

const MAX_SUGGESTIONS = 6;

// The answer to "not enough GPU memory": WebLLM's laptop-friendly models (`low_resource_required`) that need less
// GPU memory than the one that failed, smallest first, so the user knows what to pick in Edit assistant.
export function SmallerModels({ modelId }: { modelId: string }) {
  const models = useChatModels();
  if (models.status !== "ready") return null;
  const current = models.models.find(model => model.id === modelId)?.vramRequiredMB ?? null;
  const smaller = models.models
    .filter(model => model.lowResourceRequired && model.id !== modelId)
    .filter(model => current === null || (model.vramRequiredMB ?? Infinity) < current)
    .sort((a, b) => (a.vramRequiredMB ?? Infinity) - (b.vramRequiredMB ?? Infinity))
    .slice(0, MAX_SUGGESTIONS);
  if (smaller.length === 0) return null;

  return (
    <div className="mt-2" data-testid="smaller-models">
      <p className="font-medium text-foreground">
        Models for laptops{current !== null && ` (this one needs ${formatVram(current)})`}:
      </p>
      <ul className="mt-1 flex flex-col gap-1">
        {smaller.map(model => (
          <li key={model.id} className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-xs break-all">{model.id}</span>
            <span className="text-xs">{formatVram(model.vramRequiredMB)}</span>
            {models.cached.has(model.id) && (
              <Badge variant="outline">
                <HardDriveDownload /> Cached
              </Badge>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

interface EngineErrorAlertProps {
  failure: EngineFailure;
  /** The model that failed: with "not enough GPU memory" the alert lists smaller ones. */
  modelId: string;
  /** Buttons under the message (Try again, Edit assistant). */
  actions?: ReactNode;
  className?: string;
}

/** A failure of the local model: what happened, what to do, and the original error as a one-line detail. */
export function EngineErrorAlert({ failure, modelId, actions, className }: EngineErrorAlertProps) {
  return (
    <Alert variant="destructive" className={className} data-testid="engine-error" data-kind={failure.kind}>
      <CircleAlert />
      <AlertTitle>{failure.title}</AlertTitle>
      <AlertDescription>
        <p>{failure.message}</p>
        {failure.kind === "gpuMemory" && <SmallerModels modelId={modelId} />}
        {failure.details && <p className="mt-2 text-xs break-words opacity-80">Details: {failure.details}</p>}
        {actions && <div className="mt-3 flex flex-wrap gap-2">{actions}</div>}
      </AlertDescription>
    </Alert>
  );
}
