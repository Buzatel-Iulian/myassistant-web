// Pure helpers for the model cache (Settings → Model cache). engine.ts does the reading and deleting; these only
// know WebLLM's cache layout, so they can be tested without a browser.

/**
 * The folder a model's files are cached under, as WebLLM builds it (`cleanModelUrl`, not exported by WebLLM):
 * `https://huggingface.co/mlc-ai/X` → `https://huggingface.co/mlc-ai/X/resolve/main/`.
 */
export function modelBaseUrl(modelUrl: string): string {
  let url = modelUrl.endsWith("/") ? modelUrl : `${modelUrl}/`;
  if (!/.+\/resolve\/.+\//.test(url)) url += "resolve/main/";
  return new URL(url).href;
}

/** The URL of the weights manifest (`tensor-cache.json`), which lists every shard with its size in bytes. */
export function weightsManifestUrl(modelUrl: string): string {
  return new URL("tensor-cache.json", modelBaseUrl(modelUrl)).href;
}

/**
 * The size of the model's weights: the sum of the shards' `nbytes` in its manifest. WebLLM has no size API, and the
 * manifest is already in the cache next to the shards, so this reads a few kB instead of gigabytes. Null when the
 * manifest does not have the expected shape.
 */
export function weightsBytes(manifest: unknown): number | null {
  if (typeof manifest !== "object" || manifest === null) return null;
  const records = (manifest as { records?: unknown }).records;
  if (!Array.isArray(records) || records.length === 0) return null;
  let total = 0;
  for (const record of records) {
    const nbytes = (record as { nbytes?: unknown } | null)?.nbytes;
    if (typeof nbytes !== "number" || !Number.isFinite(nbytes) || nbytes < 0) return null;
    total += nbytes;
  }
  return total;
}

/** "312 MB", "1.6 GB": disk sizes for people, in powers of 1024 like the VRAM labels. */
export function formatBytes(bytes: number | null): string {
  if (bytes === null) return "size unknown";
  const mb = bytes / (1024 * 1024);
  if (mb < 1) return `${Math.max(1, Math.round(bytes / 1024))} kB`;
  if (mb < 1024) return `${Math.round(mb)} MB`;
  return `${(mb / 1024).toFixed(1)} GB`;
}
