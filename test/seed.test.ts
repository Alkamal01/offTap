import { describe, expect, it } from "vitest";
import { createActions, type Wallet } from "../src/actions.js";
import { Store } from "../src/db.js";
import { DEMO_ACCOUNTS, seedDemo } from "../src/seed.js";
import { open } from "../src/vault.js";

describe("demo data", () => {
  it("creates traders with wallets, contacts and a payment history, once", async () => {
    const store = new Store(":memory:");
    let created = 0;
    const paid: string[] = [];
    const provider = {
      name: "test",
      create: async () => ({
        nwcUri: `nostr+walletconnect://${String(++created).repeat(64)}?relay=wss://relay.example.com&secret=${"b".repeat(64)}`,
        lnAddress: null,
      }),
    };
    const wallet: Wallet = {
      quote: async (amountNgn) => ({ amountNgn, sats: amountNgn, ngnPerBtc: 1e8, rateSource: "test" }),
      send: async ({ recipient, quote }) => {
        paid.push(recipient);
        return { ...quote, recipient, paymentHash: "h", preimage: "p", feesPaidSats: 0 };
      },
      balanceSats: async () => 0,
      ngnPerBtc: async () => 1e8,
    };
    const sms = async (phone: string, message: string) => store.addSms(phone, message);
    const actions = createActions({ store, sms, wallet, serverSecret: "s", dailyLimitSats: 100_000 });
    const deps = { store, provider, actions, wallet, serverSecret: "s" };

    expect(await seedDemo(deps)).toBe("seeded");
    const [amina, musa] = DEMO_ACCOUNTS;
    expect(await open(store.getUser(amina!.phone)!.nwcSealed, amina!.pin, "s")).toContain("walletconnect");
    expect(store.contacts(amina!.phone).map((c) => c.name)).toEqual(["aisha", "musa"]);
    expect(paid).toHaveLength(2);
    expect(store.smsFor(musa!.phone).some((m) => m.message.includes("Ka karbi N1,500"))).toBe(true);

    expect(await seedDemo(deps)).toBe("skipped");
    expect(created).toBe(3);
  });
});

describe("public demo alongside real phones", () => {
  const build = async (simulator: boolean | "demo") => {
    const { buildServer } = await import("../src/server.js");
    const store = new Store(":memory:");
    const app = buildServer({ store, serverSecret: "s", logger: false, simulator, provider: null, sms: async () => {}, transcribe: null });
    const post = (url: string, fields: Record<string, string>) =>
      app.inject({
        method: "POST",
        url,
        headers: { "content-type": "application/x-www-form-urlencoded" },
        payload: new URLSearchParams(fields).toString(),
      });
    return { app, store, post };
  };
  const REAL = "+2348051234567";
  const DEMO = "+2348030000042";

  it("lets the simulator act only as practice numbers", async () => {
    const { app, store, post } = await build("demo");
    expect((await post("/sim/ussd", { sessionId: "a", phoneNumber: DEMO, text: "" })).body).toMatch(/^CON /);
    expect((await post("/sim/ussd", { sessionId: "b", phoneNumber: REAL, text: "1" })).body).toMatch(/^END Use a practice/);
    expect(store.phoneForLinkCode("000000")).toBeUndefined();
    store.addSms(REAL, "secret link code");
    expect((await app.inject({ url: `/sim/sms?phone=${encodeURIComponent(REAL)}` })).statusCode).toBe(400);
    expect((await post("/sim/voice", { callId: "c", phone: REAL, action: "start" })).json().expect).toBe("end");
    await app.close();
  });

  it("keeps practice numbers out of the real USSD and voice webhooks", async () => {
    const { app, post } = await build("demo");
    expect((await post("/ussd", { sessionId: "a", phoneNumber: DEMO, text: "" })).statusCode).toBe(403);
    expect((await post("/ussd", { sessionId: "b", phoneNumber: REAL, text: "" })).body).toMatch(/^CON /);
    expect((await post("/voice", { sessionId: "v", isActive: "1", callerNumber: DEMO })).body).not.toContain("<Record");
    await app.close();
  });

  it("has no simulator at all when it is off", async () => {
    const { app, post } = await build(false);
    expect((await app.inject({ url: "/sim" })).statusCode).toBe(404);
    expect((await post("/sim/ussd", { sessionId: "a", phoneNumber: DEMO, text: "" })).statusCode).toBe(404);
    await app.close();
  });
});
