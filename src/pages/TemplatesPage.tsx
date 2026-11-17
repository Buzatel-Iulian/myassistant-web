import { useState } from "react";
import { Link } from "react-router";
import { CircleAlert, FileText, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "@/lib/toast";

import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { LoadErrorPage, LoadingPage } from "@/components/common/PageState";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { useConfigurations } from "@/hooks/useConfigurations";
import { useTemplates } from "@/hooks/useTemplates";
import { ApiError } from "@/lib/api/client";
import { reportUnexpected } from "@/lib/unexpected";
import { deleteTemplate } from "@/lib/api/templates";
import type { Configuration, Template } from "@/lib/types";

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? "" : "s"}`;

// "Used by N assistants" is counted here from the assistants list: the API has no usage count per template, and the
// list is already fetched (and kept fresh) for the sidebar. It is a hint; the API's 409 on delete is the real check.
function usageCounts(configurations: readonly Configuration[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const configuration of configurations) {
    if (configuration.templateId) counts.set(configuration.templateId, (counts.get(configuration.templateId) ?? 0) + 1);
  }
  return counts;
}

interface InUse {
  templateName: string;
  assistants: string[];
  detail: string;
}

export function TemplatesPage() {
  const templates = useTemplates();
  const configurations = useConfigurations();
  const [toDelete, setToDelete] = useState<Template | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [inUse, setInUse] = useState<InUse | null>(null);

  async function handleDelete() {
    if (!toDelete) return;
    setDeleting(true);
    setInUse(null);
    try {
      await deleteTemplate(toDelete.id);
      toast.success(`Template "${toDelete.name}" deleted`);
    } catch (error) {
      if (!(error instanceof ApiError)) {
        toast.error(reportUnexpected("Deleting the template failed:", error));
        return;
      }
      const assistants = Array.isArray(error.problem.configurations) ? error.problem.configurations : [];
      if (error.status === 409) setInUse({ templateName: toDelete.name, assistants, detail: error.detail });
      else toast.error(error.detail);
    } finally {
      setDeleting(false);
      setToDelete(null);
    }
  }

  if (templates.status === "loading") return <LoadingPage label="Loading templates" />;
  if (templates.status === "error")
    return <LoadErrorPage title="Could not load templates" message={templates.message} />;

  const counts = configurations.status === "ready" ? usageCounts(configurations.data) : null;

  return (
    <div className="flex flex-col gap-4 p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold">Templates</h1>
          <p className="text-muted-foreground">Your reusable system prompts with {"{{variables}}"}.</p>
        </div>
        <Button render={<Link to="/templates/new" />}>
          <Plus /> New template
        </Button>
      </div>

      {inUse && (
        <Alert variant="destructive" data-testid="template-in-use">
          <CircleAlert />
          <AlertTitle>"{inUse.templateName}" is still used and was not deleted</AlertTitle>
          <AlertDescription>
            <p>Change or delete these assistants first:</p>
            <ul className="list-disc pl-5">
              {inUse.assistants.map(name => (
                <li key={name}>{name}</li>
              ))}
            </ul>
            {inUse.assistants.length === 0 && <p>{inUse.detail}</p>}
            <Button variant="outline" size="sm" className="mt-2" onClick={() => setInUse(null)}>
              Dismiss
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {templates.data.length === 0 ? (
        <p className="text-muted-foreground">No templates yet.</p>
      ) : (
        <ul className="grid gap-3 md:grid-cols-2" aria-label="Templates">
          {templates.data.map(template => {
            const used = counts?.get(template.id) ?? 0;
            return (
              <li key={template.id}>
                <Card data-testid="template-card" className="h-full">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <FileText className="size-4 shrink-0" />
                      <span className="truncate">{template.name}</span>
                    </CardTitle>
                    <CardDescription className="line-clamp-2">
                      {template.description || "No description"}
                    </CardDescription>
                    <CardAction className="flex gap-1">
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Edit ${template.name}`}
                        render={<Link to={`/templates/${template.id}`} />}
                      >
                        <Pencil />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Delete ${template.name}`}
                        onClick={() => setToDelete(template)}
                      >
                        <Trash2 />
                      </Button>
                    </CardAction>
                  </CardHeader>
                  <CardFooter className="mt-auto flex flex-wrap gap-2">
                    <Badge variant="secondary">{plural(template.variables.length, "variable")}</Badge>
                    <Badge variant="outline" data-testid="template-usage">
                      {counts ? `Used by ${plural(used, "assistant")}` : "Usage loading…"}
                    </Badge>
                  </CardFooter>
                </Card>
              </li>
            );
          })}
        </ul>
      )}

      <ConfirmDialog
        open={toDelete !== null}
        onOpenChange={open => !open && setToDelete(null)}
        title="Delete template?"
        description={`"${toDelete?.name ?? ""}" will be deleted for good. A template that assistants use cannot be deleted.`}
        confirmLabel="Delete template"
        busy={deleting}
        onConfirm={() => void handleDelete()}
      />
    </div>
  );
}
