---
name: Bug Report
description: Report a runtime error, incorrect output, or regression
title: "bug: "
labels: ["bug", "needs-triage"]
body:
  - type: markdown
    attributes:
      value: |
        Thanks for reporting. Fill out as much as you can — a reproducible bug gets fixed faster.

  - type: dropdown
    id: runtime
    attributes:
      label: Runtime
      description: Where did the bug occur?
      options:
        - Node.js
        - Browser
        - Edge (Vercel/Cloudflare)
        - WASM layer
        - Rust core
    validations:
      required: true

  - type: input
    id: version
    attributes:
      label: Version
      description: Package version or commit SHA
      placeholder: "v0.0.0 or abc1234"
    validations:
      required: true

  - type: input
    id: node-version
    attributes:
      label: Node.js version (if applicable)
      placeholder: "22.x"

  - type: textarea
    id: repro
    attributes:
      label: Minimal reproduction
      description: Code snippet or steps to reproduce
      placeholder: |
        ```ts
        import { createId, parseId } from "better-uuid";
        // ...
        ```
    validations:
      required: true

  - type: textarea
    id: expected
    attributes:
      label: Expected behavior
      placeholder: What should have happened?
    validations:
      required: true

  - type: textarea
    id: actual
    attributes:
      label: Actual behavior
      placeholder: What actually happened? Include error messages and stack traces.
    validations:
      required: true

  - type: textarea
    id: context
    attributes:
      label: Additional context
      description: Environment details, bundler config, relevant flags
