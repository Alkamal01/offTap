import { beforeEach, describe, expect, it } from "vitest";
import { Store } from "../src/db.js";
import { PaymentError, type Quote } from "../src/payments.js";
import { createUssdHandler, type Wallet } from "../src/ussd/handler.js";
import { open, seal } from "../src/vault.js";
import type { WalletProvider } from "../src/wallets/provider.js";

const SECRET = "test-secret";
const NWC = `nostr+walletconnect://${"a".repeat(64)}?relay=wss://relay.example.com&secret=${"b".repeat(64)}`;
const AMINA = "+2348030000001";
const MUSA = "+2348030000002";

type Sent = { nwcUri: string; recipient: string; sats: number; receiverNwcUri?: string };

function setup(overrides: Partial<Wallet> = {}, provider?: WalletProvider) {
  const store = new Store(":memory:");
  const sent: Sent[] = [];
  const texts: { phone: string; message: string }[] = [];
  const wallet: Wallet = {
    quote: async (amountNgn) => {
      const sats = Math.ceil(amountNgn * 1.1);
      if (sats > 50_000) throw new PaymentError("AMOUNT_TOO_LARGE", "too large");
      return { amountNgn, sats, ngnPerBtc: 90_000_000, rateSource: "test" } satisfies Quote;
    },
    send: async ({ nwcUri, recipient, quote, receiverNwcUri }) => {
      sent.push({ nwcUri, recipient, sats: quote.sats, ...(receiverNwcUri ? { receiverNwcUri } : {}) });
      return { ...quote, recipient, paymentHash: "hash", preimage: "pre", feesPaidSats: 2 };
    },
    balanceSats: async () => 21_000,
    ngnPerBtc: async () => 90_000_000,
    ...overrides,
  };
  const handle = createUssdHandler({
    store,
    wallet,
    ...(provider ? { provider } : {}),
    sms: async (phone, message) => {
      texts.push({ phone, message });
    },
    serverSecret: SECRET,
    publicUrl: "https://offtap.test",
    ussdCode: "*384*1#",
    dailyLimitSats: 10_000,
    maxPaymentSats: 50_000,
    balanceWaitMs: 50,
  });
  const dial = async (phoneNumber: string, text: string, sessionId = "s1") => {
    const result = await handle({ sessionId, phoneNumber, text });
    await result.background;
    return result.reply;
  };
  const link = async (phone: string, pin: string, lnAddress: string | null) =>
    store.saveUser(phone, await seal(NWC, pin, SECRET), lnAddress);
  return { store, sent, texts, dial, link };
}

describe("USSD: unlinked phone", () => {
  it("offers linking and issues a code tied to the dialling phone", async () => {
    const t = setup();
    expect(await t.dial(AMINA, "")).toMatch(/^CON .*Hada wallet/s);
    const reply = await t.dial(AMINA, "1");
    const code = /(\d{6})/.exec(reply)?.[1];
    expect(code).toBeDefined();
    expect(t.store.phoneForLinkCode(code!)).toBe(AMINA);
    expect(t.texts[0]?.phone).toBe(AMINA);
  });

  it("does not expose the send menu", async () => {
    const t = setup();
    expect(await t.dial(AMINA, "1*musa@example.com")).toMatch(/^END /);
    expect(t.sent).toHaveLength(0);
  });
});

