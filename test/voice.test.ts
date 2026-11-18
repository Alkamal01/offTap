import { beforeEach, describe, expect, it } from "vitest";
import { createActions, type Wallet } from "../src/actions.js";
import { Store } from "../src/db.js";
import { PaymentError } from "../src/payments.js";
import { seal } from "../src/vault.js";
import { createVoiceCalls } from "../src/voice/call.js";
import { parseIntent } from "../src/voice/intent.js";
import { matchContact } from "../src/voice/match.js";
import { hausaNumber, normaliseHausa, parseHausaNumber } from "../src/voice/numbers.js";

const number = (text: string) => parseHausaNumber(normaliseHausa(text));

describe("Hausa numbers", () => {
  it.each([
    ["daya", 1],
    ["goma", 10],
    ["goma sha biyar", 15],
    ["sha biyu", 12],
    ["ashirin", 20],
    ["ashirin da biyar", 25],
    ["arba'in", 40],
    ["casa'in da tara", 99],
    ["ɗari", 100],
    ["dari biyu", 200],
    ["dari da hamsin", 150],
    ["dari biyu da hamsin", 250],
    ["dari uku da ashirin da biyar", 325],
    ["dubu", 1000],
    ["dubu daya", 1000],
    ["dubu biyar", 5000],
    ["dubu biyu da dari biyar", 2500],
    ["dubu daya da rabi", 1500],
    ["dubu goma", 10000],
    ["dubu goma sha biyar", 15000],
    ["dubu ashirin da biyar", 25000],
    ["dubu ashirin da dari biyar", 20500],
    ["dubu dari", 100000],
    ["dubu dari biyu da hamsin", 250000],
    ["dubu hamsin da dari uku da ashirin", 50320],
    ["miliyan daya", 1000000],
    ["miliyan biyu da dubu dari biyar", 2500000],
    ["5000", 5000],
    ["5,000", 5000],
    ["5 dubu", 5000],
    ["dubu 5", 5000],
  ])("%s = %d", (text, value) => {
    expect(number(text)).toBe(value);
  });

  it("rejects things that are not numbers", () => {
    expect(number("musa")).toBeUndefined();
    expect(number("dubu da")).toBeUndefined();
    expect(number("")).toBeUndefined();
  });
});

describe("Hausa intents", () => {
  it.each([
    ["Tura dubu biyar zuwa Musa", 5000, "musa"],
    ["tura naira dubu biyar zuwa musa", 5000, "musa"],
    ["Ina so in tura dubu biyu da dari biyar zuwa Aisha.", 2500, "aisha"],
    ["aika wa Musa naira dari biyar", 500, "musa"],
    ["biya mai shago dubu goma", 10000, "shago"],
    ["tura N5,000 zuwa Musa", 5000, "musa"],
    ["ka tura wa baban amina dubu daya da rabi", 1500, "baban amina"],
    ["dubu uku zuwa Sani", 3000, "sani"],
    ["tura 2000 ga musa", 2000, "musa"],
  ])("%s", (text, amountNgn, recipient) => {
    expect(parseIntent(text)).toEqual({ kind: "send", amountNgn, recipient });
  });

  it("keeps what it understood when part is missing", () => {
    expect(parseIntent("tura kudi zuwa musa")).toEqual({ kind: "send", recipient: "musa" });
    expect(parseIntent("tura dubu biyar")).toEqual({ kind: "send", amountNgn: 5000 });
  });

  it.each(["Duba balance", "nawa ne kudina?", "kudina saura nawa", "balance"])("balance: %s", (text) => {
    expect(parseIntent(text)).toEqual({ kind: "balance" });
  });

  it("does not guess", () => {
    expect(parseIntent("ina kwana")).toEqual({ kind: "unknown" });
    expect(parseIntent("")).toEqual({ kind: "unknown" });
    expect(parseIntent("dubu biyar")).toEqual({ kind: "unknown" });
  });
});

