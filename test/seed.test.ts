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
