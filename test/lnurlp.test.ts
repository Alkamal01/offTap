import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { Store } from "../src/db.js";
import { payAddress } from "../src/lightning/lnurlp.js";
import { buildServer } from "../src/server.js";
import { seal, sealForServer } from "../src/vault.js";

const SECRET = "s";
const NWC = `nostr+walletconnect://${"a".repeat(64)}?relay=wss://relay.example.com&secret=${"b".repeat(64)}`;
const AMINA = "+2348051234567";
const OWN = "+2348051234568";

async function build() {
  const store = new Store(":memory:");
  const made: { nwcUri: string; sats: number; hash?: string }[] = [];
  let settled = false;
  store.saveUser(AMINA, await seal(NWC, "4826", SECRET), null, await sealForServer(NWC, SECRET));
  store.saveUser(OWN, await seal(NWC, "4826", SECRET), "own@example.com");
  const app = buildServer({
    store,
    serverSecret: SECRET,
    logger: false,
    simulator: false,
    provider: null,
    transcribe: null,
    publicUrl: "https://offtap.test",
    sms: async (phone, message) => store.addSms(phone, message),
    wallet: {
      quote: async (amountNgn) => ({ amountNgn, sats: amountNgn, ngnPerBtc: 1e8, rateSource: "test" }),
      send: async () => Promise.reject(new Error("unused")),
      balanceSats: async () => 0,
      ngnPerBtc: async () => 90_000_000,
    },
    invoices: {
      makeInvoice: async (nwcUri, sats, _description, hash) => {
        made.push({ nwcUri, sats, ...(hash ? { hash } : {}) });
        return { invoice: "lnbc1test", paymentHash: "ph" };
      },
      invoiceSettled: async () => settled,
      watchEveryMs: 10,
    },
  });
  return { app, store, made, settle: () => (settled = true) };
}

describe("Lightning address for easy wallets", () => {
  it("lets any Lightning wallet pay a phone number and texts the trader when it lands", async () => {
    const { app, store, made, settle } = await build();
    expect(payAddress(AMINA, "https://offtap.test")).toBe("2348051234567@offtap.test");

    const info = (await app.inject({ url: "/.well-known/lnurlp/2348051234567" })).json();
    expect(info).toMatchObject({ tag: "payRequest", minSendable: 1000, callback: "https://offtap.test/lnurlp/2348051234567/callback" });
    expect(info.metadata).toContain("2348051234567@offtap.test");

    const paid = (await app.inject({ url: "/lnurlp/2348051234567/callback?amount=2000000" })).json();
    expect(paid.pr).toBe("lnbc1test");
    expect(made).toEqual([{ nwcUri: NWC, sats: 2000, hash: createHash("sha256").update(info.metadata).digest("hex") }]);

    await new Promise((resolve) => setTimeout(resolve, 40));
    expect(store.smsFor(AMINA)).toHaveLength(0);
    settle();
    await new Promise((resolve) => setTimeout(resolve, 40));
    expect(store.smsFor(AMINA)[0]?.message).toContain("Ka karbi 2,000 sats (kimanin N1,800)");
    await app.close();
  });

  it("also answers to the local 080 form", async () => {
    const { app } = await build();
    expect((await app.inject({ url: "/.well-known/lnurlp/08051234567" })).statusCode).toBe(200);
    await app.close();
  });

  it("refuses unknown numbers, own-wallet users and bad amounts", async () => {
    const { app, made } = await build();
    expect((await app.inject({ url: "/.well-known/lnurlp/2348059999999" })).statusCode).toBe(404);
    expect((await app.inject({ url: "/.well-known/lnurlp/2348051234568" })).statusCode).toBe(404);
    expect((await app.inject({ url: "/.well-known/lnurlp/amina" })).statusCode).toBe(404);
    for (const amount of ["", "abc", "500", "1500", "99999999999"]) {
      expect((await app.inject({ url: `/lnurlp/2348051234567/callback?amount=${amount}` })).json().status).toBe("ERROR");
    }
    expect(made).toHaveLength(0);
    await app.close();
  });

  it("limits how many invoices one number can be asked for", async () => {
    const { app } = await build();
    let last = 200;
    for (let i = 0; i < 21; i++) last = (await app.inject({ url: "/lnurlp/2348051234567/callback?amount=1000" })).statusCode;
    expect(last).toBe(429);
    await app.close();
  });
});
