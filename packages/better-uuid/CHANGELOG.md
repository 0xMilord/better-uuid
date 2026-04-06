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
