import { useCallback, useEffect, useState } from "react";
import { HardDrive, RefreshCw, Trash2 } from "lucide-react";
import { toast } from "@/lib/toast";

import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { formatBytes } from "@/lib/llm/cache";
import { deleteCachedModel, listCachedModels, type CachedModel } from "@/lib/llm/engine";
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

// The models this browser has downloaded, read from WebLLM's cache through engine.ts (the only WebLLM user). It is
// the user's way to get disk space back, and to force a fresh download of a model whose files went bad.
export function ModelCacheSection() {
  const [state, setState] = useState<CacheState>({ status: "loading" });
  const [toDelete, setToDelete] = useState<CachedModel | null>(null);
  const [deleting, setDeleting] = useState(false);

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
                <p className="font-mono text-xs break-all">{model.id}</p>
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
        description={`${toDelete?.id ?? ""} (${formatBytes(toDelete?.sizeBytes ?? null)}) is removed from this browser. The next chat that uses it downloads it again. Assistants that use it are not changed.`}
        confirmLabel="Delete model"
        busy={deleting}
        onConfirm={() => void handleDelete()}
      />
    </div>
  );
}
