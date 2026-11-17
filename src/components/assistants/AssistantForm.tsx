import { useMemo, useState, type FormEvent } from "react";
import { Link } from "react-router";

import { ModelPicker } from "@/components/assistants/ModelPicker";
import { SettingsFields } from "@/components/assistants/SettingsFields";
import { errorProps } from "@/components/common/errorProps";
import { FieldError } from "@/components/common/FieldError";
import { FormAlert } from "@/components/common/FormAlert";
import { PromptPreview } from "@/components/common/PromptPreview";
import { StaleVersionAlert } from "@/components/common/StaleVersionAlert";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { ApiError } from "@/lib/api/client";
import { reportUnexpected } from "@/lib/unexpected";
import { createConfiguration, updateConfiguration } from "@/lib/api/configurations";
import { configurationFormErrors, NO_ERRORS, variableValueKey, type FormErrors } from "@/lib/api/formErrors";
import { renderSystemPrompt } from "@/lib/llm/prompt";
import { DEFAULT_SETTINGS, validateSettings } from "@/lib/llm/settings";
import type { Configuration, GenerationSettings, Template } from "@/lib/types";

// The smallest chat model (~1 GB of GPU memory), the one the starter "General assistant" uses.
const DEFAULT_MODEL_ID = "Qwen2.5-0.5B-Instruct-q4f16_1-MLC";
// Base UI's Select needs a value for "no template"; the API gets null.
const NO_TEMPLATE = "none";

interface AssistantFormProps {
  /** The assistant being edited, or null for a new one. */
  configuration: Configuration | null;
  templates: readonly Template[];
  onSaved: (configuration: Configuration) => void;
  onCancel: () => void;
  onReload: () => void;
}

