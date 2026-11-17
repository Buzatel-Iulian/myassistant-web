import type { GenerationSettings } from "@/lib/types";

// The generation settings' limits, written once for the whole client. They are the API's limits
// (GenerationSettingsDto + @MaxTokensBelowContextWindow): the form never lets through a value the API would refuse,
// and when the API changes, this file follows. `toChatOptions` (the mapping onto WebLLM) is Phase 10.

export type SettingKey = keyof GenerationSettings;

export interface SettingLimit {
  min: number;
  max: number;
  /** The step of the slider or number input. */
  step: number;
  integer: boolean;
}

export const SETTINGS_LIMITS: Readonly<Record<SettingKey, SettingLimit>> = {
  temperature: { min: 0, max: 2, step: 0.05, integer: false },
  topP: { min: 0, max: 1, step: 0.01, integer: false },
  maxTokens: { min: 1, max: 4096, step: 1, integer: true },
  contextWindowSize: { min: 512, max: 32768, step: 1, integer: true },
  frequencyPenalty: { min: -2, max: 2, step: 0.1, integer: false },
  presencePenalty: { min: -2, max: 2, step: 0.1, integer: false }
};

/** A new assistant starts with the starter kit's settings (application.yml `myassistant.starter-kit`). */
export const DEFAULT_SETTINGS: Readonly<GenerationSettings> = {
  temperature: 0.7,
  topP: 0.95,
  maxTokens: 512,
  contextWindowSize: 4096,
  frequencyPenalty: 0,
  presencePenalty: 0
};

export const MAX_TOKENS_MESSAGE = "must be less than the context window size";

function limitError(value: number, limit: SettingLimit): string | null {
  // NaN is what an emptied number input gives; the API answers a missing value with the same words.
  if (!Number.isFinite(value)) return "must not be null";
  if (limit.integer && !Number.isInteger(value)) return "must be a whole number";
  if (value < limit.min) return `must be greater than or equal to ${limit.min}`;
  if (value > limit.max) return `must be less than or equal to ${limit.max}`;
  return null;
}

/**
 * Checks `settings` against the API's rules. The keys are the API's `fieldErrors` keys (`settings.maxTokens`), so
 * the form shows these and the API's own answers in the same place. Empty when the settings are valid.
 */
export function validateSettings(settings: GenerationSettings): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const key of Object.keys(SETTINGS_LIMITS) as SettingKey[]) {
    const error = limitError(settings[key], SETTINGS_LIMITS[key]);
    if (error) errors[`settings.${key}`] = error;
  }
  // The answer has to fit in the context window next to the prompt (the API's @MaxTokensBelowContextWindow).
  if (
    !errors["settings.maxTokens"] &&
    !errors["settings.contextWindowSize"] &&
    settings.maxTokens >= settings.contextWindowSize
  ) {
    errors["settings.maxTokens"] = MAX_TOKENS_MESSAGE;
  }
  return errors;
}
