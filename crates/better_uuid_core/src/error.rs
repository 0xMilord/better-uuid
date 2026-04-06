//! Error types for better-uuid.
//!
//! All errors are typed and structured — no stringly-typed exceptions.
//! Every error carries enough context for actionable debugging.

use thiserror::Error;

// ---------------------------------------------------------------------------
// Base error type
// ---------------------------------------------------------------------------

/// Top-level error for better-uuid operations.
#[derive(Debug, Error)]
pub enum BetterUuidError {
    /// Failed to generate an ID.
    #[error("generate failed: {0}")]
    Generate(#[from] GenerateError),

    /// Failed to parse an ID string.
    #[error("parse failed: {0}")]
    Parse(#[from] ParseError),
}

// ---------------------------------------------------------------------------
// Generation errors
// ---------------------------------------------------------------------------

/// Generation failure with strategy-specific context.
#[derive(Debug, Error)]
pub enum GenerateError {
    /// OS clock moved backward compared to the last-issued timestamp.
    ///
    /// Only applies to snowflake-class strategies. The caller should
    /// honour the configured [`ClockRegressionPolicy`].
    #[error("clock regression detected: last_ts={last_ts}, now={now}")]
    ClockRegressed {
        /// Last-issued timestamp (ms since epoch).
        last_ts: u64,
        /// Current system time (ms since epoch).
        now: u64,
    },

    /// More IDs were requested within one millisecond than sequence bits allow.
    ///
    /// Never reuses a `(time, node, seq)` tuple.
    #[error("sequence exhausted for node={node} at timestamp={timestamp}")]
    SequenceExhausted {
        /// Node identifier.
        node: u16,
        /// Timestamp (ms) where the overflow occurred.
        timestamp: u64,
    },

    /// WebAssembly runtime unavailable (only when WASM is the primary engine).
    #[error("WASM runtime unavailable: {reason}")]
    WasmUnavailable {
        /// Human-readable reason (CSP policy, missing binary, etc.).
        reason: String,
    },

    /// Invalid prefix supplied to generation options.
    #[error("invalid prefix: {prefix} — {reason}")]
    InvalidPrefix {
        /// The rejected prefix.
        prefix: String,
        /// Why it was rejected.
        reason: String,
    },

    /// Entropy source failure (extremely rare — indicates OS-level CSPRNG failure).
    #[error("entropy source failed: {0}")]
    EntropyFailure(String),
}

// ---------------------------------------------------------------------------
// Parse errors
// ---------------------------------------------------------------------------

/// Parse failure with position and snippet context.
#[derive(Debug, Error)]
pub enum ParseError {
    /// Input does not match any known ID format (native or legacy).
    #[error("invalid format at position {position}: \"{snippet}\"")]
    InvalidFormat {
        /// Byte offset where the format diverged from expectations.
        position: usize,
        /// Short safe snippet of the input (max 20 chars).
        snippet: String,
    },

    /// Prefix violates the canonical charset/length/reserved rules.
    #[error("invalid prefix \"{prefix}\": {reason}")]
    InvalidPrefix {
        /// The rejected prefix.
        prefix: String,
        /// Why it was rejected.
        reason: String,
    },

    /// Wire-format schema version is newer than this library supports.
    #[error("unsupported strategy schema version: got {got}, max supported is {max}")]
    UnsupportedStrategyVersion {
        /// Schema version found in the payload.
        got: u8,
        /// Maximum schema version this library can decode.
        max: u8,
    },

    /// Checksum present but does not match payload.
    #[error("checksum mismatch")]
    ChecksumMismatch,

    /// Input was valid-looking but used a strategy that is disabled
    /// or not compiled into this build.
    #[error("strategy not available in this build: strategy_id={strategy_id}")]
    StrategyNotAvailable {
        /// Strategy identifier from the wire format.
        strategy_id: u8,
    },
}

impl ParseError {
    /// Create a safe snippet from the input for error reporting.
    /// Truncates to 20 characters and escapes non-printable bytes.
    #[must_use]
    pub fn safe_snippet(input: &str, position: usize) -> String {
        let safe: String = input
            .chars()
            .take(20)
            .map(|c| {
                if c.is_ascii_graphic() || c == ' ' {
                    c
                } else {
                    '?'
                }
            })
            .collect();
        format!("{safe} (pos {position})")
    }
}