export function AssistantForm({ configuration, templates, onSaved, onCancel, onReload }: AssistantFormProps) {
  const [name, setName] = useState(configuration?.name ?? "");
  const [description, setDescription] = useState(configuration?.description ?? "");
  const [modelId, setModelId] = useState(configuration?.modelId ?? DEFAULT_MODEL_ID);
  const [settings, setSettings] = useState<GenerationSettings>(configuration?.settings ?? DEFAULT_SETTINGS);
  const [templateId, setTemplateId] = useState<string | null>(configuration?.templateId ?? null);
  // Every value typed so far, also for variables of a template chosen earlier: switching back keeps them.
  const [values, setValues] = useState<Record<string, string>>(configuration?.variableValues ?? {});
  const [favorite, setFavorite] = useState(configuration?.favorite ?? false);
  const [errors, setErrors] = useState<FormErrors>(NO_ERRORS);
  const [stale, setStale] = useState(false);
  const [saving, setSaving] = useState(false);

  const template = templates.find(item => item.id === templateId) ?? null;
  // The id is kept when the template was deleted meanwhile; the user has to pick another one (the API answers 404).
  const missingTemplate = templateId !== null && template === null;

  // Only the chosen template's variables are sent: the API refuses keys the template does not declare. Blank values
  // are left out, so the template's default applies (and a later change of that default reaches this assistant).
  const variableValues = useMemo(() => {
    const result: Record<string, string> = {};
    for (const variable of template?.variables ?? []) {
      const value = values[variable.name];
      if (value !== undefined && value.trim() !== "") result[variable.name] = value;
    }
    return result;
  }, [template, values]);

  const preview = useMemo(
    () => (template ? renderSystemPrompt(template, variableValues) : ""),
    [template, variableValues]
  );

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStale(false);
    // The settings' limits are known here (lib/llm/settings.ts, the API's own); everything else is the API's call.
    const settingsErrors = validateSettings(settings);
    if (Object.keys(settingsErrors).length > 0) {
      setErrors({ fields: settingsErrors, form: null });
      return;
    }
    setErrors(NO_ERRORS);
    setSaving(true);
    const request = {
      name,
      description: description.trim() === "" ? null : description,
      modelId,
      settings,
      templateId,
      variableValues,
      favorite
    };
    try {
      const saved = configuration
        ? await updateConfiguration(configuration.id, { ...request, version: configuration.version })
        : await createConfiguration(request);
      onSaved(saved);
    } catch (error) {
      if (!(error instanceof ApiError))
        setErrors({ ...NO_ERRORS, form: reportUnexpected("Saving the assistant failed:", error) });
      else if (error.status === 409 && configuration) setStale(true);
      else setErrors(configurationFormErrors(error));
    } finally {
      setSaving(false);
    }
  }

  const fieldError = (key: string) => errors.fields[key];
  const templateItems = [
    { value: NO_TEMPLATE, label: "No template" },
    ...templates.map(item => ({ value: item.id, label: item.name })),
    ...(missingTemplate && templateId ? [{ value: templateId, label: "(deleted template)" }] : [])
  ];

  return (
    // noValidate: the API checks the request; the form only checks the settings' known limits before sending.
    <form noValidate onSubmit={handleSubmit} className="flex max-w-3xl flex-col gap-6" aria-label="Assistant">
      {stale && <StaleVersionAlert what="assistant" onReload={onReload} />}
      <FormAlert message={errors.form} />

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="assistant-name">Name</Label>
        <Input
          id="assistant-name"
          value={name}
          onChange={event => setName(event.target.value)}
          {...errorProps("assistant-name-error", fieldError("name"))}
        />
        <FieldError id="assistant-name-error" message={fieldError("name")} />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="assistant-description">Description</Label>
        <Input
          id="assistant-description"
          value={description}
          placeholder="Optional"
          onChange={event => setDescription(event.target.value)}
          {...errorProps("assistant-description-error", fieldError("description"))}
        />
        <FieldError id="assistant-description-error" message={fieldError("description")} />
      </div>

      <div className="flex items-center gap-2">
        {/* Base UI puts the id on its hidden input; the visible switch gets its name from the label's id. */}
        <Switch
          id="assistant-favorite"
          aria-labelledby="assistant-favorite-label"
          checked={favorite}
          onCheckedChange={checked => setFavorite(checked)}
        />
        <Label id="assistant-favorite-label" htmlFor="assistant-favorite">
          Favorite (listed first)
        </Label>
      </div>

      <section className="flex flex-col gap-3" aria-labelledby="model-heading">
        <h2 id="model-heading" className="text-base font-medium">
          Model and settings
        </h2>
        <ModelPicker value={modelId} onChange={setModelId} error={fieldError("modelId")} />
        <SettingsFields settings={settings} onChange={setSettings} errors={errors.fields} />
      </section>

      <section className="flex flex-col gap-3" aria-labelledby="prompt-heading">
        <h2 id="prompt-heading" className="text-base font-medium">
          System prompt
        </h2>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="assistant-template">Template</Label>
          <Select
            items={templateItems}
            value={templateId ?? NO_TEMPLATE}
            onValueChange={next => setTemplateId(!next || next === NO_TEMPLATE ? null : next)}
          >
            <SelectTrigger
              id="assistant-template"
              className="w-full"
              {...errorProps("assistant-template-error", fieldError("templateId"))}
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent alignItemWithTrigger={false}>
              {templateItems.map(item => (
                <SelectItem key={item.value} value={item.value}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            Manage templates on the{" "}
            <Link to="/templates" className="underline underline-offset-4">
              Templates
            </Link>{" "}
            page.
          </p>
          {missingTemplate && (
            <p className="text-sm text-amber-700 dark:text-amber-400">
              The template of this assistant was deleted. Choose another one.
            </p>
          )}
          <FieldError id="assistant-template-error" message={fieldError("templateId")} />
        </div>

        {template && template.variables.length > 0 && (
          <div className="flex flex-col gap-3" data-testid="variable-values">
            {template.variables.map(variable => {
              const id = `value-${variable.name}`;
              const error = fieldError(variableValueKey(variable.name));
              return (
                <div key={variable.name} className="flex flex-col gap-1.5">
                  <Label htmlFor={id}>{variable.label || variable.name}</Label>
                  <Input
                    id={id}
                    value={values[variable.name] ?? ""}
                    placeholder={variable.defaultValue ?? ""}
                    onChange={event => setValues({ ...values, [variable.name]: event.target.value })}
                    {...errorProps(`${id}-error`, error)}
                  />
                  <FieldError id={`${id}-error`} message={error} />
                </div>
              );
            })}
          </div>
        )}
        <FieldError id="assistant-values-error" message={fieldError("variableValues")} />

        <PromptPreview
          id="assistant-preview"
          prompt={preview}
          hint={
            template
              ? "The template rendered with these values; an empty value uses the default shown in grey."
              : "Choose a template to see the system prompt."
          }
        />
      </section>

      <div className="flex gap-2">
        <Button type="submit" disabled={saving}>
          {saving ? "Saving…" : configuration ? "Save assistant" : "Create assistant"}
        </Button>
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
