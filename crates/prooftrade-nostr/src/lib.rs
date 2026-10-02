use chacha20poly1305::{
    aead::{Aead, KeyInit},
    ChaCha20Poly1305, Key, Nonce,
};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use thiserror::Error;
use x25519_dalek::{PublicKey, StaticSecret};

pub const CONTENT_VERSION: &str = "prooftrade/nip-04/v0.1";

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Envelope {
    pub version: String,
    pub message_id: String,
    pub sender: String,
    pub recipient: String,
    pub kind: MessageKind,
    pub ciphertext: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum MessageKind {
    ProofRequest,
    ReceiptProposal,
    Disclosure,
}

#[derive(Debug, Error, PartialEq, Eq)]
pub enum EnvelopeError {
    #[error("unsupported envelope version")]
    UnsupportedVersion,
    #[error("envelope participants must be different")]
    SameParticipant,
    #[error("message id is empty")]
    EmptyMessageId,
    #[error("invalid key or ciphertext encoding")]
    InvalidEncoding,
    #[error("message encryption or decryption failed")]
    Cryptography,
}

pub fn validate(envelope: &Envelope) -> Result<(), EnvelopeError> {
    if envelope.version != CONTENT_VERSION {
        return Err(EnvelopeError::UnsupportedVersion);
    }
    if envelope.message_id.trim().is_empty() {
        return Err(EnvelopeError::EmptyMessageId);
    }
    if envelope.sender == envelope.recipient {
        return Err(EnvelopeError::SameParticipant);
    }
    Ok(())
}

fn nonce_for(message_id: &str) -> Nonce {
    let digest = Sha256::digest(message_id.as_bytes());
    *Nonce::from_slice(&digest[..12])
}

fn shared_key(secret: &StaticSecret, peer: &PublicKey) -> Key {
    let shared = secret.diffie_hellman(peer);
    let digest = Sha256::digest(shared.as_bytes());
    *Key::from_slice(&digest)
}

pub fn encrypt(
    message_id: &str,
    sender_secret: &StaticSecret,
    recipient_public: &PublicKey,
    plaintext: &[u8],
) -> Result<String, EnvelopeError> {
    if message_id.trim().is_empty() {
        return Err(EnvelopeError::EmptyMessageId);
    }
    let cipher = ChaCha20Poly1305::new(&shared_key(sender_secret, recipient_public));
    let encrypted = cipher
        .encrypt(&nonce_for(message_id), plaintext)
        .map_err(|_| EnvelopeError::Cryptography)?;
    Ok(hex::encode(encrypted))
}

pub fn decrypt(
    message_id: &str,
    recipient_secret: &StaticSecret,
    sender_public: &PublicKey,
    ciphertext: &str,
) -> Result<Vec<u8>, EnvelopeError> {
    let bytes = hex::decode(ciphertext).map_err(|_| EnvelopeError::InvalidEncoding)?;
    let cipher = ChaCha20Poly1305::new(&shared_key(recipient_secret, sender_public));
    cipher
        .decrypt(&nonce_for(message_id), bytes.as_ref())
        .map_err(|_| EnvelopeError::Cryptography)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn encrypted_message_round_trips() {
        let alice = StaticSecret::from([1u8; 32]);
        let bob = StaticSecret::from([2u8; 32]);
        let ciphertext = encrypt(
            "message-1",
            &alice,
            &PublicKey::from(&bob),
            b"private proof request",
        )
        .unwrap();
        assert_eq!(
            decrypt("message-1", &bob, &PublicKey::from(&alice), &ciphertext).unwrap(),
            b"private proof request"
        );
        assert!(decrypt("message-2", &bob, &PublicKey::from(&alice), &ciphertext).is_err());
    }
}
