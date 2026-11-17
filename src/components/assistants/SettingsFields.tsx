import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";

import { errorProps } from "@/components/common/errorProps";
import { FieldError } from "@/components/common/FieldError";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { SETTINGS_LIMITS, type SettingKey } from "@/lib/llm/settings";
import type { GenerationSettings } from "@/lib/types";

interface SettingsFieldsProps {
  settings: GenerationSettings;
  onChange: (settings: GenerationSettings) => void;
  /** Keyed like the API: `settings.temperature`, ... */
  errors: Record<string, string>;
}

const LABELS: Record<SettingKey, { label: string; hint: string }> = {
  temperature: { label: "Temperature", hint: "Higher is more creative, lower is more predictable." },
  topP: { label: "Top-p", hint: "Only the most likely words that add up to this share are considered." },
  maxTokens: { label: "Max tokens", hint: "The longest answer, in tokens. Must be less than the context window." },
  contextWindowSize: { label: "Context window", hint: "How many tokens the model keeps in view (prompt + chat)." },
  frequencyPenalty: { label: "Frequency penalty", hint: "Positive values discourage repeating the same words." },
  presencePenalty: { label: "Presence penalty", hint: "Positive values encourage new topics." }
};

const ADVANCED: readonly SettingKey[] = ["frequencyPenalty", "presencePenalty"];

export function SettingsFields({ settings, onChange, errors }: SettingsFieldsProps) {
  // An error in the advanced section opens it, so the message is never hidden.
  const advancedError = ADVANCED.some(key => errors[`settings.${key}`]);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const showAdvanced = advancedOpen || advancedError;

  const set = (key: SettingKey, value: number) => onChange({ ...settings, [key]: value });

  function sliderField(key: SettingKey) {
    const limit = SETTINGS_LIMITS[key];
    const id = `setting-${key}`;
    const error = errors[`settings.${key}`];
    return (
      <div className="flex flex-col gap-2" key={key}>
        <div className="flex items-center justify-between">
          <Label id={`${id}-label`}>{LABELS[key].label}</Label>
          <output className="text-sm tabular-nums" htmlFor={id} data-testid={`${id}-value`}>
            {Number.isFinite(settings[key]) ? settings[key].toFixed(2) : "–"}
          </output>
        </div>
        <Slider
          id={id}
          aria-labelledby={`${id}-label`}
          min={limit.min}
          max={limit.max}
          step={limit.step}
          value={[Number.isFinite(settings[key]) ? settings[key] : limit.min]}
          onValueChange={value => set(key, Array.isArray(value) ? (value[0] ?? limit.min) : (value as number))}
          {...errorProps(`${id}-error`, error)}
        />
        <p className="text-xs text-muted-foreground">{LABELS[key].hint}</p>
        <FieldError id={`${id}-error`} message={error} />
      </div>
    );
  }

  function numberField(key: SettingKey) {
    const limit = SETTINGS_LIMITS[key];
    const id = `setting-${key}`;
    const error = errors[`settings.${key}`];
    return (
      <div className="flex flex-col gap-1.5" key={key}>
        <Label htmlFor={id}>{LABELS[key].label}</Label>
        <Input
          id={id}
          type="number"
          inputMode="numeric"
          min={limit.min}
          max={limit.max}
          step={limit.step}
          value={Number.isFinite(settings[key]) ? settings[key] : ""}
          // An emptied input is NaN, which the checks report as a missing value.
          onChange={event => set(key, event.target.valueAsNumber)}
          {...errorProps(`${id}-error`, error)}
        />
        <p className="text-xs text-muted-foreground">
          {LABELS[key].hint} ({limit.min}–{limit.max})
        </p>
        <FieldError id={`${id}-error`} message={error} />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5" data-testid="settings-fields">
      <div className="grid gap-5 sm:grid-cols-2">
        {sliderField("temperature")}
        {sliderField("topP")}
        {numberField("maxTokens")}
        {numberField("contextWindowSize")}
      </div>
      <FieldError id="settings-error" message={errors.settings} />
      <div className="flex flex-col gap-3">
        <div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            aria-expanded={showAdvanced}
            aria-controls="settings-advanced"
            onClick={() => setAdvancedOpen(!showAdvanced)}
          >
            {showAdvanced ? <ChevronDown /> : <ChevronRight />} Advanced
          </Button>
        </div>
        {showAdvanced && (
          <div id="settings-advanced" className="grid gap-5 sm:grid-cols-2">
            {ADVANCED.map(key => sliderField(key))}
          </div>
        )}
      </div>
    </div>
  );
}
