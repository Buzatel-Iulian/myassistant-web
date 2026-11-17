// WebLLM reports a model load in steps, each with its own 0–100 % (QA-8-2): it downloads the weight shards into the
// browser cache ("Fetching param cache[n/N]"), then copies them into GPU memory ("Loading model from cache[n/N]",
// starting again at 0 %), then compiles the GPU shaders. Naming the step explains why the bar starts over.
//
// QA-11-A-4: WebLLM reports the download only when a whole 32 MB shard is in the cache, and it fetches four shards at
// once, so its first report ("Fetching param cache[1/N]") comes after about 128 MB: on a slow connection the loader
// sat for most of the download on "Start to fetch params" at 0 %. No byte count is available before that (the
// shards are stored with Cache.add() inside the worker). So that wait is shown as what it is: an indeterminate bar,
// a readable sentence, the elapsed time and, once the manifest is cached, the size being downloaded. WebLLM's raw
// report texts are turned into readable lines.

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

const MB = 1024 * 1024;

/** The model's size in MB, from a report's "<n>MB fetched/loaded" and its fraction (WebLLM does not say the total). */
function totalMb(doneMb: number, value: number): number | null {
  return value > 0 ? Math.round(doneMb / value) : null;
}

/**
 * One readable line for WebLLM's report text, for example "95 MB of about 195 MB downloaded (piece 3 of 7)".
 * `sizeBytes` is the download size when known (from the cached manifest). Unknown texts are shown as they are.
 */
export function describeLoadText(text: string, value: number, sizeBytes: number | null = null): string {
  const knownMb = sizeBytes !== null ? Math.round(sizeBytes / MB) : null;
  const shard = /\[(\d+)\/(\d+)\]:\s*(\d+)\s*MB (fetched|loaded)/i.exec(text);
  if (shard) {
    const [, piece, pieces, done, verb] = shard;
    const total = knownMb ?? totalMb(Number(done), value);
    const of = total !== null ? ` of ${knownMb !== null ? "" : "about "}${total} MB` : "";
    return verb.toLowerCase() === "fetched"
      ? `${done} MB${of} downloaded (piece ${piece} of ${pieces})`
      : `${done} MB${of} copied into GPU memory (piece ${piece} of ${pieces})`;
  }
  const shaders = /shader modules\[(\d+)\/(\d+)\]/i.exec(text);
  if (shaders) return `Compiling GPU programs (${shaders[1]} of ${shaders[2]})`;
  if (/^Start to fetch params/i.test(text)) {
    return (
      (knownMb !== null ? `Downloading ${knownMb} MB. ` : "Downloading the model. ") +
      "The download is counted in 32 MB pieces, four at a time, so the first figures can take a while to appear."
    );
  }
  if (/^Finish loading/i.test(text)) return "Ready.";
  return text || "Starting the engine…";
}

/** "45 s", "2 min 05 s": how long the current load has been running. */
export function formatElapsed(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  if (s < 60) return `${s} s`;
  return `${Math.floor(s / 60)} min ${String(s % 60).padStart(2, "0")} s`;
}
