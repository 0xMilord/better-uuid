//! Encoding and alphabet codecs.
//!
//! Supports Crockford base32 (default), base58, and hex (UUID-shaped strategies).

use base32::{Alphabet, encode as b32_encode, decode as b32_decode};

/// Crockford base32 alphabet (case-insensitive).
///
/// Omits I, L, O, U to avoid visual ambiguity.
pub const CROCKFORD: Alphabet = Alphabet::Crockford;

/// Base58 alphabet (Bitcoin-style).
///
/// Omits 0, O, I, l.
pub const BASE58_CHARS: &str = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

/// Encode bytes to a Crockford base32 string.
#[must_use]
pub fn encode_crockford(bytes: &[u8]) -> String {
    // base32 crate pads output; we strip padding for our wire format.
    b32_encode(CROCKFORD, bytes).trim_end_matches('=').to_string()
}

/// Decode a Crockford base32 string back to bytes.
///
/// Returns `None` if the input contains invalid characters.
#[must_use]
pub fn decode_crockford(s: &str) -> Option<Vec<u8>> {
    // Normalize to uppercase for case-insensitive parsing.
    let upper = s.to_ascii_uppercase();
    b32_decode(CROCKFORD, &upper)
}

/// Encode bytes to a canonical hex string (lowercase, no separator).
///
/// Used for UUID-shaped strategies and debug output.
#[must_use]
pub fn encode_hex(bytes: &[u8]) -> String {
    bytes.iter().map(|b| format!("{b:02x}")).collect()
}

/// Decode a hex string back to bytes.
///
/// Accepts both upper and lower case. Returns `None` on invalid input.
#[must_use]
pub fn decode_hex(s: &str) -> Option<Vec<u8>> {
    if s.len() % 2 != 0 {
        return None;
    }
    (0..s.len())
        .step_by(2)
        .map(|i| u8::from_str_radix(&s[i..i + 2], 16).ok())
        .collect()
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn crockford_roundtrip() {
        let input = b"hello world";
        let encoded = encode_crockford(input);
        assert!(!encoded.contains('=')); // no padding
        let decoded = decode_crockford(&encoded).expect("decode failed");
        assert_eq!(decoded, input);
    }

    #[test]
    fn crockford_case_insensitive() {
        let encoded = encode_crockford(b"test");
        let upper = encoded.to_ascii_uppercase();
        let lower = encoded.to_ascii_lowercase();
        assert_eq!(decode_crockford(&upper), decode_crockford(&lower));
    }

    #[test]
    fn crockford_omits_ambiguous() {
        // Crockford alphabet should not produce I, L, O, U in uppercase output
        let encoded = encode_crockford(&[0xFF; 16]);
        assert!(!encoded.contains('I'));
        assert!(!encoded.contains('L'));
        assert!(!encoded.contains('O'));
        assert!(!encoded.contains('U'));
    }

    #[test]
    fn hex_roundtrip() {
        let input = vec![0xDE, 0xAD, 0xBE, 0xEF];
        let encoded = encode_hex(&input);
        assert_eq!(encoded, "deadbeef");
        let decoded = decode_hex(&encoded).expect("decode failed");
        assert_eq!(decoded, input);
    }

    #[test]
    fn hex_rejects_odd_length() {
        assert!(decode_hex("abc").is_none());
    }

    #[test]
    fn hex_rejects_invalid_chars() {
        assert!(decode_hex("g00d").is_none());
    }
}
