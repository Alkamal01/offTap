# ProofTrade v0.1

ProofTrade is a receipt protocol for mutually attested economic interactions.

It is not the Cloak application protocol specifically. Cloak is one consumer of ProofTrade, but the core receipt, disclosure, and verification rules should be portable to other applications.

## Receipt

A v0.1 receipt contains:

- `version`
- `tradeId`
- `partyA`
- `partyB`
- `createdAt`
- `completedAt`
- `outcome`: `COMPLETED`, `DISPUTED`, or `CANCELLED`
- `nonce`
- optional `metadataCommitment`
- optional `settlementCommitment`

The public receipt should not contain phone numbers, email addresses, shipping addresses, product descriptions, private conversations, or exact fiat amounts.

## Commitment

Receipts are canonically encoded and hashed. Both parties sign the same commitment. If any signed field changes, verification must fail.

## States

Allowed states:

- `DRAFT`
- `PROPOSED`
- `PARTY_A_SIGNED`
- `FULLY_SIGNED`
- `REJECTED`
- `CANCELLED`
- `DISPUTED`

The verifier must reject impossible transitions and must require both expected signatures for a fully signed receipt.

## Disclosure

A disclosure package contains a subject, recipient, selected receipts, creation time, nonce, and signature. For this MVP, selected receipts are disclosed whole while unselected receipts remain private.

Do not describe this as zero knowledge. Redaction is only valid where the remaining data can still support the claimed proof.
