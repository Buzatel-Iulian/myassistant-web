import { useEffect, useState } from "react";
import { Cpu, HardDrive, HardDriveDownload, MessagesSquare } from "lucide-react";

import { planLoad, type LoadMode } from "@/components/chat/loadPlan";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatBytes } from "@/lib/llm/cache";
import {
  getModelWeightsSize,
  isModelCached,
  listPrebuiltModels,
  type ModelKey,
  type ResidentModel
} from "@/lib/llm/engine";
import { formatVram } from "@/lib/llm/models";

interface ModelFacts {
  vramByModel: ReadonlyMap<string, number | null>;
  cached: boolean;
  /** The weights' size on disk, read from the cached manifest; null when not cached or unknown. */
  sizeBytes: number | null;
}

// What the confirmation needs to know before anything is loaded: WebLLM's GPU memory estimates (its catalogue) and
// whether the model is in the browser cache. Only reads: no engine, no worker, no GPU, no download of the model.
function useModelFacts(modelId: string): ModelFacts | null {
  const [facts, setFacts] = useState<{ modelId: string; facts: ModelFacts } | null>(null);

  useEffect(() => {
    let active = true;
    void (async () => {
      const [catalogue, cached] = await Promise.all([listPrebuiltModels().catch(() => []), isModelCached(modelId)]);
      const sizeBytes = cached ? await getModelWeightsSize(modelId) : null;
      const vramByModel = new Map(catalogue.map(model => [model.id, model.vramRequiredMB]));
      if (active) setFacts({ modelId, facts: { vramByModel, cached, sizeBytes } });
    })();
    return () => {
      active = false;
    };
  }, [modelId]);

  return facts?.modelId === modelId ? facts.facts : null;
}

function contextLabel(tokens: number | null): string {
  return tokens === null ? "default context window" : `${tokens.toLocaleString("en-US")}-token context window`;
}

interface LoadConfirmationProps {
  modelId: string;
  modelKey: ModelKey;
  contextWindowSize: number;
  residents: readonly ResidentModel[];
  /** Messages already in this assistant's conversation: they are kept and shown again once the model is loaded. */
  keptMessages: number;
  onLoad: (mode: LoadMode) => void;
  onBack: () => void;
}

/**
 * Asked before a model goes into GPU memory (Phase 12): several models can stay resident, and loading one more than
 * the GPU holds fails or slows the whole machine down, so the user sees what it costs and what is already loaded.
 */
export function LoadConfirmation({
  modelId,
  modelKey,
  contextWindowSize,
  residents,
  keptMessages,
  onLoad,
  onBack
}: LoadConfirmationProps) {
  const facts = useModelFacts(modelId);
  const plan = planLoad(modelKey, modelId, residents, facts?.vramByModel ?? new Map());
  const atLeast = plan.partial ? "at least " : "";

  return (
    <section
      className="mx-auto flex w-full max-w-xl flex-col gap-4 rounded-2xl border bg-card p-6 shadow-sm"
      aria-labelledby="load-confirmation-title"
      data-testid="load-confirmation"
    >
      <div className="flex items-start gap-3">
        <Cpu className="mt-0.5 size-5 shrink-0 text-muted-foreground" aria-hidden />
        <div className="min-w-0">
          <h2 id="load-confirmation-title" className="font-medium">
            Load this model into GPU memory?
          </h2>
          <p className="font-mono text-xs break-all text-muted-foreground" data-testid="confirm-model-id">
            {modelId}
          </p>
        </div>
      </div>

      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
        <dt className="text-muted-foreground">GPU memory</dt>
        <dd data-testid="confirm-vram">
          {facts ? `about ${formatVram(plan.vramMB)}` : "…"}{" "}
          <span className="text-muted-foreground">(WebLLM&apos;s estimate, {contextLabel(contextWindowSize)})</span>
        </dd>
        <dt className="text-muted-foreground">Files</dt>
        <dd data-testid="confirm-cache" data-cached={facts ? String(facts.cached) : undefined}>
          {!facts ? (
            "Checking the browser cache…"
          ) : facts.cached ? (
            <span className="inline-flex flex-wrap items-center gap-2">
              <Badge variant="outline">
                <HardDrive /> In the browser cache
              </Badge>
              {formatBytes(facts.sizeBytes)}, loads without downloading
            </span>
          ) : (
            <span className="inline-flex flex-wrap items-center gap-2">
              <Badge variant="outline">
                <HardDriveDownload /> Needs a download
              </Badge>
              several hundred MB to a few GB, once; the loader shows the size when it starts
            </span>
          )}
        </dd>
      </dl>

      {plan.resident.length > 0 && (
        <div className="flex flex-col gap-2 text-sm" data-testid="confirm-resident">
          <p className="font-medium">Already in GPU memory</p>
          <ul className="flex flex-col divide-y rounded-lg border">
            {plan.resident.map(model => (
              <li key={model.key} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2">
                <span className="min-w-0 flex-1 font-mono text-xs break-all">{model.modelId}</span>
                <span className="text-xs text-muted-foreground">
                  {model.status === "loading" ? "loading · " : ""}
                  {contextLabel(model.contextWindowSize)} · {formatVram(model.vramMB)}
                </span>
              </li>
            ))}
          </ul>
          <p className="text-muted-foreground" data-testid="confirm-total">
            Loaded now: {atLeast}
            {formatVram(plan.residentMB)}. With this model: {atLeast}
            {formatVram(plan.totalMB)}.
          </p>
        </div>
      )}

      {keptMessages > 0 && (
        <p className="flex items-center gap-2 text-sm text-muted-foreground" data-testid="confirm-kept">
          <MessagesSquare className="size-4 shrink-0" aria-hidden />
          Your conversation ({keptMessages} {keptMessages === 1 ? "message" : "messages"}) is kept and continues once
          the model is loaded.
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        {/* The panel replaces the chat, so its main action takes the focus: Enter loads, Tab reaches the others. */}
        <Button autoFocus onClick={() => onLoad("alongside")} data-testid="confirm-load">
          {plan.canReplace ? "Load alongside" : "Load"}
        </Button>
        {plan.canReplace && (
          <Button variant="outline" onClick={() => onLoad("replace")} data-testid="confirm-replace">
            Replace loaded models
          </Button>
        )}
        <Button variant="ghost" onClick={onBack} data-testid="confirm-back">
          Back
        </Button>
      </div>
    </section>
  );
}
