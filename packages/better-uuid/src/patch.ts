// ---------------------------------------------------------------------------
// better-uuid/patch — Monkey-patch crypto.randomUUID
//
// WARNING: This module has SIDE EFFECTS. It replaces the global
// crypto.randomUUID implementation for ALL callers in the process,
// including transitive dependencies.
//
// ONLY use in applications you control. NEVER in shared libraries.
// Requires BETTER_UUID_PATCH=1 environment variable as a kill-switch.
//
// See ARCHITECTURE.md §9.1 for full risk documentation.
// ---------------------------------------------------------------------------

import { createId } from "./index";

function isPatchEnabled(): boolean {
  // Check for BETTER_UUID_PATCH=1 in Node.js environments
  if (typeof process !== "undefined" && "env" in process) {
    // biome-ignore lint/suspicious/noExplicitAny: process.env type
    const env = (process as any).env as Record<string, string | undefined>;
    return env.BETTER_UUID_PATCH === "1";
  }
  // In browser/edge, default to disabled — no env vars available.
  return false;
}

if (isPatchEnabled()) {
  // biome-ignore lint/suspicious/noExplicitAny: overriding standard API
  (globalThis.crypto as any).randomUUID = (): string => {
    // Route through better-uuid with UUID v4 shape
    return createId({ strategy: "uuidv4", mode: "safe" });
  };

  // Log exactly once at startup (trace-level equivalent via console.warn)
  const loggedKey = "__better_uuid_patch_logged__";
  // biome-ignore lint/suspicious/noExplicitAny: globalThis extension
  const global = globalThis as Record<string, unknown>;
  if (!global[loggedKey]) {
    console.warn(
      "[better-uuid/patch] crypto.randomUUID is now routed through better-uuid. " +
        "All callers in this process (including dependencies) will receive better-uuid IDs. " +
        "Set BETTER_UUID_PATCH=0 to disable.",
    );
    global[loggedKey] = true;
  }
}
