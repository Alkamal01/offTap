import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

function intFromEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive whole number`);
  }
  return value;
}

function str(name: string): string {
  return (process.env[name] ?? "").trim();
}

const dataDir = str("DATA_DIR") || "data";

function loadServerSecret(): string {
  const fromEnv = str("SERVER_SECRET");
  if (fromEnv) return fromEnv;
  mkdirSync(dataDir, { recursive: true });
  const file = join(dataDir, "server-secret");
  if (existsSync(file)) return readFileSync(file, "utf8").trim();
  const secret = randomBytes(32).toString("hex");
  writeFileSync(file, secret, { mode: 0o600 });
  return secret;
}

const groqKey = str("GROQ_API_KEY");
const sttUrl = str("STT_URL") || (groqKey ? "https://api.groq.com/openai/v1/audio/transcriptions" : "");
const viaGroq = sttUrl.includes("api.groq.com");

const atUsername = str("AT_USERNAME");
const atApiKey = str("AT_API_KEY");

export const config = {
  port: intFromEnv("PORT", 3000),
  dataDir,
  publicUrl: str("PUBLIC_URL") || `http://localhost:${intFromEnv("PORT", 3000)}`,
  ussdCode: str("USSD_CODE") || "*384*8822#",
  ussdWebhookToken: str("USSD_WEBHOOK_TOKEN"),
  maxPaymentSats: intFromEnv("MAX_PAYMENT_SATS", 50_000),
  dailyLimitSats: intFromEnv("DAILY_LIMIT_SATS", 100_000),
  africasTalking: {
    enabled: Boolean(atUsername && atApiKey),
    username: atUsername,
    apiKey: atApiKey,
    senderId: str("AT_SENDER_ID"),
  },
  walletProvider: (str("WALLET_PROVIDER") || "faucet") as "faucet" | "albyhub" | "none",
  seedDemo: str("SEED_DEMO") !== "false" && (str("WALLET_PROVIDER") || "faucet") === "faucet" && !(atUsername && atApiKey),
  faucetSats: intFromEnv("FAUCET_SATS", 10_000),
  speech: {
    url: sttUrl,
    apiKey: str("STT_API_KEY") || (viaGroq ? groqKey : ""),
    model: str("STT_MODEL") || (viaGroq ? "whisper-large-v3" : "Systran/faster-whisper-small"),
  },
  albyHub: { url: str("ALBY_HUB_URL"), token: str("ALBY_HUB_TOKEN") },
  get serverSecret(): string {
    return (cachedSecret ??= loadServerSecret());
  },
};

let cachedSecret: string | undefined;
