import { Link } from "react-router";
import { Bot, Settings2 } from "lucide-react";

import { HeaderContent } from "@/components/layout/HeaderContent";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { Configuration } from "@/lib/types";

// The header of a chat: which assistant answers, on which model, and the way to change it.
export function AssistantHeader({ configuration }: { configuration: Pick<Configuration, "id" | "name" | "modelId"> }) {
  return (
    <HeaderContent>
      <Bot className="size-4 shrink-0 text-muted-foreground" />
      <span className="truncate text-sm font-medium" data-testid="header-assistant-name">
        {configuration.name}
      </span>
      <Badge
        variant="secondary"
        className="hidden max-w-64 truncate font-mono sm:inline-flex"
        data-testid="header-model-badge"
        title={configuration.modelId}
      >
        {configuration.modelId}
      </Badge>
      <Button
        variant="ghost"
        size="sm"
        className="ml-auto shrink-0"
        render={<Link to={`/assistants/${configuration.id}`} />}
      >
        <Settings2 /> <span className="hidden sm:inline">Edit assistant</span>
        <span className="sr-only sm:hidden">Edit assistant</span>
      </Button>
    </HeaderContent>
  );
}
