// Mirrors of the API's DTOs (myassistant-api `**/dto`). The API is the source of truth: when a record there changes,
// this file follows. Instants arrive as ISO-8601 strings.

// --- Errors (Spring `ProblemDetail`, `application/problem+json`) ---

export interface ProblemDetail {
  type?: string;
  title?: string;
  status?: number;
  detail?: string;
  instance?: string;
  // Validation failures (400): field path → message, e.g. `password`, `variables[0].name` or `settings.maxTokens`.
  fieldErrors?: Record<string, string>;
  // Template rules that no single field can express (400 from `InvalidTemplateException`).
  unknownPlaceholders?: string[];
  duplicateVariables?: string[];
  // A configuration's `variableValues` keys that its template does not declare (400).
  unknownVariables?: string[];
  // Deleting a template that assistants still use (409): their names.
  configurations?: string[];
}

// --- Accounts: /api/auth, /api/users/me ---

export interface RegisterRequest {
  email: string;
  password: string;
  displayName: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface TokenResponse {
  token: string;
  expiresAt: string;
}

export interface User {
  id: string;
  email: string;
  displayName: string;
}

// --- Templates: /api/templates (also embedded in a configuration) ---

export interface TemplateVariable {
  name: string;
  label: string | null;
  defaultValue: string | null;
}

export interface Template {
  id: string;
  version: number;
  name: string;
  description: string | null;
  content: string;
  variables: TemplateVariable[];
  createdAt: string;
  updatedAt: string;
}

export interface CreateTemplateRequest {
  name: string;
  description: string | null;
  content: string;
  variables: TemplateVariable[];
}

/** PUT sends every field plus the `version` that was read; another version means a 409. */
export interface UpdateTemplateRequest extends CreateTemplateRequest {
  version: number;
}

// --- Configurations ("assistants"): /api/configurations ---

export interface GenerationSettings {
  temperature: number;
  topP: number;
  maxTokens: number;
  contextWindowSize: number;
  frequencyPenalty: number;
  presencePenalty: number;
}

export interface Configuration {
  id: string;
  version: number;
  name: string;
  description: string | null;
  modelId: string;
  settings: GenerationSettings;
  templateId: string | null;
  template: Template | null;
  variableValues: Record<string, string>;
  resolvedVariableValues: Record<string, string>;
  favorite: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateConfigurationRequest {
  name: string;
  description: string | null;
  modelId: string;
  settings: GenerationSettings;
  templateId: string | null;
  variableValues: Record<string, string>;
  favorite: boolean;
}

export interface UpdateConfigurationRequest extends CreateConfigurationRequest {
  version: number;
}
