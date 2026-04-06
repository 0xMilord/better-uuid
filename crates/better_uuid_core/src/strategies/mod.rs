//! Strategy implementations for ID generation.
//!
//! Each strategy implements [`crate::strategy::IdStrategy`] with a unique `STRATEGY_ID`.

pub mod random_v4;
pub mod time_ordered;

pub use random_v4::RandomV4;
pub use time_ordered::TimeOrdered;
