use ed25519_dalek::{Signature, Signer, SigningKey, Verifier, VerifyingKey};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use thiserror::Error;

pub const PROTOCOL_VERSION: &str = "prooftrade/v0.1";

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum Outcome {
    Completed,
    Disputed,
    Cancelled,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Receipt {
    pub protocol: String,
    pub receipt_id: String,
    pub proposer: String,
    pub counterparty: String,
    pub outcome: Outcome,
    pub amount: Option<String>,
    pub asset: Option<String>,
    pub created_at: String,
    pub notes: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ReceiptSignature {
    pub signer: String,
    pub public_key: String,
    pub signature: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Disclosure {
    pub protocol: String,
    pub receipts: Vec<Receipt>,
    pub signatures: Vec<ReceiptSignature>,
}

#[derive(Debug, Error, PartialEq, Eq)]
pub enum VerificationError {
    #[error("unsupported protocol version")]
    UnsupportedProtocol,
    #[error("receipt id is empty")]
    EmptyReceiptId,
    #[error("receipt parties must be different")]
    SameParty,
    #[error("receipt commitment does not match")]
    CommitmentMismatch,
    #[error("duplicate receipt id")]
    DuplicateReceipt,
    #[error("invalid public key")]
    InvalidPublicKey,
    #[error("invalid signature encoding")]
    InvalidSignature,
    #[error("signature verification failed")]
    SignatureMismatch,
    #[error("signature signer is not a receipt party")]
    UnknownSigner,
    #[error("disclosure has no receipts")]
    EmptyDisclosure,
}

pub fn canonical_bytes(receipt: &Receipt) -> Result<Vec<u8>, serde_json::Error> {
    serde_json::to_vec(receipt)
}

pub fn commitment(receipt: &Receipt) -> Result<String, serde_json::Error> {
    let digest = Sha256::digest(canonical_bytes(receipt)?);
    Ok(format!("sha256:{digest:x}"))
}

pub fn validate(receipt: &Receipt) -> Result<(), VerificationError> {
    if receipt.protocol != PROTOCOL_VERSION {
        return Err(VerificationError::UnsupportedProtocol);
    }
    if receipt.receipt_id.trim().is_empty() {
        return Err(VerificationError::EmptyReceiptId);
    }
    if receipt.proposer == receipt.counterparty {
        return Err(VerificationError::SameParty);
    }
    Ok(())
}

pub fn verify_commitment(receipt: &Receipt, expected: &str) -> Result<(), VerificationError> {
    validate(receipt)?;
    let actual = commitment(receipt).map_err(|_| VerificationError::CommitmentMismatch)?;
    if actual != expected {
        return Err(VerificationError::CommitmentMismatch);
    }
    Ok(())
}

pub fn reject_duplicate_ids(receipts: &[Receipt]) -> Result<(), VerificationError> {
    let mut ids = std::collections::HashSet::new();
    for receipt in receipts {
        if !ids.insert(&receipt.receipt_id) {
            return Err(VerificationError::DuplicateReceipt);
        }
    }
    Ok(())
}

pub fn sign_receipt(
    receipt: &Receipt,
    signer: &SigningKey,
) -> Result<ReceiptSignature, VerificationError> {
    validate(receipt)?;
    let digest = commitment(receipt).map_err(|_| VerificationError::CommitmentMismatch)?;
    let signature = signer.sign(digest.as_bytes());
    Ok(ReceiptSignature {
        signer: hex::encode(signer.verifying_key().to_bytes()),
        public_key: hex::encode(signer.verifying_key().to_bytes()),
        signature: hex::encode(signature.to_bytes()),
    })
}

pub fn verify_receipt_signature(
    receipt: &Receipt,
    signed: &ReceiptSignature,
) -> Result<(), VerificationError> {
    validate(receipt)?;
    if signed.signer != signed.public_key
        || (signed.signer != receipt.proposer && signed.signer != receipt.counterparty)
    {
        return Err(VerificationError::UnknownSigner);
    }
    let key_bytes =
        hex::decode(&signed.public_key).map_err(|_| VerificationError::InvalidPublicKey)?;
    let signature_bytes =
        hex::decode(&signed.signature).map_err(|_| VerificationError::InvalidSignature)?;
    let key = VerifyingKey::from_bytes(
        key_bytes
            .as_slice()
            .try_into()
            .map_err(|_| VerificationError::InvalidPublicKey)?,
    )
    .map_err(|_| VerificationError::InvalidPublicKey)?;
    let signature = Signature::from_bytes(
        signature_bytes
            .as_slice()
            .try_into()
            .map_err(|_| VerificationError::InvalidSignature)?,
    );
    let digest = commitment(receipt).map_err(|_| VerificationError::CommitmentMismatch)?;
    key.verify(digest.as_bytes(), &signature)
        .map_err(|_| VerificationError::SignatureMismatch)
}

pub fn verify_disclosure(disclosure: &Disclosure) -> Result<(), VerificationError> {
    if disclosure.protocol != PROTOCOL_VERSION {
        return Err(VerificationError::UnsupportedProtocol);
    }
    if disclosure.receipts.is_empty() {
        return Err(VerificationError::EmptyDisclosure);
    }
    reject_duplicate_ids(&disclosure.receipts)?;
    for receipt in &disclosure.receipts {
        let mut signers = std::collections::HashSet::new();
        for signed in &disclosure.signatures {
            if signed.signer == receipt.proposer || signed.signer == receipt.counterparty {
                verify_receipt_signature(receipt, signed)?;
                signers.insert(signed.signer.clone());
            }
        }
        if !signers.contains(&receipt.proposer) || !signers.contains(&receipt.counterparty) {
            return Err(VerificationError::SignatureMismatch);
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn receipt() -> Receipt {
        Receipt {
            protocol: PROTOCOL_VERSION.into(),
            receipt_id: "receipt-001".into(),
            proposer: "alice".into(),
            counterparty: "bob".into(),
            outcome: Outcome::Completed,
            amount: Some("1000".into()),
            asset: Some("BTC".into()),
            created_at: "2026-10-02T00:00:00Z".into(),
            notes: None,
        }
    }

    #[test]
    fn commitment_is_stable_and_detects_changes() {
        let original = receipt();
        let expected = commitment(&original).unwrap();
        assert!(verify_commitment(&original, &expected).is_ok());
        let mut changed = original;
        changed.outcome = Outcome::Disputed;
        assert_eq!(
            verify_commitment(&changed, &expected),
            Err(VerificationError::CommitmentMismatch)
        );
    }

    #[test]
    fn duplicate_ids_are_rejected() {
        let first = receipt();
        assert_eq!(
            reject_duplicate_ids(&[first.clone(), first]),
            Err(VerificationError::DuplicateReceipt)
        );
    }

    #[test]
    fn signed_receipt_and_disclosure_verify() {
        let alice = SigningKey::from_bytes(&[1u8; 32]);
        let bob = SigningKey::from_bytes(&[2u8; 32]);
        let mut receipt = receipt();
        receipt.proposer = hex::encode(alice.verifying_key().to_bytes());
        receipt.counterparty = hex::encode(bob.verifying_key().to_bytes());
        let signed_alice = sign_receipt(&receipt, &alice).unwrap();
        let signed_bob = sign_receipt(&receipt, &bob).unwrap();
        let mut disclosure = Disclosure {
            protocol: PROTOCOL_VERSION.into(),
            receipts: vec![receipt],
            signatures: vec![signed_alice, signed_bob],
        };
        assert!(verify_disclosure(&disclosure).is_ok());
        disclosure.receipts[0].outcome = Outcome::Cancelled;
        assert_eq!(
            verify_disclosure(&disclosure),
            Err(VerificationError::SignatureMismatch)
        );
    }
}
