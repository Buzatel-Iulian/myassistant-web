import type { ApiError } from "@/lib/api/client";
import type { TemplateVariable } from "@/lib/types";

// Turns an API error into messages next to the right form fields. Field keys are the API's `fieldErrors` keys as they
// come (`name`, `variables[0].name`, `settings.maxTokens`, `variableValues[language]`), so the form looks them up
// directly. Problem members that are not about one field (`unknownPlaceholders`, `duplicateVariables`,
// `unknownVariables`) are moved onto the field they are about. Whatever no field of the form shows goes into `form`,
// so no message is ever lost.

export interface FormErrors {
  fields: Record<string, string>;
  /** A message for the top of the form, or null when every error has a field. */
  form: string | null;
}

export const NO_ERRORS: FormErrors = { fields: {}, form: null };

function names(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function split(error: ApiError, fields: Record<string, string>, isShown: (key: string) => boolean): FormErrors {
  const shown: Record<string, string> = {};
  const rest: string[] = [];
  for (const [key, message] of Object.entries(fields)) {
    if (isShown(key)) shown[key] = message;
    else rest.push(`${key}: ${message}`);
  }
  const hasShown = Object.keys(shown).length > 0;
  // With no field to point at, the API's own sentence explains it best ("Some fields are invalid." does not).
  const form = rest.length > 0 ? `${error.detail} ${rest.join("; ")}.` : hasShown ? null : error.detail;
  return { fields: shown, form };
}

const TEMPLATE_FIELD = /^(name|description|content|variables)$|^variables\[\d+\]\.(name|label|defaultValue)$/;

/** Errors of a template save. `variables` is the list that was sent, to find the rows of duplicated names. */
export function templateFormErrors(error: ApiError, variables: readonly TemplateVariable[]): FormErrors {
  const fields: Record<string, string> = { ...error.fieldErrors };
  const unknown = names(error.problem.unknownPlaceholders);
  if (unknown.length > 0) {
    fields.content = `Not declared as variables: ${unknown.map(name => `{{${name}}}`).join(", ")}. Add them below (Detect variables) or remove them.`;
  }
  const duplicates = new Set(names(error.problem.duplicateVariables));
  variables.forEach((variable, index) => {
    if (duplicates.has(variable.name)) fields[`variables[${index}].name`] = "is declared more than once";
  });
  return split(error, fields, key => TEMPLATE_FIELD.test(key));
}

const CONFIGURATION_FIELD =
  /^(name|description|modelId|settings|templateId|variableValues)$|^settings\.\w+$|^variableValues\[[^\]]+\]$/;

/** Errors of an assistant save. */
export function configurationFormErrors(error: ApiError): FormErrors {
  const fields: Record<string, string> = { ...error.fieldErrors };
  const unknown = names(error.problem.unknownVariables);
  if (unknown.length > 0) fields.variableValues = `The template does not declare: ${unknown.join(", ")}`;
  // A template id that does not exist (deleted in another tab) is a 404 about the template field.
  if (error.status === 404 && /template/i.test(error.detail)) fields.templateId = error.detail;
  return split(error, fields, key => CONFIGURATION_FIELD.test(key));
}

/** The API's key for one variable value (`variableValues[language]`), as Bean Validation writes a map entry. */
export const variableValueKey = (name: string) => `variableValues[${name}]`;
