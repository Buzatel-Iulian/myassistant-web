import { useState } from "react";
import { useNavigate, useParams } from "react-router";
import { toast } from "@/lib/toast";

import { LoadErrorPage, LoadingPage } from "@/components/common/PageState";
import { TemplateForm } from "@/components/templates/TemplateForm";
import { useApiQuery } from "@/hooks/useApiQuery";
import { getTemplate } from "@/lib/api/templates";
import type { Template } from "@/lib/types";

// The form is not refreshed by other writes while the user types; it reloads only when asked (the 409's Reload).
const NO_CHANGES = [] as const;

export function TemplateEditPage() {
  const { templateId } = useParams();
  const navigate = useNavigate();
  const isNew = !templateId || templateId === "new";
  const [reloads, setReloads] = useState(0);
  const loaded = useApiQuery<Template | null>(
    isNew ? "template:new" : `template:${templateId}:${reloads}`,
    signal => (isNew ? Promise.resolve(null) : getTemplate(templateId, signal)),
    NO_CHANGES,
    "Could not load the template."
  );

  if (loaded.status === "loading") return <LoadingPage label="Loading template" />;
  if (loaded.status === "error") return <LoadErrorPage title="Could not load the template" message={loaded.message} />;

  const template = loaded.data;
  return (
    <div className="flex flex-col gap-4 p-6">
      <h1 className="text-2xl font-semibold">{template ? `Edit "${template.name}"` : "New template"}</h1>
      <TemplateForm
        // A reload (or a new version) starts the form again from what the API answered.
        key={template ? `${template.id}:${template.version}:${reloads}` : "new"}
        template={template}
        onSaved={saved => {
          toast.success(`Template "${saved.name}" saved`);
          void navigate("/templates");
        }}
        onCancel={() => void navigate("/templates")}
        onReload={() => setReloads(count => count + 1)}
      />
    </div>
  );
}
