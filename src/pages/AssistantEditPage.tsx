import { useState } from "react";
import { useNavigate, useParams } from "react-router";
import { toast } from "sonner";

import { AssistantForm } from "@/components/assistants/AssistantForm";
import { LoadErrorPage, LoadingPage } from "@/components/common/PageState";
import { useApiQuery } from "@/hooks/useApiQuery";
import { useTemplates } from "@/hooks/useTemplates";
import { getConfiguration } from "@/lib/api/configurations";
import type { Configuration } from "@/lib/types";

// The form is not refreshed by other writes while the user types; it reloads only when asked (the 409's Reload).
const NO_CHANGES = [] as const;

export function AssistantEditPage() {
  const { configId } = useParams();
  const navigate = useNavigate();
  const isNew = !configId || configId === "new";
  const [reloads, setReloads] = useState(0);
  const loaded = useApiQuery<Configuration | null>(
    isNew ? "configuration:new" : `configuration:${configId}:${reloads}`,
    signal => (isNew ? Promise.resolve(null) : getConfiguration(configId, signal)),
    NO_CHANGES,
    "Could not load the assistant."
  );
  const templates = useTemplates();

  if (loaded.status === "loading" || templates.status === "loading") return <LoadingPage label="Loading assistant" />;
  if (loaded.status === "error") return <LoadErrorPage title="Could not load the assistant" message={loaded.message} />;
  if (templates.status === "error") {
    return <LoadErrorPage title="Could not load your templates" message={templates.message} />;
  }

  const configuration = loaded.data;
  return (
    <div className="flex flex-col gap-4 p-6">
      <h1 className="text-2xl font-semibold">{configuration ? `Edit "${configuration.name}"` : "New assistant"}</h1>
      <AssistantForm
        key={configuration ? `${configuration.id}:${configuration.version}:${reloads}` : "new"}
        configuration={configuration}
        templates={templates.data}
        onSaved={saved => {
          toast.success(`Assistant "${saved.name}" saved`);
          void navigate("/assistants");
        }}
        onCancel={() => void navigate("/assistants")}
        onReload={() => setReloads(count => count + 1)}
      />
    </div>
  );
}
