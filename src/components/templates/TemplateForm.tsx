import { useMemo, useState, type FormEvent } from "react";
import { ScanSearch } from "lucide-react";

import { errorProps } from "@/components/common/errorProps";
import { FieldError } from "@/components/common/FieldError";
import { FormAlert } from "@/components/common/FormAlert";
import { PromptPreview } from "@/components/common/PromptPreview";
import { StaleVersionAlert } from "@/components/common/StaleVersionAlert";
import { VariablesEditor, type VariableRow } from "@/components/templates/VariablesEditor";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ApiError } from "@/lib/api/client";
import { NO_ERRORS, templateFormErrors, type FormErrors } from "@/lib/api/formErrors";
import { createTemplate, updateTemplate } from "@/lib/api/templates";
import { detectVariables, findPlaceholders, renderSystemPrompt } from "@/lib/llm/prompt";
import type { Template, TemplateVariable } from "@/lib/types";

interface TemplateFormProps {
  /** The template being edited, or null for a new one. */
  template: Template | null;
  onSaved: (template: Template) => void;
  onCancel: () => void;
  onReload: () => void;
}

const blankToNull = (value: string) => (value.trim() === "" ? null : value);

function toRequestVariables(rows: readonly VariableRow[]): TemplateVariable[] {
  return rows.map(row => ({
    name: row.name,
    label: blankToNull(row.label),
    defaultValue: blankToNull(row.defaultValue)
  }));
}

// Row keys only need to be unique on the page, so one counter for the module is enough.
let nextRowKey = 0;
const newRow = (name = "", label = "", defaultValue = ""): VariableRow => ({
  key: nextRowKey++,
  name,
  label,
  defaultValue
});

export function TemplateForm({ template, onSaved, onCancel, onReload }: TemplateFormProps) {
  const [name, setName] = useState(template?.name ?? "");
  const [description, setDescription] = useState(template?.description ?? "");
  const [content, setContent] = useState(template?.content ?? "");
  const [rows, setRows] = useState<VariableRow[]>(() =>
    (template?.variables ?? []).map(v => newRow(v.name, v.label ?? "", v.defaultValue ?? ""))
  );
  const [errors, setErrors] = useState<FormErrors>(NO_ERRORS);
  const [stale, setStale] = useState(false);
  const [saving, setSaving] = useState(false);
  const [detectMessage, setDetectMessage] = useState<string | null>(null);

  const variables = useMemo(() => toRequestVariables(rows), [rows]);
  // The editor lists undeclared placeholders itself (below the content), so the renderer stays quiet about them.
  const preview = useMemo(
    () => renderSystemPrompt({ content, variables }, {}, { onUnknownPlaceholder: () => undefined }),
    [content, variables]
  );
  const undeclared = useMemo(() => {
    const declared = new Set(rows.map(row => row.name));
    return findPlaceholders(content).filter(placeholder => !declared.has(placeholder));
  }, [content, rows]);

  function handleDetect() {
    const { missing, invalid } = detectVariables(
      content,
      rows.map(row => row.name)
    );
    if (missing.length > 0) setRows([...rows, ...missing.map(variable => newRow(variable))]);
    const parts = [
      missing.length > 0 ? `Added ${missing.join(", ")}.` : "No new variables found.",
      invalid.length > 0
        ? `Not valid variable names (letters, digits and _, starting with a letter): ${invalid.map(p => `{{${p}}}`).join(", ")}.`
        : ""
    ];
    setDetectMessage(parts.filter(Boolean).join(" "));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setErrors(NO_ERRORS);
    setStale(false);
    const request = { name, description: blankToNull(description), content, variables };
    try {
      const saved = template
        ? await updateTemplate(template.id, { ...request, version: template.version })
        : await createTemplate(request);
      onSaved(saved);
    } catch (error) {
      if (!(error instanceof ApiError)) throw error;
      if (error.status === 409 && template) setStale(true);
      else setErrors(templateFormErrors(error, variables));
    } finally {
      setSaving(false);
    }
  }

  const fieldError = (key: string) => errors.fields[key];

  return (
    // noValidate: the API's rules are the only rules for a template, and its messages appear next to the fields.
    <form noValidate onSubmit={handleSubmit} className="flex max-w-3xl flex-col gap-5" aria-label="Template">
      {stale && <StaleVersionAlert what="template" onReload={onReload} />}
      <FormAlert message={errors.form} />

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="template-name">Name</Label>
        <Input
          id="template-name"
          value={name}
          onChange={event => setName(event.target.value)}
          {...errorProps("template-name-error", fieldError("name"))}
        />
        <FieldError id="template-name-error" message={fieldError("name")} />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="template-description">Description</Label>
        <Input
          id="template-description"
          value={description}
          placeholder="Optional"
          onChange={event => setDescription(event.target.value)}
          {...errorProps("template-description-error", fieldError("description"))}
        />
        <FieldError id="template-description-error" message={fieldError("description")} />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="template-content">Content</Label>
        <p className="text-xs text-muted-foreground">
          The system prompt. Write {"{{name}}"} where a variable's value goes.
        </p>
        <Textarea
          id="template-content"
          value={content}
          rows={8}
          spellCheck={false}
          className="font-mono text-sm"
          onChange={event => setContent(event.target.value)}
          {...errorProps("template-content-error", fieldError("content"))}
        />
        <FieldError id="template-content-error" message={fieldError("content")} />
        {undeclared.length > 0 && !fieldError("content") && (
          <p className="text-sm text-amber-700 dark:text-amber-400" data-testid="undeclared-placeholders">
            Not declared yet: {undeclared.map(p => `{{${p}}}`).join(", ")}.
          </p>
        )}
      </div>

      <section className="flex flex-col gap-3" aria-labelledby="variables-heading">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="variables-heading" className="text-base font-medium">
            Variables
          </h2>
          <Button type="button" variant="secondary" size="sm" onClick={handleDetect}>
            <ScanSearch /> Detect variables
          </Button>
        </div>
        {detectMessage && (
          <p className="text-sm text-muted-foreground" role="status" data-testid="detect-message">
            {detectMessage}
          </p>
        )}
        <VariablesEditor
          rows={rows}
          onChange={setRows}
          onAdd={() => setRows([...rows, newRow()])}
          errors={errors.fields}
        />
      </section>

      <PromptPreview
        id="template-preview"
        prompt={preview}
        hint="Rendered with the default values. An assistant can override each value."
      />

      <div className="flex gap-2">
        <Button type="submit" disabled={saving}>
          {saving ? "Saving…" : template ? "Save template" : "Create template"}
        </Button>
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