describe("speaking numbers", () => {
  it.each([
    [5, "biyar"],
    [15, "goma sha biyar"],
    [500, "dari biyar"],
    [1000, "dubu daya"],
    [2500, "dubu biyu da dari biyar"],
    [25000, "dubu ashirin da biyar"],
    [10535, "dubu goma da dari biyar da talatin da biyar"],
  ])("%d", (value, spoken) => {
    expect(hausaNumber(value)).toBe(spoken);
  });

  it("only speaks numbers it would understand back", () => {
    for (let n = 1; n <= 3000; n++) {
      const spoken = hausaNumber(n);
      expect(/^\d+$/.test(spoken) ? n : number(spoken)).toBe(n);
    }
    expect(hausaNumber(20005)).toBe("20005");
  });
});

describe("matching spoken names to contacts", () => {
  const contacts = [
    { name: "musa", recipient: "+2348030000002" },
    { name: "aisha", recipient: "+2348030000003" },
    { name: "baban amina", recipient: "+2348030000004" },
  ];
  it("tolerates small transcription slips", () => {
    expect(matchContact(contacts, "Musa")?.name).toBe("musa");
    expect(matchContact(contacts, "moussa")).toBeUndefined();
    expect(matchContact(contacts, "mussa")?.name).toBe("musa");
    expect(matchContact(contacts, "aisya")?.name).toBe("aisha");
    expect(matchContact(contacts, "baban amina")?.name).toBe("baban amina");
    expect(matchContact(contacts, "babban amina")?.name).toBe("baban amina");
  });
  it("refuses to guess", () => {
    expect(matchContact(contacts, "sani")).toBeUndefined();
    expect(matchContact([...contacts, { name: "muna", recipient: "x" }], "mula")).toBeUndefined();
  });
});

