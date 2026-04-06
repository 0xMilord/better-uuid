//! better-uuid core — structured, inspectable identifiers.
//!
//! This crate provides the canonical implementation of ID generation,
//! encoding, parsing, and validation. It is the single source of truth
//! for bit layouts, alphabets, and strategy definitions.
//!
//! # Design principles
//!
//! 1. **No `unsafe`** unless gated behind explicit feature flags.
//! 2. **CSPRNG only** for random strategies — `getrandom` crate, never `Math.random`.
//! 3. **Forward-compatible wire format** — every payload carries a `schema_version` byte.
//! 4. **Fail closed** — typed errors, never silent degradation.

#![forbid(unsafe_code)]
#![warn(
    clippy::all,
    clippy::pedantic,
    missing_docs,
    rust_2018_idioms,
    unused_qualifications
)]

// ---------------------------------------------------------------------------
// Public surface
// ---------------------------------------------------------------------------

pub mod encode;
pub mod error;
pub mod layout;
pub mod parse;
pub mod strategies;
pub mod strategy;

// Re-export top-level types for ergonomic imports
pub use error::{BetterUuidError, GenerateError, ParseError};
pub use layout::{NativeIdComponents, format_native_id, parse_native_id};
pub use parse::{ParsedId, parse_id};
pub use strategies::{RandomV4, TimeOrdered};
pub use strategy::{
    ClockRegressionPolicy, GenContext, IdPayload, IdStrategy, NodeDescriptor, OsRandom,
    RandomSource, SequenceExhaustedPolicy,
};

// ---------------------------------------------------------------------------
// Schema version — frozen until a breaking wire-format change
// ---------------------------------------------------------------------------

/// Current wire-format schema version.
///
/// Bumping this is a **semver-major** event. Old IDs must always remain
/// parseable by newer library versions.
pub const SCHEMA_VERSION: u8 = 1;

/// Strategy identifier used in the wire format.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
#[repr(u8)]
pub enum StrategyId {
    /// RFC 4122 random (122 random bits).
    UuidV4 = 0x00,
    /// Time-ordered (UUID v7–class).
    TimeOrdered = 0x01,
    /// ULID-style (Crockford base32, time-leading).
    Ulid = 0x02,
    /// NanoID-style (configurable length/alphabet).
    NanoLike = 0x03,
    /// Snowflake-style distributed (time + node + sequence).
    Snowflake = 0x04,
    /// Deterministic (hash of canonical input).
    Deterministic = 0x05,
    /// Reserved / unknown. Used for forward compatibility.
    Unknown(u8),
}

impl From<u8> for StrategyId {
    fn from(v: u8) -> Self {
        match v {
            0x00 => Self::UuidV4,
            0x01 => Self::TimeOrdered,
            0x02 => Self::Ulid,
            0x03 => Self::NanoLike,
            0x04 => Self::Snowflake,
            0x05 => Self::Deterministic,
            other => Self::Unknown(other),
        }
    }
}

impl From<StrategyId> for u8 {
    fn from(id: StrategyId) -> Self {
        match id {
            StrategyId::UuidV4 => 0x00,
            StrategyId::TimeOrdered => 0x01,
            StrategyId::Ulid => 0x02,
            StrategyId::NanoLike => 0x03,
            StrategyId::Snowflake => 0x04,
            StrategyId::Deterministic => 0x05,
            StrategyId::Unknown(v) => v,
        }
    }
}

// ---------------------------------------------------------------------------
// Prefix validation
// ---------------------------------------------------------------------------

/// Default maximum prefix length (characters).
pub const MAX_PREFIX_LENGTH: usize = 12;

/// Reserved prefixes that cannot be used by user configuration.
pub const RESERVED_PREFIXES: &[&str] = &["btr", "sys", "_", ""];

/// Validate a prefix string against the canonical rules.
///
/// # Rules
/// - Charset: `[a-z0-9]` (lowercase alphanumeric only).
/// - Length: 1..=`MAX_PREFIX_LENGTH`.
/// - Must not be in [`RESERVED_PREFIXES`].
///
/// # Errors
///
/// Returns [`ParseError::InvalidPrefix`] if the prefix is empty, reserved,
/// exceeds the maximum length, or contains invalid characters.
pub fn validate_prefix(prefix: &str) -> Result<(), ParseError> {
    if prefix.is_empty() || RESERVED_PREFIXES.contains(&prefix) {
        return Err(ParseError::InvalidPrefix {
            prefix: prefix.to_string(),
            reason: "empty or reserved".to_string(),
        });
    }
    if prefix.len() > MAX_PREFIX_LENGTH {
        return Err(ParseError::InvalidPrefix {
            prefix: prefix.to_string(),
            reason: format!("exceeds maximum length of {MAX_PREFIX_LENGTH}"),
        });
    }
    if !prefix
        .chars()
        .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit())
    {
        return Err(ParseError::InvalidPrefix {
            prefix: prefix.to_string(),
            reason: "contains characters outside [a-z0-9]".to_string(),
        });
    }
    Ok(())
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn strategy_id_roundtrip() {
        assert_eq!(u8::from(StrategyId::UuidV4), 0x00);
        assert_eq!(StrategyId::from(0x00u8), StrategyId::UuidV4);
        assert_eq!(StrategyId::from(0xFFu8), StrategyId::Unknown(0xFF));
    }

    #[test]
    fn validate_prefix_rejects_reserved() {
        assert!(validate_prefix("btr").is_err());
        assert!(validate_prefix("sys").is_err());
        assert!(validate_prefix("_").is_err());
        assert!(validate_prefix("").is_err());
    }

    #[test]
    fn validate_prefix_rejects_invalid_charset() {
        assert!(validate_prefix("User-ID").is_err());
        assert!(validate_prefix("UserID").is_err());
        assert!(validate_prefix("user_id").is_err());
    }

    #[test]
    fn validate_prefix_rejects_too_long() {
        assert!(validate_prefix("user-account-production-v2").is_err());
    }

    #[test]
    fn validate_prefix_accepts_valid() {
        assert!(validate_prefix("usr").is_ok());
        assert!(validate_prefix("ord").is_ok());
        assert!(validate_prefix("txn").is_ok());
        assert!(validate_prefix("a1b2c3").is_ok());
    }
}
