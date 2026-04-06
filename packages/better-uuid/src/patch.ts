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

import { createId } from "../index";

const PATCH_ENV = "BETTER_UUID_PATCH";

function isPatchEnabled(): boolean {
  if (typeof process !== "undefined" && process.env) {
    return process.env[PATCH_ENV] === "1";
  }
  // In browser/edge, default to disabled — no env vars available.
  return false;
}

if (!isPatchEnabled()) {
  // Silently no-op if not explicitly enabled.
  // We do NOT throw — the import might happen in a shared dependency
  // and we don't want to crash the process.
  export {};
} else {
  const originalRandomUUID = globalThis.crypto.randomUUID.bind(globalThis.crypto);

  globalThis.crypto.randomUUID = (): string => {
    // Route through better-uuid with UUID v4 shape
    return createId({ strategy: "uuidv4", mode: "safe" });
  };

  // Log exactly once at startup (trace-level equivalent via console.trace)
  // Using a module-level flag to prevent duplicate logs in hot-reload scenarios
  const loggedSymbol = Symbol.for("better-uuid.patch.logged");
  if (!(globalThis as Record<symbol, boolean>)[loggedSymbol]) {
    // biome-ignore lint/suspicious/noConsole: intentional side-effect logging
    console.warn(
      "[better-uuid/patch] crypto.randomUUID is now routed through better-uuid. " +
        "All callers in this process (including dependencies) will receive better-uuid IDs. " +
        "Set BETTER_UUID_PATCH=0 to disable.",
    );
    (globalThis as Record<symbol, boolean>)[loggedSymbol] = true;
  }
}
