# Security Notes

Cloak does not decide whether a person is trustworthy. It verifies evidence.

## Verification Guarantees

ProofTrade can show that two cryptographic identities signed the same receipt commitment for a stated outcome. The Rust `prooftrade-core` implementation performs canonical serialization, SHA-256 commitments, Ed25519 signatures, disclosure verification, unsupported-version checks, and duplicate receipt detection.

## Non-Guarantees

ProofTrade does not prove that goods were delivered, a service was completed, a human controlled a key, or a counterparty will behave honestly in the future.

Bitcoin or Lightning settlement information is supporting evidence only. A payment alone does not prove a physical trade happened.

## Key Handling

Private keys must not be logged, sent to a backend, or stored in plaintext. Mobile builds should use platform secure storage for identity keys and encrypted local storage for sensitive receipts.

## MVP Caveat

The current Expo app still uses deterministic local fixtures for demonstration. The Rust primitives are the intended security boundary, but they still need a tested Expo native/WASM binding before the mobile app can rely on them.