describe("voice call", () => {
  const SECRET = "test-secret";
  const NWC = `nostr+walletconnect://${"a".repeat(64)}?relay=wss://relay.example.com&secret=${"b".repeat(64)}`;
  const AMINA = "+2348030000001";
  const MUSA = "+2348030000002";
  let store: Store;
  let sent: { recipient: string; sats: number }[];
  let texts: string[];
  let calls: ReturnType<typeof createVoiceCalls>;

  const run = async (step: ReturnType<typeof calls.start> | Promise<ReturnType<typeof calls.start>>) => {
    const result = await step;
    await result.background;
    return result;
  };

  beforeEach(async () => {
    store = new Store(":memory:");
    sent = [];
    texts = [];
    const wallet: Wallet = {
      quote: async (amountNgn) => {
        if (amountNgn > 40_000) throw new PaymentError("AMOUNT_TOO_LARGE", "too large");
        return { amountNgn, sats: Math.ceil(amountNgn * 1.1), ngnPerBtc: 90_000_000, rateSource: "test" };
      },
      send: async ({ recipient, quote }) => {
        sent.push({ recipient, sats: quote.sats });
        return { ...quote, recipient, paymentHash: "hash", preimage: "pre", feesPaidSats: 1 };
      },
      balanceSats: async () => 21_000,
      ngnPerBtc: async () => 90_000_000,
    };
    const sms = async (_phone: string, message: string) => {
      texts.push(message);
    };
    const actions = createActions({ store, sms, wallet, serverSecret: SECRET, dailyLimitSats: 10_000 });
    calls = createVoiceCalls({ store, actions, wallet, ussdCode: "*384*1#" });
    store.saveUser(AMINA, await seal(NWC, "4826", SECRET), "amina@example.com");
    store.saveUser(MUSA, await seal(NWC, "7391", SECRET), "musa@example.com");
    store.saveContact(AMINA, "musa", MUSA);
  });

  it("sends money from one sentence, after reading it back and taking the PIN", async () => {
    expect(calls.start("c", AMINA).expect).toBe("speech");
    const confirm = await run(calls.heard("c", "Tura dubu biyar zuwa Musa"));
    expect(confirm.expect).toBe("pin");
    expect(confirm.say).toContain("naira dubu biyar zuwa Musa");
    expect(sent).toHaveLength(0);
    const done = await run(calls.digits("c", "4826#"));
    expect(done.expect).toBe("end");
    expect(sent).toEqual([{ recipient: "musa@example.com", sats: 5500 }]);
    expect(texts).toHaveLength(2);
  });

  it("asks for whatever is missing", async () => {
    calls.start("c", AMINA);
    expect((await calls.heard("c", "tura kudi zuwa musa")).say).toContain("Nawa");
    expect((await calls.heard("c", "naira dubu biyu")).say).toContain("naira dubu biyu zuwa Musa");

    calls.start("d", AMINA);
    expect((await calls.heard("d", "tura dari biyar")).say).toContain("Wa za a tura");
    expect((await calls.heard("d", "Mussa")).say).toContain("naira dari biyar zuwa Musa");
  });

  it("never pays without the right PIN and locks after three wrong ones", async () => {
    calls.start("c", AMINA);
    await calls.heard("c", "tura dubu daya zuwa musa");
    expect((await calls.digits("c", "0000")).expect).toBe("pin");
    expect((await calls.digits("c", "0001")).expect).toBe("pin");
    expect((await calls.digits("c", "0002")).say).toContain("kulle");
    expect(calls.start("e", AMINA).expect).toBe("end");
    expect(sent).toHaveLength(0);
  });

  it("does not pay people who are not saved contacts", async () => {
    calls.start("c", AMINA);
    expect((await calls.heard("c", "tura dubu daya zuwa sani")).expect).toBe("speech");
    expect((await calls.heard("c", "sani")).expect).toBe("speech");
    expect((await calls.heard("c", "sani")).expect).toBe("end");
    expect(sent).toHaveLength(0);
  });

  it("reads the balance after the PIN", async () => {
    calls.start("c", AMINA);
    expect((await calls.heard("c", "nawa ne kudina")).expect).toBe("pin");
    const result = await calls.digits("c", "4826");
    expect(result.say).toContain("sats dubu ashirin da daya");
    expect(result.expect).toBe("end");
  });

  it("applies the same limits as USSD", async () => {
    calls.start("c", AMINA);
    expect((await calls.heard("c", "tura dubu hamsin zuwa musa")).expect).toBe("end");
    calls.start("d", AMINA);
    await calls.heard("d", "tura dubu tara zuwa musa");
    await run(calls.digits("d", "4826"));
    calls.start("e", AMINA);
    await calls.heard("e", "tura dubu tara zuwa musa");
    expect((await calls.digits("e", "4826")).say).toContain("iyakar");
    expect(sent).toHaveLength(1);
  });

  it("turns away phones without a wallet and gibberish", async () => {
    expect(calls.start("c", "+2348039999999")).toMatchObject({ expect: "end" });
    calls.start("d", AMINA);
    await calls.heard("d", "ina kwana");
    await calls.heard("d", "lafiya lau");
    expect((await calls.heard("d", "sannu")).expect).toBe("end");
    expect((await calls.heard("d", "tura dubu daya zuwa musa")).expect).toBe("end");
  });
});

