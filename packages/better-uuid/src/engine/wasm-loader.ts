// ---------------------------------------------------------------------------
// better-uuid — Engine initialization (WASM → JS fallback)
// ---------------------------------------------------------------------------

import type { JsEngine } from "./js-engine";
import { createJsEngine } from "./js-engine";

// WASM init module — dynamically imported
let wasmInit: Promise<unknown> | null = null;
let wasmModule: {
  generate_id: (opts: string) => string;
  parse_id_json: (id: string) => string;
  is_legacy_id_js: (id: string) => boolean;
  schema_version: () => number;
} | null = null;

// Lazy WASM init — tries to load, falls back to JS on failure
async function tryInitWasm(): Promise<boolean> {
  if (wasmModule) return true;
  if (wasmInit) {
    await wasmInit;
    return wasmModule !== null;
  }

  wasmInit = (async () => {
    try {
      // Dynamic import of WASM module (bundler target)
      const mod = await import("../../crates/better_uuid_wasm/pkg/better_uuid_wasm.js");
      if (typeof mod.default === "function") {
        await mod.default();
      }
      if (typeof mod.generate_id === "function") {
        wasmModule = {
          generate_id: mod.generate_id,
          parse_id_json: mod.parse_id_json,
          is_legacy_id_js: mod.is_legacy_id_js,
          schema_version: mod.schema_version,
        };
      }
    } catch {
      // WASM unavailable — will use JS fallback
      wasmModule = null;
    }
  })();

  await wasmInit;
  return wasmModule !== null;
}

// ---------------------------------------------------------------------------
// Engine interface — unified WASM or JS
// ---------------------------------------------------------------------------

export interface Engine {
  generate(opts: {
    strategy?: string;
    prefix?: string;
    mode?: string;
    count?: number;
  }): string | string[];
  parse(id: string): {
    legacy: boolean;
    prefix: string | undefined;
    strategy: string;
    schemaVersion: number | undefined;
    timestampMs: bigint | undefined;
    entropy: string;
    nodeId: number | undefined;
    region: string | undefined;
  };
  isLegacy(id: string): boolean;
  schemaVersion(): number;
  isWasm(): boolean;
}

let _engine: Engine | null = null;
let _useWasm: boolean | null = null;

export async function initEngine(): Promise<Engine> {
  if (_engine) return _engine;

  const wasmAvailable = await tryInitWasm();
  _useWasm = wasmAvailable;

  if (wasmAvailable && wasmModule) {
    _engine = createWasmEngine(wasmModule);
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

function createWasmEngine(wasm: typeof wasmModule & {}): Engine {
  return {
    generate(opts) {
      const json = JSON.stringify(opts);
      const result = wasm!.generate_id(json);
      // Could be single object or array (for count > 1)
      const parsed = JSON.parse(result);
      if (Array.isArray(parsed)) {
        return parsed.map((r: { id: string }) => r.id);
      }
      return (parsed as { id: string }).id;
    },
    parse(id: string) {
      const json = wasm!.parse_id_json(id);
      return JSON.parse(json);
    },
    isLegacy(id: string) {
      return wasm!.is_legacy_id_js(id);
    },
    schemaVersion() {
      return wasm!.schema_version();
    },
    isWasm() {
      return true;
    },
  };
}

export function isWasmAvailable(): boolean {
  return _useWasm === true;
}
