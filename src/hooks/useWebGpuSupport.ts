import { useEffect, useState } from "react";

export type WebGpuSupport = "checking" | "supported" | "unsupported";

// Only the part of the WebGPU API this check needs: the DOM typings do not include WebGPU yet.
interface WebGpuNavigator {
  gpu?: { requestAdapter: () => Promise<unknown> };
}

/** True when the browser exposes WebGPU **and** gives an adapter (the API can exist with no usable GPU behind it). */
export async function detectWebGpu(nav: WebGpuNavigator): Promise<boolean> {
  if (!nav.gpu) return false;
  try {
    return (await nav.gpu.requestAdapter()) != null;
  } catch {
    return false;
  }
}

// Asked once per page load: the answer cannot change while the page is open, and requestAdapter() is not free.
let detection: Promise<boolean> | null = null;

export function useWebGpuSupport(): WebGpuSupport {
  const [support, setSupport] = useState<WebGpuSupport>("checking");

  useEffect(() => {
    let active = true;
    detection ??= detectWebGpu(navigator as WebGpuNavigator);
    detection.then(supported => {
      if (active) setSupport(supported ? "supported" : "unsupported");
    });
    return () => {
      active = false;
    };
  }, []);

  return support;
}
