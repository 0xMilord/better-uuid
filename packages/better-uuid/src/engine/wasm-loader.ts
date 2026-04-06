// ---------------------------------------------------------------------------
// better-uuid — Engine initialization (WASM → JS fallback)
// ---------------------------------------------------------------------------

import { createJsEngine, type JsEngine } from "./js-engine.js";

// WASM module reference (lazy)
let wasmModule: JsEngine | null = null;
let wasmInitPromise: Promise<void> | null = null;

// Lazy WASM init — tries to load, falls back to JS on failure
async function tryInitWasm(): Promise<boolean> {
  if (wasmModule) return true;
  if (wasmInitPromise) {
    await wasmInitPromise;
    return wasmModule !== null;
  }

  wasmInitPromise = (async () => {
    try {
      // Dynamic import of WASM module (bundler target)
      // biome-ignore lint/suspicious/noExplicitAny: WASM module types vary by bundler
      const mod = await import("../../crates/better_uuid_wasm/pkg/better_uuid_wasm.js") as any;
      if (typeof mod.default === "function") {
        await mod.default();
      }
      if (typeof mod.generate_id === "function") {
        wasmModule = createWasmEngineFromBindings(mod);
      }
    } catch {
      // WASM unavailable — will use JS fallback
      wasmModule = null;
    }
  })();

  await wasmInitPromise;
  return wasmModule !== null;
}

// ---------------------------------------------------------------------------
// Engine interface — unified WASM or JS
// ---------------------------------------------------------------------------

export interface Engine extends JsEngine {}

let _engine: Engine | null = null;
let _useWasm: boolean | null = null;

export async function initEngine(): Promise<Engine> {
  if (_engine) return _engine;

  const wasmAvailable = await tryInitWasm();
  _useWasm = wasmAvailable;

  if (wasmAvailable && wasmModule) {
    _engine = wasmModule;
  } else {
    _engine = createJsEngine();
  }

  return _engine;
}

export function getEngineSync(): Engine {
  if (_engine) return _engine;
  // Synchronous fallback — use JS engine immediately
  _useWasm = false;
  _engine = createJsEngine();
  return _engine;
}

// biome-ignore lint/suspicious/noExplicitAny: WASM bindings are dynamic
function createWasmEngineFromBindings(mod: any): JsEngine {
  return {
    generate(opts) {
      const json = JSON.stringify(opts);
      const result = mod.generate_id(json) as string;
      const parsed = JSON.parse(result);
      if (Array.isArray(parsed)) {
        return parsed.map((r: { id: string }) => r.id);
      }
      return (parsed as { id: string }).id;
    },
    parse(id: string) {
      const json = mod.parse_id_json(id) as string;
      return JSON.parse(json);
    },
    isLegacy(id: string) {
      return mod.is_legacy_id_js(id) as boolean;
    },
    schemaVersion() {
      return mod.schema_version() as number;
    },
    isWasm() {
      return true;
    },
  };
}

export function isWasmAvailable(): boolean {
  return _useWasm === true;
}
