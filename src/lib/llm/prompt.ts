import type { TemplateVariable } from "@/lib/types";

// The single place that builds the system prompt (AGENTS.md §2), the counterpart of SkillForge's buildSystemPrompt.
// Variable values are typed by the user, so they are treated as untrusted text: trimmed, capped, and inserted in
// one pass, never rendered again.

/** The API's own placeholder rule (TemplateService): `{{` + characters other than `{` and `}` + `}}`, taken as written. */
const PLACEHOLDER = /\{\{([^{}]+)\}\}/g;

/** The API's rule for a variable name (TemplateVariable.NAME_PATTERN). */
export const VARIABLE_NAME_PATTERN = /^[a-zA-Z][a-zA-Z0-9_]{0,39}$/;

/**
 * The longest value inserted for one variable. It is the API's own limit for a value and a default (1000), so a
 * value the API accepted is never cut; the cap still bounds what reaches the model if a value arrives from elsewhere.
 */
export const MAX_VALUE_LENGTH = 1000;

export interface PromptTemplate {
  content: string;
  variables: readonly TemplateVariable[];
}

export interface RenderOptions {
  /** Called once per placeholder that no variable declares. The default is a console warning. */
  onUnknownPlaceholder?: (name: string) => void;
}

function clip(value: string): string {
  const trimmed = value.trim();
  return trimmed.length > MAX_VALUE_LENGTH ? trimmed.slice(0, MAX_VALUE_LENGTH) : trimmed;
}

const warnUnknown = (name: string) =>
  console.warn(`The template uses {{${name}}}, which is not one of its variables; it is left out.`);

/**
 * Renders `template.content`: every `{{name}}` becomes the user's value for `name`, or the variable's default when
 * the value is missing or blank. Single pass: a value that contains `{{x}}` stays literal text, so a value can never
 * pull in another variable. A placeholder no variable declares is left out (the API refuses such templates, so this
 * only happens with data that skipped it).
 */
export function renderSystemPrompt(
  template: PromptTemplate,
  variableValues: Readonly<Record<string, string>>,
  { onUnknownPlaceholder = warnUnknown }: RenderOptions = {}
): string {
  const variables = new Map(template.variables.map(variable => [variable.name, variable]));
  const reported = new Set<string>();
  return template.content.replace(PLACEHOLDER, (_match, name: string) => {
    const variable = variables.get(name);
    if (!variable) {
      if (!reported.has(name)) {
        reported.add(name);
        onUnknownPlaceholder(name);
      }
      return "";
    }
    const value = Object.hasOwn(variableValues, name) ? clip(variableValues[name] ?? "") : "";
    return value || clip(variable.defaultValue ?? "");
  });
}

/** The placeholders of `content`, each once, in order of appearance, exactly as written (as the API reports them). */
export function findPlaceholders(content: string): string[] {
  return [...new Set(Array.from(content.matchAll(PLACEHOLDER), match => match[1]))];
}

export interface DetectedVariables {
  /** Placeholders that are valid variable names and not declared yet: the rows to add. */
  missing: string[];
  /** Placeholders that can never be a variable (`{{ name }}` with spaces, `{{1st}}`): the user has to fix the text. */
  invalid: string[];
}

/** What "Detect variables" does with `content`, given the names already declared. */
export function detectVariables(content: string, declared: readonly string[]): DetectedVariables {
  const known = new Set(declared);
  const missing: string[] = [];
  const invalid: string[] = [];
  for (const name of findPlaceholders(content)) {
    if (known.has(name)) continue;
    (VARIABLE_NAME_PATTERN.test(name) ? missing : invalid).push(name);
  }
  return { missing, invalid };
}
