import { HardDriveDownload, Laptop } from "lucide-react";

import { errorProps } from "@/components/common/errorProps";
import { FieldError } from "@/components/common/FieldError";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useChatModels } from "@/hooks/useChatModels";
import { formatVram, type ChatModel } from "@/lib/llm/models";

interface ModelPickerProps {
  value: string;
  onChange: (modelId: string) => void;
  error?: string;
}

function ModelBadges({ model, cached }: { model: ChatModel; cached: boolean }) {
  return (
    <>
      <span className="text-xs text-muted-foreground">{formatVram(model.vramRequiredMB)}</span>
      {model.lowResourceRequired && (
        <Badge variant="secondary" title="Recommended for laptops: runs with little GPU memory">
          <Laptop /> Laptop
        </Badge>
      )}
      {cached && (
        <Badge variant="outline" data-testid="cached-badge" title="Already downloaded: loads without network">
          <HardDriveDownload /> Cached
        </Badge>
      )}
    </>
  );
}

// WebLLM's chat models, with the GPU memory each needs, laptop-friendly ones first, and whether it is downloaded.
export function ModelPicker({ value, onChange, error }: ModelPickerProps) {
  const catalogue = useChatModels();
  const errorId = "assistant-model-error";

  if (catalogue.status === "loading") {
    return (
      <div className="flex flex-col gap-1.5">
        <Label>Model</Label>
        <Skeleton className="h-8 w-full" aria-label="Loading the model list" />
        <FieldError id={errorId} message={error} />
      </div>
    );
  }

  const models = catalogue.status === "ready" ? catalogue.models : [];
  const cached = catalogue.status === "ready" ? catalogue.cached : new Set<string>();
  const recommended = models.filter(model => model.lowResourceRequired);
  const others = models.filter(model => !model.lowResourceRequired);
  // A stored model this WebLLM version does not list (or no list at all) must still show and stay selectable.
  const unknown = value && !models.some(model => model.id === value) ? value : null;
  const selected = models.find(model => model.id === value);

  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor="assistant-model">Model</Label>
      <Select value={value || null} onValueChange={next => next && onChange(next)}>
        <SelectTrigger id="assistant-model" className="w-full" {...errorProps(errorId, error)}>
          <SelectValue placeholder="Choose a model">{(id: string | null) => id ?? "Choose a model"}</SelectValue>
        </SelectTrigger>
        <SelectContent alignItemWithTrigger={false} className="max-h-96">
          {unknown && (
            <SelectGroup>
              <SelectLabel>Current</SelectLabel>
              <SelectItem value={unknown}>{unknown}</SelectItem>
            </SelectGroup>
          )}
          {[
            { label: "Recommended for laptops", items: recommended },
            { label: "Needs more GPU memory", items: others }
          ].map(group =>
            group.items.length === 0 ? null : (
              <SelectGroup key={group.label}>
                <SelectLabel>{group.label}</SelectLabel>
                {group.items.map(model => (
                  <SelectItem key={model.id} value={model.id}>
                    <span className="truncate">{model.id}</span>
                    <ModelBadges model={model} cached={cached.has(model.id)} />
                  </SelectItem>
                ))}
              </SelectGroup>
            )
          )}
        </SelectContent>
      </Select>
      {selected && (
        <div className="flex flex-wrap items-center gap-2" data-testid="selected-model-info">
          <ModelBadges model={selected} cached={cached.has(selected.id)} />
          {!cached.has(selected.id) && (
            <span className="text-xs text-muted-foreground">Downloaded the first time you chat with it.</span>
          )}
        </div>
      )}
      {catalogue.status === "error" && <p className="text-sm text-muted-foreground">{catalogue.message}</p>}
      <FieldError id={errorId} message={error} />
    </div>
  );
}
