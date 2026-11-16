// Mirrors of the API's DTOs (myassistant-api `**/dto`). The API is the source of truth: when a record there changes,
// this file follows. Instants arrive as ISO-8601 strings.

// --- Errors (Spring `ProblemDetail`, `application/problem+json`) ---

export interface ProblemDetail {
  type?: string;
  title?: string;
  status?: number;
  detail?: string;
  instance?: string;
  // Validation failures (400): field path → message, e.g. `password` or `settings.maxTokens`.
  fieldErrors?: Record<string, string>;
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

// --- Templates (embedded in a configuration) ---

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
