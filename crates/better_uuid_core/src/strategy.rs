//! Strategy trait and generation context.
//!
//! All ID strategies implement [`IdStrategy`]. The trait is designed to be
//! implementable in Rust for the core crate and callable from WASM / JS
//! without exposing internal bit layouts directly.

use crate::error::GenerateError;

// ---------------------------------------------------------------------------
// Policies (map to PRD §7.1)
// ---------------------------------------------------------------------------

/// Behavior when the system clock moves backward compared to the last-issued
/// timestamp in a snowflake-class strategy.
///
/// Passed from TypeScript as a `u8` enum; documented here for clarity.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
#[repr(u8)]
pub enum ClockRegressionPolicy {
    /// Block generation until `now >= last_timestamp`.
    /// Has a configurable timeout cap to prevent indefinite blocking.
    Wait = 0,
    /// Fail immediately with [`GenerateError::ClockRegressed`].
    Error = 1,
    /// Emit an alternate strategy (e.g. UUID v4) and log a warning.
    Fallback = 2,
}

impl From<u8> for ClockRegressionPolicy {
    fn from(v: u8) -> Self {
        match v {
            0 => Self::Wait,
            2 => Self::Fallback,
            _ => Self::Error, // 1 = Error, 3+ = unknown → default: fail closed
        }
    }
}

/// Behavior when the per-millisecond sequence counter overflows.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
#[repr(u8)]
pub enum SequenceExhaustedPolicy {
    /// Block until the next millisecond.
    Wait = 0,
    /// Fail immediately with [`GenerateError::SequenceExhausted`].
    Error = 1,
}

impl From<u8> for SequenceExhaustedPolicy {
    fn from(v: u8) -> Self {
        match v {
            0 => Self::Wait,
            _ => Self::Error, // 1 = Error, 2+ = unknown → fail closed
        }
    }
}

// ---------------------------------------------------------------------------
// Random source abstraction
// ---------------------------------------------------------------------------

/// Abstraction over entropy sources.
///
/// The production implementation uses `getrandom`. Test implementations can
/// supply deterministic bytes for golden-master testing.
pub trait RandomSource {
    /// Fill the buffer with cryptographically random bytes.
    fn fill_bytes(&mut self, buf: &mut [u8]);
}

/// Production random source backed by `getrandom`.
pub struct OsRandom;

impl RandomSource for OsRandom {
    fn fill_bytes(&mut self, buf: &mut [u8]) {
        getrandom::fill(buf).expect("getrandom: OS entropy source failed");
    }
}

// ---------------------------------------------------------------------------
// Generation context
// ---------------------------------------------------------------------------

/// Node descriptor for distributed/snowflake strategies.
#[derive(Debug, Clone)]
pub struct NodeDescriptor {
    /// Unique node identifier (0–1023 for a 10-bit node space).
    pub node_id: u16,
    /// Region slug (e.g. "in-west", "us-east"). Used for collision avoidance.
    pub region: String,
}

/// Context passed to [`IdStrategy::generate`].
///
/// Contains everything a strategy needs to produce an ID: time, entropy,
/// configuration, and failure policies.
pub struct GenContext<'a> {
    /// Semantic prefix (e.g. "usr", "ord"). Validated before reaching here.
    pub prefix: Option<&'a str>,
    /// Current time in milliseconds since Unix epoch.
    pub now_ms: u64,
    /// Entropy source. Production: `OsRandom`. Tests: deterministic.
    pub random: &'a mut dyn RandomSource,
    /// Node/region identity for distributed strategies.
    pub node: Option<NodeDescriptor>,
    /// Canonical input for deterministic hashing (e.g. NFC-normalized email).
    pub deterministic_input: Option<&'a [u8]>,
    /// Application-level salt for deterministic mode (prevents rainbow tables).
    pub salt: Option<&'a [u8]>,
    /// Snowflake: behavior on clock regression.
    pub on_clock_regression: ClockRegressionPolicy,
    /// Snowflake: behavior on sequence overflow.
    pub on_sequence_exhausted: SequenceExhaustedPolicy,
}

// ---------------------------------------------------------------------------
// Generated payload
// ---------------------------------------------------------------------------

/// The raw output of an ID strategy before encoding.
///
/// This struct is the canonical in-memory representation. It is encoded to a
/// string by the `encode` module and decoded back by the `parse` module.
#[derive(Debug, Clone)]
pub struct IdPayload {
    /// Wire-format schema version (see `SCHEMA_VERSION`).
    pub schema_version: u8,
    /// Which strategy produced this payload.
    pub strategy: u8,
    /// Semantic prefix, if any.
    pub prefix: Option<String>,
    /// Raw bytes of the payload (strategy-specific layout).
    pub bytes: Vec<u8>,
}

// ---------------------------------------------------------------------------
// Strategy trait
// ---------------------------------------------------------------------------

/// The core trait for all ID generation strategies.
///
/// Implementations must:
/// 1. Set a unique `STRATEGY_ID` byte (see `StrategyId` in `lib.rs`).
/// 2. Produce bytes in a documented, fixed layout.
/// 3. Use CSPRNG for any random components.
pub trait IdStrategy {
    /// Unique identifier for this strategy in the wire format.
    const STRATEGY_ID: u8;

    /// Generate a new ID payload from the given context.
    ///
    /// # Errors
    ///
    /// Returns [`GenerateError`] when generation fails due to clock regression,
    /// sequence exhaustion, invalid prefix, or entropy source failure.
    fn generate(&self, ctx: &mut GenContext<'_>) -> Result<IdPayload, GenerateError>;
}
