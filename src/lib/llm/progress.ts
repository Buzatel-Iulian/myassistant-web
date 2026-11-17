// WebLLM reports a model load in steps, each with its own 0–100 % (QA-8-2): it downloads the weight shards into the
// browser cache ("Fetching param cache[n/N]"), then copies them into GPU memory ("Loading model from cache[n/N]",
// starting again at 0 %), then compiles the GPU shaders. Before the first shard arrives it says "Start to fetch
// params" at 0 % for as long as that 32 MB shard takes. Naming the step explains why the bar starts over, and an
// indeterminate bar at that first 0 % shows that something is happening.

export type LoadStage = "starting" | "downloading" | "loading" | "shaders" | "done";

export function loadStage(text: string): LoadStage {
  if (/^Fetching param cache/i.test(text)) return "downloading";
  if (/^Loading model from cache/i.test(text)) return "loading";
  if (/shader/i.test(text)) return "shaders";
  if (/^Finish loading/i.test(text)) return "done";
  return "starting";
}

export const STAGE_LABELS: Record<LoadStage, string> = {
  starting: "Fetching the model files",
  downloading: "Downloading the model (first time only)",
  loading: "Loading the model into GPU memory",
  shaders: "Preparing the GPU",
  done: "Ready"
};

/** Whether the bar should show activity instead of a percentage: nothing measurable has happened yet. */
export function isIndeterminate(stage: LoadStage, value: number): boolean {
  return value <= 0 && (stage === "starting" || stage === "downloading");
}
