#!/usr/bin/env node
// ---------------------------------------------------------------------------
// better-uuid — Benchmark script
//
// Compares createId() performance against crypto.randomUUID() and the
// `uuid` package (if available).
//
// Usage: node scripts/ci-bench.mjs [--iterations 1000000]
// ---------------------------------------------------------------------------

import { createId, parseId } from "../packages/better-uuid/src/index.js";

const ITERATIONS = Number.parseInt(process.argv[3] ?? "1000000", 10) || 1_000_000;

// Warmup
for (let i = 0; i < 10_000; i++) {
  createId();
}

// ---------------------------------------------------------------------------
// Helper: measure ops/sec
// ---------------------------------------------------------------------------

function benchmark(name, fn, iterations = ITERATIONS) {
  const start = process.hrtime.bigint();
  for (let i = 0; i < iterations; i++) {
    fn();
  }
  const end = process.hrtime.bigint();
  const elapsedMs = Number(end - start) / 1e6;
  const opsPerSec = (iterations / elapsedMs) * 1000;
  const nsPerOp = (elapsedMs / iterations) * 1e6;

  console.log(`${name}:`);
  console.log(`  ${iterations.toLocaleString()} iterations in ${elapsedMs.toFixed(2)}ms`);
  console.log(`  ${opsPerSec.toLocaleString(undefined, { maximumFractionDigits: 0 })} ops/sec`);
  console.log(`  ${nsPerOp.toFixed(1)} ns/op`);
  console.log("");

  return { name, opsPerSec, nsPerOp, elapsedMs };
}

// ---------------------------------------------------------------------------
// Benchmarks
// ---------------------------------------------------------------------------

console.log(`═══ better-uuid benchmark (${ITERATIONS.toLocaleString()} iterations) ═══`);
console.log(`Node.js: ${process.version}`);
console.log(`Platform: ${process.platform} ${process.arch}`);
console.log("");

// better-uuid
const v4Result = benchmark("better-uuid uuidv4", () => {
  createId({ strategy: "uuidv4" });
});

const timeResult = benchmark("better-uuid time", () => {
  createId({ strategy: "time" });
});

const prefixResult = benchmark("better-uuid time + prefix", () => {
  createId({ strategy: "time", prefix: "usr" });
});

const parseResult = benchmark("better-uuid parseId", () => {
  parseId("usr_550e8400-e29b-41d4-a716-446655440000");
});

// crypto.randomUUID()
const randomUUIDResult = benchmark("crypto.randomUUID", () => {
  crypto.randomUUID();
});

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

console.log("═══ Summary ═══");
console.log("");
console.log(`crypto.randomUUID(): ${randomUUIDResult.nsPerOp.toFixed(1)} ns/op`);
console.log(`better-uuid uuidv4:  ${v4Result.nsPerOp.toFixed(1)} ns/op (${((v4Result.nsPerOp / randomUUIDResult.nsPerOp) * 100).toFixed(0)}% of native)`);
console.log(`better-uuid time:    ${timeResult.nsPerOp.toFixed(1)} ns/op (${((timeResult.nsPerOp / randomUUIDResult.nsPerOp) * 100).toFixed(0)}% of native)`);
console.log(`better-uuid parse:   ${parseResult.nsPerOp.toFixed(1)} ns/op`);
