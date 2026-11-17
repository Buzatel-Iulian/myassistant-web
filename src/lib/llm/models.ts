import { listPrebuiltModels, type PrebuiltModel } from "@/lib/llm/engine";

// The models an assistant can use: WebLLM's prebuilt catalogue (read through engine.ts, the only WebLLM user)
// reduced to chat models. Embedding models cannot chat, and vision models (VLM) expect images the chat cannot send.

export type ChatModel = Omit<PrebuiltModel, "kind">;

export function toChatModels(models: readonly PrebuiltModel[]): ChatModel[] {
  return models
    .filter(model => model.kind === "llm")
    .map(({ id, vramRequiredMB, lowResourceRequired }) => ({
      id,
      vramRequiredMB,
      lowResourceRequired
    }));
}

/** The chat models, in WebLLM's order (grouped by family). Downloads the WebLLM module on first use. */
export async function loadChatModels(): Promise<ChatModel[]> {
  return toChatModels(await listPrebuiltModels());
}

/** "0.9 GB VRAM", "5.0 GB VRAM"; GPU memory is what decides whether a model runs on a machine. */
export function formatVram(megabytes: number | null): string {
  if (megabytes === null) return "VRAM unknown";
  return `${(megabytes / 1024).toFixed(1)} GB VRAM`;
}
