// ---------------------------------------------------------------------------
// better-uuid/compat — Opinionated default
//
// Smart default: time-ordered, future-proof.
// ```ts
// import { id } from "better-uuid/compat";
// const newId = id();
// ```
// ---------------------------------------------------------------------------

import { createId } from "../index";

/**
 * Opinionated default ID generation.
 *
 * Time-ordered strategy with no prefix — the safest starting point for
 * teams migrating from `uuid`/`nanoid` who want sortable IDs immediately.
 */
export function id(): string {
  return createId({ strategy: "time" });
}

export { id as default };
