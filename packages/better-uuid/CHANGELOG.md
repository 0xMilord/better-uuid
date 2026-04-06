## 0.0.7 (2026-04-06)

- Fix CI

## 0.0.6 (2026-04-06)

- Update codemod

## 0.0.5 (2026-04-06)

- The published dist/index.js had extensionless ESM imports, e.g. from "./errors". Node’s ESM loader does not add .js for you, so resolution failed with ERR_MODULE_NOT_FOUND (Bundlers often do, which is why module: "Preserve" + moduleResolution: "bundler" hid the issue.) FIX: tsconfig.build.json — set "module": "NodeNext" and "moduleResolution": "NodeNext" so the emit matches Node ESM rules. All relative imports in src/ — use .js specifiers (e.g. ./errors.js, ./engine/wasm-loader.js). TypeScript still type-checks against the .ts files.

## 0.0.4 (2026-04-06)

- Update Docs and OSSDocs

## 0.0.3 (2026-04-06)

- docs: update release documentation and PowerShell script for clarity and usage instructions

## 0.0.2 (2026-04-06)

- feat: implement core UUID generation and parsing logic with WASM and JS engine support

## 0.0.1 (2026-04-06)

- feat: implement core UUID generation and parsing logic with WASM and JS engine support

# Changelog

## 0.1.0 (2026-04-06)

- Phase 0 + 1 complete: Rust core with UUID v4 + v7 strategies
- Full roundtrip parse: generate → format → parse → verify
- 39 Rust tests + 23 TypeScript tests passing
- 10,000 golden fixtures generated
- Collision model documented (`docs/collision-model.md`)
- Clock regression detection and fallback (to UUID v4)
- Sequence exhaustion detection
- Static docs site (Eleventy → GitHub Pages)
- Release scripts (`pnpm release`, `pnpm release:dry-run`)
- GitHub Actions: CI, Release, Docs deploy
