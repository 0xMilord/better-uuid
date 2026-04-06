---
title: withIdContext() — API Reference
layout: layout.njk
---

# withIdContext()

Run a function with request-scoped ID context. Middleware sets context once; handlers inherit it.

## Signature

```ts
function withIdContext<T>(ctx: IdContext, fn: () => T): T;
```

## Type

```ts
type IdContext = Record<string, string | undefined>;
```

## Example

```ts
// Express middleware
app.use((req, res, next) => {
  withIdContext({
    requestId: req.headers["x-request-id"],
    sessionId: req.cookies.sessionId,
  }, next);
});

// Handler — context is inherited
app.post("/users", (req, res) => {
  const userId = createId({ prefix: "usr" });
  // requestId and sessionId flow through automatically (Phase 2+)
});
```

## Runtime support

- **Node.js:** Uses `AsyncLocalStorage` for true async context propagation.
- **Edge/Cloudflare Workers:** Pass-through (context available via module state).
- **Browser:** Pass-through.
