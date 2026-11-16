import { Download } from "lucide-react";

import { Progress, ProgressLabel, ProgressValue } from "@/components/ui/progress";
import type { LoadProgress } from "@/lib/llm/engine";

interface ModelLoaderProps {
  modelId: string;
  progress: LoadProgress;
}

export function ModelLoader({ modelId, progress }: ModelLoaderProps) {
  const percent = Math.round(progress.value * 100);

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-4 rounded-2xl border bg-card p-6 shadow-sm">
      <div className="flex items-center gap-3">
        <Download className="size-5 shrink-0 text-muted-foreground" />
        <div className="min-w-0">
          <h2 className="font-medium">Loading the model</h2>
          <p className="truncate font-mono text-xs text-muted-foreground">{modelId}</p>
        </div>
      </div>

      <Progress value={percent}>
        <ProgressLabel>Model loading progress</ProgressLabel>
        <ProgressValue />
      </Progress>

      {/* WebLLM's own report says which step it is on (fetching, loading from cache, compiling shaders). */}
      <p className="min-h-10 text-sm break-words text-muted-foreground">{progress.text || "Starting the engine…"}</p>

      <p className="text-xs text-muted-foreground">
        The first download can be several hundred MB to a few GB, depending on the model. It runs once: later loads come
        from your browser&apos;s cache, without downloading again.
      </p>
    </div>
  );
}
