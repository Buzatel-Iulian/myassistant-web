import { useState } from "react";
import { Link, useNavigate } from "react-router";
import { Bot, Copy, MessageSquare, Pencil, Plus, Star, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { LoadErrorPage, LoadingPage } from "@/components/common/PageState";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { useConfigurations } from "@/hooks/useConfigurations";
import { ApiError } from "@/lib/api/client";
import { reportUnexpected } from "@/lib/unexpected";
import { deleteConfiguration, duplicateConfiguration } from "@/lib/api/configurations";
import type { Configuration } from "@/lib/types";

// Favorites first, then the API's order (by name): stable, so it does not depend on how the API breaks ties.
function favoritesFirst(configurations: readonly Configuration[]): Configuration[] {
  return [...configurations].sort((a, b) => Number(b.favorite) - Number(a.favorite));
}

export function AssistantsPage() {
  const result = useConfigurations();
  const navigate = useNavigate();
  const [toDelete, setToDelete] = useState<Configuration | null>(null);
  const [busy, setBusy] = useState(false);

  async function run(action: () => Promise<void>) {
    setBusy(true);
    try {
      await action();
    } catch (error) {
      toast.error(error instanceof ApiError ? error.detail : reportUnexpected("Assistant action failed:", error));
    } finally {
      setBusy(false);
    }
  }

  const handleDuplicate = (configuration: Configuration) =>
    run(async () => {
      const copy = await duplicateConfiguration(configuration.id);
      toast.success(`Created "${copy.name}"`);
    });

  const handleDelete = () =>
    run(async () => {
      if (!toDelete) return;
      try {
        await deleteConfiguration(toDelete.id);
        toast.success(`Assistant "${toDelete.name}" deleted`);
      } finally {
        setToDelete(null);
      }
    });

  if (result.status === "loading") return <LoadingPage label="Loading assistants" />;
  if (result.status === "error") return <LoadErrorPage title="Could not load assistants" message={result.message} />;

  return (
    <div className="flex flex-col gap-4 p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold">Assistants</h1>
          <p className="text-muted-foreground">Your assistants: a model, its settings and a prompt template.</p>
        </div>
        <Button render={<Link to="/assistants/new" />}>
          <Plus /> New assistant
        </Button>
      </div>

      {result.data.length === 0 ? (
        <p className="text-muted-foreground">No assistants yet.</p>
      ) : (
        <ul className="grid gap-3 md:grid-cols-2" aria-label="Assistants">
          {favoritesFirst(result.data).map(configuration => (
            <li key={configuration.id}>
              <Card data-testid="assistant-card" className="h-full">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Bot className="size-4 shrink-0" />
                    <span className="truncate">{configuration.name}</span>
                    {configuration.favorite && (
                      <Star className="size-4 shrink-0 fill-current text-amber-500" aria-label="Favorite" role="img" />
                    )}
                  </CardTitle>
                  <CardDescription className="line-clamp-2">
                    {configuration.description || "No description"}
                  </CardDescription>
                  <CardAction className="flex gap-1">
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`Edit ${configuration.name}`}
                      render={<Link to={`/assistants/${configuration.id}`} />}
                    >
                      <Pencil />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      disabled={busy}
                      aria-label={`Duplicate ${configuration.name}`}
                      onClick={() => void handleDuplicate(configuration)}
                    >
                      <Copy />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`Delete ${configuration.name}`}
                      onClick={() => setToDelete(configuration)}
                    >
                      <Trash2 />
                    </Button>
                  </CardAction>
                </CardHeader>
                <CardFooter className="mt-auto flex flex-wrap items-center gap-2">
                  <Badge variant="secondary" className="max-w-full truncate">
                    {configuration.modelId}
                  </Badge>
                  <Badge variant="outline">
                    {configuration.template ? configuration.template.name : "No template"}
                  </Badge>
                  <Button
                    size="sm"
                    variant="outline"
                    className="ml-auto"
                    onClick={() => void navigate(`/chat/${configuration.id}`)}
                  >
                    <MessageSquare /> Open chat
                  </Button>
                </CardFooter>
              </Card>
            </li>
          ))}
        </ul>
      )}

      <ConfirmDialog
        open={toDelete !== null}
        onOpenChange={open => !open && setToDelete(null)}
        title="Delete assistant?"
        description={`"${toDelete?.name ?? ""}" will be deleted for good. Its template is kept.`}
        confirmLabel="Delete assistant"
        busy={busy}
        onConfirm={() => void handleDelete()}
      />
    </div>
  );
}
