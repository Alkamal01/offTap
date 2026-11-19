import { readFile } from "node:fs/promises";
import { extname } from "node:path";
import { config } from "./config.js";
import { describeWallet, getBalanceSats, isNwcUri } from "./lightning/nwc.js";
import { quoteNgn, sendNgn } from "./payments.js";
import { getRate, satsToNgn } from "./rates.js";
import { parseIntent } from "./voice/intent.js";
import { createTranscriber } from "./voice/speech.js";
import { createUnderstander } from "./voice/understand.js";

const AUDIO_TYPES: Record<string, string> = {
  ".wav": "audio/wav",
  ".mp3": "audio/mpeg",
  ".m4a": "audio/mp4",
  ".ogg": "audio/ogg",
  ".webm": "audio/webm",
};

function nwcUri(): string {
  const uri = process.env.NWC_URI ?? "";
  if (!isNwcUri(uri)) {
    throw new Error("Set NWC_URI to a nostr+walletconnect:// connection string (see .env.example)");
  }
  return uri;
}

async function main(): Promise<void> {
  const [command, ...args] = process.argv.slice(2);
  switch (command) {
    case "rate": {
      const rate = await getRate();
      console.log(`1 BTC = NGN ${Math.round(rate.ngnPerBtc).toLocaleString()} (${rate.source})`);
      return;
    }
    case "quote": {
      const quote = await quoteNgn(Number(args[0]));
      console.log(`NGN ${quote.amountNgn.toLocaleString()} = ${quote.sats.toLocaleString()} sats (${quote.rateSource})`);
      return;
    }
    case "test-wallet": {
      const sats = Number(args[0] ?? 10_000);
      const res = await fetch(`https://faucet.nwc.dev?balance=${sats}`, { method: "POST", signal: AbortSignal.timeout(30_000) });
      if (!res.ok) throw new Error(`Faucet returned HTTP ${res.status}`);
      const uri = (await res.text()).trim();
      console.log(`Test wallet with ${sats.toLocaleString()} test sats (no real value).`);
      console.log(`Lightning address: ${new URL(uri).searchParams.get("lud16") ?? "none"}`);
      console.log(`NWC_URI=${uri}`);
      return;
    }
    case "wallet": {
      console.log(await describeWallet(nwcUri()));
      return;
    }
    case "balance": {
      const [sats, rate] = await Promise.all([getBalanceSats(nwcUri()), getRate()]);
      console.log(`${sats.toLocaleString()} sats (about NGN ${satsToNgn(sats, rate.ngnPerBtc).toLocaleString()})`);
      return;
    }
    case "pay": {
      const [recipient, amount] = args;
      if (!recipient || !amount) throw new Error("Usage: pay <lightning-address> <amount-in-naira>");
      const receipt = await sendNgn({ nwcUri: nwcUri(), recipient, amountNgn: Number(amount) });
      console.log(`Paid NGN ${receipt.amountNgn.toLocaleString()} (${receipt.sats} sats) to ${receipt.recipient}`);
      console.log(`Fee: ${receipt.feesPaidSats} sats`);
      console.log(`Preimage: ${receipt.preimage}`);
      return;
    }
    case "hear": {
      const file = args[0];
      const transcribe = createTranscriber(config.speech);
      if (!file) throw new Error("Usage: hear <audio-file> [contact names...]");
      if (!transcribe) throw new Error("Set GROQ_API_KEY or STT_URL first (see .env.example)");
      const text = await transcribe(await readFile(file), AUDIO_TYPES[extname(file).toLowerCase()] ?? "audio/wav", args.slice(1));
      console.log(`Heard: ${text}`);
      console.log("Understood:", parseIntent(text));
      return;
    }
    case "understand": {
      const sentence = args.join(" ");
      console.log("Rules:", parseIntent(sentence));
      const understand = createUnderstander(config.languageModel);
      if (understand) console.log("Model:", await understand(sentence, []));
      return;
    }
    default:
      console.log(
        "Commands: rate | quote <ngn> | test-wallet [sats] | wallet | balance | pay <lightning-address> <ngn> | hear <audio-file> | understand <sentence>",
      );
  }
}

main().then(
  () => process.exit(0),
  (err: Error) => {
    console.error(`Error: ${err.message}`);
    process.exit(1);
  },
);
