# Cloak

**powered by ProofTrade**

Repository: `github.com/<you>/cloak`

Verify trust. Reveal less.

Cloak is a consumer app for selectively sharing private ProofTrade receipts. Two people who completed an economic interaction can mutually attest to the outcome, store the receipt privately, and later disclose selected receipts as evidence.

Cloak does not create a universal trust score. It presents cryptographically verifiable evidence so a person can decide what that evidence means.

The repository and consumer product are named `cloak`. The protocol is deliberately independent and named `ProofTrade`.

```text
cloak/
├── crates/prooftrade-core
└── crates/prooftrade-nostr
```

`prooftrade-core` and `prooftrade-nostr` are protocol crates, not Cloak-specific services. Other products should be able to use ProofTrade without adopting Cloak branding, servers, or UI.

## MVP in this repo

- Expo / React Native mobile app using the existing Inter font and navy/slate brand palette.
- Home, People, Proofs, and Profile flows.
- Local ProofTrade fixture layer with canonical receipt commitments, deterministic demo signatures, disclosure packages, duplicate detection, and a tampered receipt demo.
- Clone-identity demo: two "Bob Electronics" profiles with different identities and different evidence.
- Rust protocol workspace with signed receipts, two-party disclosure verification, encrypted Nostr envelopes, and a WASM verification API.

The current app-layer verifier is an MVP bridge for demonstration. Security-critical verification should move into the planned Rust `prooftrade-core` crate before production use.

## Product principles

- Private by default. Public by choice.
- Receipts are evidence, not ratings.
- Names, photos, and bios are not identity.
- Bitcoin or Lightning settlement data can support a receipt but does not prove delivery, honest behavior, or a completed physical trade by itself.
- Verification should happen locally without trusting a Cloak server.

## Screens

- **Home**: Cloak identity, pending proof requests, pending receipt signatures, quick actions.
- **People**: scan/paste/select an identity, request proof, compare legitimate and clone identities.
- **Proofs**: verify disclosure packages locally, detect duplicates, show tampered receipt failure.
- **Profile**: QR identity, public npub-style identity, privacy/security model, theme setting.

## Getting started

Requires Node 18+.

```bash
npm install
npm start
```

Run on a target from the Expo CLI, or directly:

```bash
npm run ios
npm run android
npm run web
```

## Roadmap

- Create `crates/prooftrade-core` in Rust for canonical serialization, Schnorr/secp256k1 signing, verification, state transitions, and disclosure verification.
- Add `crates/prooftrade-nostr` for encrypted proof requests, receipt proposals, and disclosure packages using maintained Nostr libraries.
- Expose the Rust verifier to mobile through bindings and to web/demo through WASM.
- Build `prooftrade-wasm` with `rustup target add wasm32-unknown-unknown` and `wasm-pack build crates/prooftrade-wasm --target web`.
- Replace demo fixtures with secure local storage, migrations, encrypted receipt persistence, and Nostr relay transport.
