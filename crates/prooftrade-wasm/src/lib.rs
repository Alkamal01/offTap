use prooftrade_core::{commitment, verify_disclosure, Disclosure, Receipt};
use wasm_bindgen::prelude::*;

#[wasm_bindgen]
pub fn receipt_commitment(receipt_json: &str) -> Result<String, JsValue> {
    let receipt: Receipt = serde_json::from_str(receipt_json)
        .map_err(|error| JsValue::from_str(&format!("invalid receipt: {error}")))?;
    commitment(&receipt)
        .map_err(|error| JsValue::from_str(&format!("cannot create commitment: {error}")))
}

#[wasm_bindgen]
pub fn verify_disclosure_json(disclosure_json: &str) -> Result<bool, JsValue> {
    let disclosure: Disclosure = serde_json::from_str(disclosure_json)
        .map_err(|error| JsValue::from_str(&format!("invalid disclosure: {error}")))?;
    Ok(verify_disclosure(&disclosure).is_ok())
}

#[cfg(test)]
mod tests {
    use super::*;
    use prooftrade_core::PROTOCOL_VERSION;

    #[test]
    fn commitment_api_accepts_protocol_json() {
        let receipt = serde_json::json!({
            "protocol": PROTOCOL_VERSION,
            "receipt_id": "wasm-001",
            "proposer": "alice",
            "counterparty": "bob",
            "outcome": "COMPLETED",
            "amount": null,
            "asset": null,
            "created_at": "2026-10-02T00:00:00Z",
            "notes": null
        });
        assert!(receipt_commitment(&receipt.to_string()).is_ok());
    }
}
