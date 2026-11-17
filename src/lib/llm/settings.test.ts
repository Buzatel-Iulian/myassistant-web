import { describe, expect, it } from "vitest";

import {
  DEFAULT_SETTINGS,
  MAX_TOKENS_MESSAGE,
  SETTINGS_LIMITS,
  toChatOptions,
  validateSettings
} from "@/lib/llm/settings";
import type { GenerationSettings } from "@/lib/types";

const settings = (overrides: Partial<GenerationSettings>): GenerationSettings => ({
  ...DEFAULT_SETTINGS,
  ...overrides
});

describe("settings limits", () => {
  it("are the API's limits (GenerationSettingsDto)", () => {
    expect(SETTINGS_LIMITS.temperature).toMatchObject({ min: 0, max: 2 });
    expect(SETTINGS_LIMITS.topP).toMatchObject({ min: 0, max: 1 });
    expect(SETTINGS_LIMITS.maxTokens).toMatchObject({ min: 1, max: 4096, integer: true });
    expect(SETTINGS_LIMITS.contextWindowSize).toMatchObject({ min: 512, max: 32768, integer: true });
    expect(SETTINGS_LIMITS.frequencyPenalty).toMatchObject({ min: -2, max: 2 });
    expect(SETTINGS_LIMITS.presencePenalty).toMatchObject({ min: -2, max: 2 });
  });

  it("accept the defaults", () => {
    expect(validateSettings(DEFAULT_SETTINGS)).toEqual({});
  });

  it("accept the limits themselves", () => {
    const low = settings({ temperature: 0, topP: 0, maxTokens: 1, contextWindowSize: 512 });
    const high = settings({ temperature: 2, topP: 1, maxTokens: 4096, contextWindowSize: 32768 });
    const penalties = settings({ frequencyPenalty: -2, presencePenalty: 2 });
    expect(validateSettings(low)).toEqual({});
    expect(validateSettings(high)).toEqual({});
    expect(validateSettings(penalties)).toEqual({});
  });

  it("reject values outside the limits, under the API's field keys", () => {
    const errors = validateSettings(
      settings({ temperature: 2.1, topP: -0.1, contextWindowSize: 40000, frequencyPenalty: -3, presencePenalty: 2.5 })
    );
    expect(errors).toEqual({
      "settings.temperature": "must be less than or equal to 2",
      "settings.topP": "must be greater than or equal to 0",
      "settings.contextWindowSize": "must be less than or equal to 32768",
      "settings.frequencyPenalty": "must be greater than or equal to -2",
      "settings.presencePenalty": "must be less than or equal to 2"
    });
  });

  it("reject max tokens out of range, or not a whole number", () => {
    expect(validateSettings(settings({ maxTokens: 0 }))).toEqual({
      "settings.maxTokens": "must be greater than or equal to 1"
    });
    expect(validateSettings(settings({ maxTokens: 12.5 }))).toEqual({ "settings.maxTokens": "must be a whole number" });
  });

  it("reject an empty number input (NaN) as a missing value", () => {
    expect(validateSettings(settings({ contextWindowSize: Number.NaN }))).toEqual({
      "settings.contextWindowSize": "must not be null"
    });
  });

  it("require max tokens below the context window size (511/512 ok, 512/512 and 4096/512 not)", () => {
    expect(validateSettings(settings({ maxTokens: 511, contextWindowSize: 512 }))).toEqual({});
    expect(validateSettings(settings({ maxTokens: 512, contextWindowSize: 512 }))).toEqual({
      "settings.maxTokens": MAX_TOKENS_MESSAGE
    });
    expect(validateSettings(settings({ maxTokens: 4096, contextWindowSize: 512 }))).toEqual({
      "settings.maxTokens": MAX_TOKENS_MESSAGE
    });
  });
});

describe("toChatOptions", () => {
  const assistant: GenerationSettings = {
    temperature: 0.2,
    topP: 0.9,
    maxTokens: 256,
    contextWindowSize: 1024,
    frequencyPenalty: 0.5,
    presencePenalty: -0.3
  };

  it("sends the context window with the model load, as a fixed window", () => {
    expect(toChatOptions(assistant).load).toEqual({ context_window_size: 1024, sliding_window_size: -1 });
  });

  it("sends the sampling settings with every request, under WebLLM's names", () => {
    expect(toChatOptions(assistant).request).toEqual({
      temperature: 0.2,
      top_p: 0.9,
      max_tokens: 256,
      frequency_penalty: 0.5,
      presence_penalty: -0.3
    });
  });

  it("keeps zero values (temperature 0 is greedy decoding, not 'unset')", () => {
    const greedy = toChatOptions(settings({ temperature: 0, topP: 0, frequencyPenalty: 0, presencePenalty: 0 }));
    expect(greedy.request).toMatchObject({ temperature: 0, top_p: 0, frequency_penalty: 0, presence_penalty: 0 });
  });

  it("does not put a load option in the request or a request option in the load", () => {
    const { load, request } = toChatOptions(DEFAULT_SETTINGS);
    expect(Object.keys(load).sort()).toEqual(["context_window_size", "sliding_window_size"]);
    expect(request).not.toHaveProperty("context_window_size");
  });
});
