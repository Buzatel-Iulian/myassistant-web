import { useCallback, useEffect, useState } from "react";
import { Cpu, HardDrive, PowerOff, RefreshCw, Trash2 } from "lucide-react";
import { toast } from "@/lib/toast";

import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useResidentModels } from "@/hooks/useResidentModels";
import { formatBytes } from "@/lib/llm/cache";
import {
  deleteCachedModel,
  listCachedModels,
  listPrebuiltModels,
  unloadModel,
  type CachedModel,
  type ResidentModel
} from "@/lib/llm/engine";
import { formatVram } from "@/lib/llm/models";

type CacheState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; models: CachedModel[]; usedBytes: number | null };

const READ_ERROR =
  "Could not read the browser's model cache. Check your connection (the model list is downloaded once).";

async function readCache(): Promise<{ models: CachedModel[]; usedBytes: number | null }> {
  const [models, estimate] = await Promise.all([
    listCachedModels(),
    navigator.storage?.estimate?.().catch(() => undefined)
  ]);
  return { models, usedBytes: estimate?.usage ?? null };
}

// The models in GPU memory right now (Phase 12), with their estimate and an Unload button each. A resident model
// whose files were deleted from the cache is listed here too: it keeps answering until it is unloaded.
function ResidentModelsList() {
  const residents = useResidentModels();
  const [vram, setVram] = useState<ReadonlyMap<string, number | null>>(new Map());
  const [unloading, setUnloading] = useState<ReadonlySet<string>>(new Set());

  useEffect(() => {
    let active = true;
    listPrebuiltModels()
      .then(models => active && setVram(new Map(models.map(model => [model.id, model.vramRequiredMB]))))
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);

  async function handleUnload(model: ResidentModel) {
    setUnloading(current => new Set(current).add(model.key));
    await unloadModel(model.key);
    setUnloading(current => {
      const next = new Set(current);
      next.delete(model.key);
      return next;
    });
    toast.success(`Unloaded ${model.modelId}. Its chats ask before loading it again.`);
  }

  const total = residents.reduce((sum, model) => sum + (vram.get(model.modelId) ?? 0), 0);
  return (
    <div className="flex flex-col gap-2" data-testid="resident-models">
      <h3 className="text-sm font-medium">In GPU memory</h3>
      {residents.length === 0 ? (
        <p className="rounded-lg border border-dashed p-3 text-sm text-muted-foreground" data-testid="resident-empty">
          No model is loaded. A chat asks before it loads its assistant&apos;s model.
        </p>
      ) : (
        <>
          <ul className="flex flex-col divide-y rounded-lg border">
            {residents.map(model => (
              <li key={model.key} className="flex flex-wrap items-center gap-3 p-3" data-testid="resident-model">
                <Cpu className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                <div className="min-w-0 flex-1">
                  <p className="font-mono text-xs break-all">{model.modelId}</p>
                  <p className="text-xs text-muted-foreground">
                    {model.status === "loading" ? "Loading · " : ""}
                    {model.contextWindowSize === null ? "default" : model.contextWindowSize.toLocaleString("en-US")}
                    -token window · {formatVram(vram.get(model.modelId) ?? null)}
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={unloading.has(model.key)}
                  onClick={() => void handleUnload(model)}
                  aria-label={`Unload ${model.modelId}`}
                >
                  <PowerOff /> Unload
                </Button>
              </li>
            ))}
          </ul>
          <p className="text-xs text-muted-foreground" data-testid="resident-total">
            About {formatVram(total)} in total (WebLLM&apos;s estimates).
          </p>
        </>
      )}
    </div>
  );
}

// The models this browser has downloaded, read from WebLLM's cache through engine.ts (the only WebLLM user). It is
// the user's way to get disk space back, and to force a fresh download of a model whose files went bad.
export function ModelCacheSection() {
  const [state, setState] = useState<CacheState>({ status: "loading" });
  const [toDelete, setToDelete] = useState<CachedModel | null>(null);
  const [deleting, setDeleting] = useState(false);
  const residents = useResidentModels();
  const residentIds = new Set(residents.map(model => model.modelId));

  const refresh = useCallback(async () => {
    try {
      const { models, usedBytes } = await readCache();
      setState({ status: "ready", models, usedBytes });
    } catch (error) {
      console.error("Could not read the model cache:", error);
      setState({ status: "error", message: READ_ERROR });
    }
  }, []);

  useEffect(() => {
    let active = true;
    readCache()
      .then(({ models, usedBytes }) => active && setState({ status: "ready", models, usedBytes }))
      .catch((error: unknown) => {
        console.error("Could not read the model cache:", error);
        if (active) setState({ status: "error", message: READ_ERROR });
      });
    return () => {
      active = false;
    };
  }, []);

  async function handleDelete() {
    if (!toDelete) return;
    setDeleting(true);
    try {
      await deleteCachedModel(toDelete.id);
      toast.success(`Deleted ${toDelete.id}. Its next load downloads it again.`);
    } catch (error) {
      console.error("Could not delete the model:", error);
      toast.error(error instanceof Error && error.message ? error.message : "Could not delete the model.");
    } finally {
      setDeleting(false);
      setToDelete(null);
      await refresh();
    }
  }

  return (
    <div className="flex flex-col gap-4" data-testid="model-cache">
      <div>
        <h2 className="text-lg font-semibold">Model cache</h2>
        <p className="text-sm text-muted-foreground">
          Models downloaded by this browser. They load without a network; deleting one frees its disk space, and the
          next chat that uses it downloads it again.
        </p>
      </div>

      <ResidentModelsList />

      <h3 className="text-sm font-medium">Downloaded</h3>

      {state.status === "loading" && (
        <div className="flex flex-col gap-2" aria-busy="true" aria-label="Reading the model cache">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      )}

      {state.status === "error" && (
        <Alert variant="destructive">
          <AlertDescription>{state.message}</AlertDescription>
        </Alert>
      )}

      {state.status === "ready" && state.models.length === 0 && (
        <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground" data-testid="cache-empty">
          No model is downloaded yet. Opening a chat downloads its assistant&apos;s model.
        </p>
      )}

      {state.status === "ready" && state.models.length > 0 && (
        <ul className="flex flex-col divide-y rounded-lg border">
          {state.models.map(model => (
            <li key={model.id} className="flex flex-wrap items-center gap-3 p-3" data-testid="cached-model">
              <HardDrive className="size-4 shrink-0 text-muted-foreground" aria-hidden />
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-xs break-all">{model.id}</span>
                  {residentIds.has(model.id) && (
                    <Badge variant="secondary" data-testid="cached-model-loaded">
                      <Cpu /> Loaded
                    </Badge>
                  )}
                </p>
                <p className="text-xs text-muted-foreground">
                  <span data-testid="cached-model-size">{formatBytes(model.sizeBytes)}</span> on disk ·{" "}
                  {formatVram(model.vramRequiredMB)}
                </p>
              </div>
              <Button variant="outline" size="sm" onClick={() => setToDelete(model)} aria-label={`Delete ${model.id}`}>
                <Trash2 /> Delete
              </Button>
            </li>
          ))}
        </ul>
      )}

      {state.status === "ready" && (
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
          <span>
            {state.usedBytes !== null && `This site uses ${formatBytes(state.usedBytes)} of browser storage in total.`}
          </span>
          <Button variant="ghost" size="sm" onClick={() => void refresh()}>
            <RefreshCw /> Refresh
          </Button>
        </div>
      )}

      <ConfirmDialog
        open={toDelete !== null}
        onOpenChange={open => !open && setToDelete(null)}
        title="Delete this model from the cache?"
        description={
          `${toDelete?.id ?? ""} (${formatBytes(toDelete?.sizeBytes ?? null)}) is removed from this browser. The next ` +
          "chat that uses it downloads it again. Assistants that use it are not changed." +
          (toDelete && residentIds.has(toDelete.id)
            ? " It is loaded in GPU memory: it keeps answering until you unload it."
            : "")
        }
        confirmLabel="Delete model"
        busy={deleting}
        onConfirm={() => void handleDelete()}
      />
    </div>
  );
}
