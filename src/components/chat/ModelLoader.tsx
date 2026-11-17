import { Download } from "lucide-react";

import { Progress, ProgressLabel, ProgressValue } from "@/components/ui/progress";
import type { LoadProgress } from "@/lib/llm/engine";
import { isIndeterminate, STAGE_LABELS } from "@/lib/llm/progress";

interface ModelLoaderProps {
  modelId: string;
  progress: LoadProgress;
}

export function ModelLoader({ modelId, progress }: ModelLoaderProps) {
  const indeterminate = isIndeterminate(progress.stage, progress.value);
  const percent = Math.round(progress.value * 100);
  const label = STAGE_LABELS[progress.stage];

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-4 rounded-2xl border bg-card p-6 shadow-sm">
      <div className="flex items-center gap-3">
        <Download className="size-5 shrink-0 text-muted-foreground" />
        <div className="min-w-0">
          <h2 className="font-medium">Loading the model</h2>
          <p className="truncate font-mono text-xs text-muted-foreground">{modelId}</p>
        </div>
      </div>

      {/* Each step has its own 0–100 % (the bar starts over when the download ends and the GPU load begins), so the
          label names the step. A null value is Base UI's indeterminate state: no percentage to show yet. */}
      <Progress
        value={indeterminate ? null : percent}
        data-stage={progress.stage}
        className="data-indeterminate:[&_[data-slot=progress-indicator]]:w-full data-indeterminate:[&_[data-slot=progress-indicator]]:animate-pulse"
      >
        <ProgressLabel>{label}</ProgressLabel>
        {indeterminate ? <span className="ml-auto text-sm text-muted-foreground">Starting…</span> : <ProgressValue />}
      </Progress>

      {/* Screen readers hear the steps, not every percent. */}
      <span className="sr-only" aria-live="polite">
        {label}
      </span>

      {/* WebLLM's own report, for the detail (MB fetched, shard n of N). */}
      <p className="min-h-10 text-sm break-words text-muted-foreground">{progress.text || "Starting the engine…"}</p>

      <p className="text-xs text-muted-foreground">
        The first download can be several hundred MB to a few GB, depending on the model. It runs once: later loads come
        from your browser&apos;s cache, without downloading again.
      </p>
    </div>
  );
}
