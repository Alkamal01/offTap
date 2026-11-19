import { config } from "./config.js";
import type { Store } from "./db.js";
import { isDemoPhone } from "./seed.js";

export type SmsSender = (phone: string, message: string) => Promise<void>;

async function sendViaAfricasTalking(phone: string, message: string): Promise<void> {
  const { username, apiKey, senderId } = config.africasTalking;
  const host = username === "sandbox" ? "api.sandbox.africastalking.com" : "api.africastalking.com";
  const body = new URLSearchParams({ username, to: phone, message });
  if (senderId) body.set("from", senderId);
  const res = await fetch(`https://${host}/version1/messaging`, {
    method: "POST",
    headers: { apiKey, Accept: "application/json", "Content-Type": "application/x-www-form-urlencoded" },
    body,
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`Africa's Talking SMS failed with HTTP ${res.status}`);
}

export function createSmsSender(store: Store, onError: (err: Error) => void = () => {}): SmsSender {
  return async (phone, message) => {
    store.addSms(phone, message);
    if (!config.africasTalking.enabled || isDemoPhone(phone)) return;
    try {
      await sendViaAfricasTalking(phone, message);
    } catch (err) {
      onError(err as Error);
    }
  };
}