describe("USSD: send", () => {
  let t: ReturnType<typeof setup>;
  beforeEach(async () => {
    t = setup();
    await t.link(AMINA, "1234", "amina@example.com");
    await t.link(MUSA, "9999", "musa@example.com");
  });

  it("pays a Lightning address after PIN confirmation and sends a receipt", async () => {
    expect(await t.dial(AMINA, "")).toMatch(/^CON .*Tura Kudi/s);
    expect(await t.dial(AMINA, "1")).toMatch(/^CON /);
    expect(await t.dial(AMINA, "1*shop@example.com")).toMatch(/^CON .*Naira/);
    expect(await t.dial(AMINA, "1*shop@example.com*5000")).toMatch(/^CON .*N5,000 \(5,500 sats\).*shop@example\.com/s);
    expect(await t.dial(AMINA, "1*shop@example.com*5000*1234")).toMatch(/^END /);
    expect(t.sent).toEqual([{ nwcUri: NWC, recipient: "shop@example.com", sats: 5500 }]);
    expect(t.texts.at(-1)).toMatchObject({ phone: AMINA });
    expect(t.texts.at(-1)?.message).toContain("5,500 sats");
  });

  it("pays a registered phone number and notifies the recipient", async () => {
    await t.dial(AMINA, "1*08030000002*1000");
    await t.dial(AMINA, "1*08030000002*1000*1234");
    expect(t.sent[0]?.recipient).toBe("musa@example.com");
    expect(t.texts.map((m) => m.phone)).toEqual([AMINA, MUSA]);
  });

  it("rejects unknown recipients and bad amounts", async () => {
    expect(await t.dial(AMINA, "1*08031111111")).toMatch(/^END .*offTap wallet/);
    expect(await t.dial(AMINA, "1*not-a-recipient")).toMatch(/^END /);
    expect(await t.dial(AMINA, "1*shop@example.com*abc")).toMatch(/^END /);
    expect(await t.dial(AMINA, "1*shop@example.com*-5")).toMatch(/^END /);
    expect(await t.dial(AMINA, "1*shop@example.com*999999")).toMatch(/^END .*iyaka/);
    expect(t.sent).toHaveLength(0);
  });

  it("does not pay with a wrong PIN and locks after three attempts", async () => {
    for (const [i, left] of [[1, 2], [2, 1]] as const) {
      await t.dial(AMINA, "1*shop@example.com*500", `w${i}`);
      expect(await t.dial(AMINA, "1*shop@example.com*500*0000", `w${i}`)).toContain(`Saura gwaji ${left}`);
    }
    await t.dial(AMINA, "1*shop@example.com*500", "w3");
    expect(await t.dial(AMINA, "1*shop@example.com*500*0000", "w3")).toMatch(/kulle/);
    await t.dial(AMINA, "1*shop@example.com*500", "w4");
    expect(await t.dial(AMINA, "1*shop@example.com*500*1234", "w4")).toMatch(/kulle/);
    expect(t.sent).toHaveLength(0);
  });

  it("requires the confirmation step before a PIN is accepted", async () => {
    expect(await t.dial(AMINA, "1*shop@example.com*500*1234", "fresh")).toMatch(/^END /);
    expect(t.sent).toHaveLength(0);
  });

  it("enforces the daily limit", async () => {
    await t.dial(AMINA, "1*shop@example.com*5000", "a");
    await t.dial(AMINA, "1*shop@example.com*5000*1234", "a");
    await t.dial(AMINA, "1*shop@example.com*5000", "b");
    expect(await t.dial(AMINA, "1*shop@example.com*5000*1234", "b")).toMatch(/iyakar/);
    expect(t.sent).toHaveLength(1);
  });

  it("reports a failed payment by SMS and does not count it against the limit", async () => {
    const failing = setup({
      send: async () => {
        throw Object.assign(new Error("no funds"), { code: "INSUFFICIENT_BALANCE" });
      },
    });
    await failing.link(AMINA, "1234", null);
    await failing.dial(AMINA, "1*shop@example.com*5000");
    await failing.dial(AMINA, "1*shop@example.com*5000*1234");
    expect(failing.texts.at(-1)?.message).toContain("bai isa ba");
    expect(failing.store.satsSpentSince(AMINA, 0)).toBe(0);
  });
});

describe("USSD: balance and receive", () => {
  it("shows the balance after the PIN", async () => {
    const t = setup();
    await t.link(AMINA, "1234", "amina@example.com");
    expect(await t.dial(AMINA, "2")).toMatch(/^CON .*PIN/);
    expect(await t.dial(AMINA, "2*1234")).toMatch(/^END Balance: 21,000 sats \(kimanin N18,900\)/);
    expect(await t.dial(AMINA, "2*0000")).toContain("Saura gwaji 2");
  });

  it("falls back to SMS when the wallet is slow", async () => {
    const t = setup({ balanceSats: () => new Promise((resolve) => setTimeout(() => resolve(500), 120)) });
    await t.link(AMINA, "1234", null);
    expect(await t.dial(AMINA, "2*1234")).toMatch(/^END .*SMS/);
    expect(t.texts.at(-1)?.message).toContain("500 sats");
  });

  it("shows the receiving address", async () => {
    const t = setup();
    await t.link(AMINA, "1234", "amina@example.com");
    expect(await t.dial(AMINA, "3")).toContain("amina@example.com");
  });
});

