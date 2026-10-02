# Threat Model

## Covered in MVP Demo

- Tampered receipt: changing a signed field invalidates verification.
- Duplicate evidence: repeated receipt IDs are ignored.
- Clone identity: identical display names can map to different cryptographic identities.
- Local verification: disclosure packages are checked without asking a Cloak server.

## Required Production Coverage

- Forged signatures.
- Replayed receipts.
- Sybil identities.
- Self-trading and colluding counterparties.
- Malicious counterparties.
- Stolen Nostr keys.
- Key rotation and key recovery.
- Receipt theft.
- Public metadata leakage.
- Malicious Nostr relays.
- Optional settlement evidence overclaiming.

## Sybil Limits

ProofTrade does not solve Sybil attacks. A malicious actor can create multiple identities and have them sign receipts with each other. Useful context can include identity age, Web-of-Trust proximity, repeat interactions, diverse counterparties, optional economic evidence, and known contacts, but none of these should become a universal trust score.