describe("voice over HTTP", () => {
  const SECRET = "test-secret";
  const NWC = `nostr+walletconnect://${"a".repeat(64)}?relay=wss://relay.example.com&secret=${"b".repeat(64)}`;
  const AMINA = "+2348030000001";
  const MUSA = "+2348030000002";

  const build = async () => {
    const { buildServer } = await import("../src/server.js");
    const store = new Store(":memory:");
    const sent: string[] = [];
    store.saveUser(AMINA, await seal(NWC, "4826", SECRET), null);
    store.saveUser(MUSA, await seal(NWC, "7391", SECRET), "musa@example.com");
    store.saveContact(AMINA, "musa", MUSA);
    const app = buildServer({
      store,
      serverSecret: SECRET,
      logger: false,
      simulator: true,
      provider: null,
      sms: async () => {},
      transcribe: async (audio) => new TextDecoder().decode(audio),
      wallet: {
        quote: async (amountNgn) => ({ amountNgn, sats: amountNgn, ngnPerBtc: 1e8, rateSource: "test" }),
        send: async ({ recipient, quote }) => {
          sent.push(recipient);
          return { ...quote, recipient, paymentHash: "h", preimage: "p", feesPaidSats: 0 };
        },
        balanceSats: async () => 1,
        ngnPerBtc: async () => 1e8,
      },
    });
    const post = (url: string, fields: Record<string, string>) =>
      app.inject({
        method: "POST",
        url,
        headers: { "content-type": "application/x-www-form-urlencoded" },
        payload: new URLSearchParams(fields).toString(),
      });
    return { app, sent, post };
  };

  it("answers Africa's Talking in its XML and ignores a PIN nobody asked for", async () => {
    const { app, sent, post } = await build();
    const call = { sessionId: "at1", isActive: "1", direction: "Inbound", callerNumber: AMINA };
    const first = await post("/voice", call);
    expect(first.headers["content-type"]).toContain("application/xml");
    expect(first.body).toMatch(/<Response><Record [^>]*><Say>Barka da zuwa offTap/);
    expect((await post("/voice", call)).body).toContain("<Record");
    expect((await post("/voice", { ...call, dtmfDigits: "4826" })).body).not.toMatch(/<Record|<GetDigits/);
    expect(sent).toHaveLength(0);
    await app.close();
  });

  it("runs a whole call through the simulator endpoints", async () => {
    const { app, sent, post } = await build();
    const base = { callId: "s1", phone: AMINA };
    expect((await post("/sim/voice", { ...base, action: "start" })).json().expect).toBe("speech");
    const heard = await app.inject({
      method: "POST",
      url: "/sim/voice/transcribe",
      headers: { "content-type": "audio/webm" },
      payload: Buffer.from("tura dari biyar zuwa musa"),
    });
    const { text } = heard.json() as { text: string };
    const confirm = (await post("/sim/voice", { ...base, action: "say", value: text })).json();
    expect(confirm).toMatchObject({ expect: "pin" });
    expect(confirm.say).toContain("naira dari biyar zuwa Musa");
    expect((await post("/sim/voice", { ...base, action: "pin", value: "4826" })).json().expect).toBe("end");
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(sent).toEqual(["musa@example.com"]);
    await app.close();
  });

  it("hangs up cleanly and escapes spoken text", async () => {
    const { voiceXml } = await import("../src/voice/routes.js");
    expect(voiceXml({ say: "a < b & c", expect: "end" })).toContain("<Say>a &lt; b &amp; c</Say>");
    const { app, post } = await build();
    await post("/voice", { sessionId: "at2", isActive: "1", callerNumber: AMINA });
    expect((await post("/voice", { sessionId: "at2", isActive: "0", callerNumber: AMINA })).body).toBe("");
    expect((await post("/voice", { sessionId: "at3", isActive: "1", callerNumber: "+2348039999999" })).body).not.toContain("<Record");
    await app.close();
  });
});

describe("speech-to-text request", () => {
  it("asks for Hausa and hints the number words and contact names", async () => {
    const { createTranscriber, speechPrompt } = await import("../src/voice/speech.js");
    expect(createTranscriber({ url: "", apiKey: "", model: "m" })).toBeUndefined();
    expect(speechPrompt(["Musa", "Baban Amina"])).toMatch(/dubu.*Sunaye: Musa, Baban Amina\./);

    const original = globalThis.fetch;
    let seen: { url: string; auth: string | null; form: FormData } | undefined;
    globalThis.fetch = (async (url: string, init: RequestInit) => {
      seen = { url, auth: new Headers(init.headers).get("authorization"), form: init.body as FormData };
      return new Response(JSON.stringify({ text: " Tura dubu biyar zuwa Musa. " }));
    }) as typeof fetch;
    try {
      const transcribe = createTranscriber({ url: "https://stt.test/v1/audio/transcriptions", apiKey: "k", model: "whisper-large-v3" })!;
      expect(await transcribe(new Uint8Array([1, 2, 3]), "audio/webm;codecs=opus", ["Musa"])).toBe("Tura dubu biyar zuwa Musa.");
    } finally {
      globalThis.fetch = original;
    }
    expect(seen?.auth).toBe("Bearer k");
    expect(seen?.form.get("language")).toBe("ha");
    expect(seen?.form.get("model")).toBe("whisper-large-v3");
    expect(String(seen?.form.get("prompt"))).toContain("Musa");
    expect((seen?.form.get("file") as File).name).toBe("speech.webm");
  });
});