describe("USSD: contacts", () => {
  let t: ReturnType<typeof setup>;
  beforeEach(async () => {
    t = setup();
    await t.link(AMINA, "1234", "amina@example.com");
    await t.link(MUSA, "9999", "musa@example.com");
  });

  it("saves a contact and lists it", async () => {
    expect(await t.dial(AMINA, "5")).toMatch(/^CON .*Ajiye/s);
    expect(await t.dial(AMINA, "5*1")).toMatch(/^CON /);
    expect(await t.dial(AMINA, "5*1*musa")).toMatch(/^CON .*Musa/);
    expect(await t.dial(AMINA, "5*1*musa*08030000002")).toBe(`END An ajiye Musa: ${MUSA}`);
    expect(await t.dial(AMINA, "5*2")).toContain(`Musa: ${MUSA}`);
    expect(await t.dial(MUSA, "5*2")).toMatch(/^END Ba ka ajiye/);
  });

  it("rejects bad names and recipients", async () => {
    expect(await t.dial(AMINA, "5*1*m")).toMatch(/^END Suna/);
    expect(await t.dial(AMINA, "5*1*12345")).toMatch(/^END Suna/);
    expect(await t.dial(AMINA, "5*1*musa*hello")).toMatch(/^END /);
    expect(t.store.contacts(AMINA)).toHaveLength(0);
  });

  it("pays a contact by name or by its number in the list", async () => {
    await t.dial(AMINA, "5*1*Musa*08030000002");
    await t.dial(AMINA, "5*1*shago*shop@example.com");
    expect(await t.dial(AMINA, "1")).toMatch(/^CON .*1\. Musa\n2\. Shago/s);
    expect(await t.dial(AMINA, "1*MUSA*1000", "n")).toContain(`zuwa Musa (${MUSA})`);
    await t.dial(AMINA, "1*MUSA*1000*1234", "n");
    await t.dial(AMINA, "1*2*500", "i");
    await t.dial(AMINA, "1*2*500*1234", "i");
    expect(t.sent.map((s) => s.recipient)).toEqual(["musa@example.com", "shop@example.com"]);
    expect(t.texts.some((m) => m.phone === MUSA)).toBe(true);
  });

  it("deletes a contact", async () => {
    await t.dial(AMINA, "5*1*musa*08030000002");
    expect(await t.dial(AMINA, "5*3")).toMatch(/^CON .*1\. Musa/s);
    expect(await t.dial(AMINA, "5*3*1")).toBe("END An goge Musa.");
    expect(await t.dial(AMINA, "1*musa")).toMatch(/^END /);
  });

  it("stops at the contact limit", async () => {
    const letters = "abcdefghijklmnopqrstuvwxyz";
    for (let i = 0; i < 20; i++) await t.dial(AMINA, `5*1*aboki ${letters[i]}*08030000002`);
    expect(await t.dial(AMINA, "5*1*karshe*08030000002")).toMatch(/^END .*cika/);
    expect(await t.dial(AMINA, "5*1*aboki a*shop@example.com")).toMatch(/^END An ajiye/);
  });
});

describe("USSD: sign-up with a managed wallet", () => {
  const uri = (n: string) => `nostr+walletconnect://${n.repeat(64)}?relay=wss://relay.example.com&secret=${"b".repeat(64)}`;
  const provider = (): WalletProvider => {
    const uris = [uri("c"), uri("d")];
    return { name: "test", create: async () => ({ nwcUri: uris.shift()!, lnAddress: null }) };
  };

  it("creates a wallet from USSD with a chosen PIN", async () => {
    const t = setup({}, provider());
    expect(await t.dial(AMINA, "")).toMatch(/^CON .*Bude sabon wallet/s);
    expect(await t.dial(AMINA, "1")).toMatch(/^CON .*PIN/);
    expect(await t.dial(AMINA, "1*4826")).toMatch(/^CON /);
    expect(await t.dial(AMINA, "1*4826*4826")).toMatch(/^END An bude wallet/);
    const user = t.store.getUser(AMINA)!;
    expect(await open(user.nwcSealed, "4826", SECRET)).toBe(uri("c"));
    expect(t.texts.at(-1)?.phone).toBe(AMINA);
    expect(await t.dial(AMINA, "")).toMatch(/^CON .*Tura Kudi/s);
  });

  it("rejects weak, malformed and mismatched PINs", async () => {
    const t = setup({}, provider());
    expect(await t.dial(AMINA, "1*1111")).toMatch(/^END .*sauki/);
    expect(await t.dial(AMINA, "1*1234")).toMatch(/^END .*sauki/);
    expect(await t.dial(AMINA, "1*12a4")).toMatch(/^END /);
    expect(await t.dial(AMINA, "1*4826*4827")).toMatch(/^END /);
    expect(t.store.getUser(AMINA)).toBeUndefined();
  });

  it("still offers linking your own wallet", async () => {
    const t = setup({}, provider());
    expect(await t.dial(AMINA, "2")).toMatch(/^END Lambar hadawa: \d{6}/);
  });

  it("reports a provider failure without creating a user", async () => {
    const t = setup({}, { name: "down", create: async () => Promise.reject(new Error("down")) });
    expect(await t.dial(AMINA, "1*4826*4826")).toMatch(/^END Ba a iya bude wallet/);
    expect(t.store.getUser(AMINA)).toBeUndefined();
  });

  it("pays another managed wallet by phone number using an invoice from the recipient", async () => {
    const t = setup({}, provider());
    await t.dial(AMINA, "1*4826*4826");
    await t.dial(MUSA, "1*7391*7391");
    await t.dial(AMINA, "1*08030000002*1000", "p");
    await t.dial(AMINA, "1*08030000002*1000*4826", "p");
    expect(t.sent).toEqual([{ nwcUri: uri("c"), recipient: MUSA, sats: 1100, receiverNwcUri: uri("d") }]);
    expect(t.texts.at(-1)).toMatchObject({ phone: MUSA });
    expect(await t.dial(MUSA, "3")).toContain(MUSA);
  });
});
