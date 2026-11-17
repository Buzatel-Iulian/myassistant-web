import { Link } from "react-router";
import { Bot, Cpu, PowerOff, RotateCw, Settings2 } from "lucide-react";

import type { ModelView } from "@/components/chat/loadPlan";
import { HeaderContent } from "@/components/layout/HeaderContent";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import type { Configuration } from "@/lib/types";

/** The model controls of the chat header (Phase 12). */
export interface HeaderModel {
  view: ModelView;
  /** How many models are in GPU memory (or loading), this one included. */
  residentCount: number;
  /** Reload is refused while this chat's answer streams: the load would wait for it anyway, behind a frozen loader. */
  answering: boolean;
  onReload: () => void;
  onUnload: () => void;
}

const STATUS: Record<ModelView, { label: string; dot: string }> = {
  ready: { label: "Loaded", dot: "bg-emerald-500" },
  loading: { label: "Loading", dot: "bg-amber-500 animate-pulse" },
  confirm: { label: "Not loaded", dot: "bg-muted-foreground/50" },
  error: { label: "Not loaded", dot: "bg-destructive" }
};

function ModelMenu({ model }: { model: HeaderModel }) {
  const status = STATUS[model.view];
  const others = model.residentCount - (model.view === "ready" || model.view === "loading" ? 1 : 0);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={<Button variant="ghost" size="sm" className="shrink-0" data-testid="model-menu" />}
        aria-label={`Model: ${status.label}. Model actions`}
      >
        <span className={cn("size-2 rounded-full", status.dot)} aria-hidden />
        <span data-testid="model-status" data-view={model.view}>
          {status.label}
        </span>
        {model.residentCount > 0 && (
          <span className="hidden text-muted-foreground md:inline" data-testid="resident-count">
            · {model.residentCount} in memory
          </span>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuGroup>
          <DropdownMenuLabel>
            <Cpu className="mr-1 inline size-3" aria-hidden />
            {model.residentCount === 0
              ? "No model in GPU memory"
              : `${model.residentCount} ${model.residentCount === 1 ? "model" : "models"} in GPU memory` +
                (others > 0 ? ` (${others} for other assistants)` : "")}
          </DropdownMenuLabel>
          <DropdownMenuItem disabled={model.view !== "ready" || model.answering} onClick={model.onReload}>
            <RotateCw /> Reload model
          </DropdownMenuItem>
          <DropdownMenuItem
            variant="destructive"
            disabled={model.view !== "ready" && model.view !== "loading"}
            onClick={model.onUnload}
          >
            <PowerOff /> Unload model
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// The header of a chat: which assistant answers, on which model, whether that model is in GPU memory, and the ways
// to change it.
export function AssistantHeader({
  configuration,
  model
}: {
  configuration: Pick<Configuration, "id" | "name" | "modelId">;
  model?: HeaderModel;
}) {
  return (
    <HeaderContent>
      <Bot className="size-4 shrink-0 text-muted-foreground" />
      <span className="truncate text-sm font-medium" data-testid="header-assistant-name">
        {configuration.name}
      </span>
      <Badge
        variant="secondary"
        // The text sits in its own span: in the badge's centred flex box a long id was clipped on both sides instead
        // of ending with an ellipsis.
        className="hidden max-w-80 justify-start font-mono sm:inline-flex"
        data-testid="header-model-badge"
        title={configuration.modelId}
      >
        <span className="truncate">{configuration.modelId}</span>
      </Badge>
      <div className="ml-auto flex shrink-0 items-center gap-1">
        {model && <ModelMenu model={model} />}
        <Button variant="ghost" size="sm" className="shrink-0" render={<Link to={`/assistants/${configuration.id}`} />}>
          <Settings2 /> <span className="hidden sm:inline">Edit assistant</span>
          <span className="sr-only sm:hidden">Edit assistant</span>
        </Button>
      </div>
    </HeaderContent>
  );
}
