import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Store } from "../src/db.js";
import type { WalletSummary } from "../src/lightning/nwc.js";
import { normalisePhone } from "../src/phone.js";
import { buildServer } from "../src/server.js";
import { open, seal, WrongPinError } from "../src/vault.js";

const SECRET = "test-secret";
const NWC = `nostr+walletconnect://${"a".repeat(64)}?relay=wss://relay.example.com&secret=${"b".repeat(64)}`;
const PHONE = "+2348030000001";

describe("vault", () => {
  it("opens with the right PIN and server secret only", async () => {
    const sealed = await seal(NWC, "1234", SECRET);
    expect(await open(sealed, "1234", SECRET)).toBe(NWC);
    await expect(open(sealed, "1235", SECRET)).rejects.toBeInstanceOf(WrongPinError);
    await expect(open(sealed, "1234", "other-secret")).rejects.toBeInstanceOf(WrongPinError);
    expect(sealed.toString("latin1")).not.toContain("walletconnect");
  });
});

describe("phone numbers", () => {
  it("normalises Nigerian formats to E.164", () => {
    expect(normalisePhone("08030000001")).toBe(PHONE);
    expect(normalisePhone("2348030000001")).toBe(PHONE);
    expect(normalisePhone("+234 803 000 0001")).toBe(PHONE);
    expect(normalisePhone("12345")).toBeUndefined();
    expect(normalisePhone("musa")).toBeUndefined();
  });
});

describe("wallet linking", () => {
  let store: Store;
  let app: ReturnType<typeof buildServer>;
  let summary: WalletSummary;

  const post = (fields: Record<string, string>) =>
    app.inject({
      method: "POST",
      url: "/link",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      payload: new URLSearchParams(fields).toString(),
    });

  beforeEach(() => {
    store = new Store(":memory:");
    summary = { alias: "test", network: "mainnet", canPay: true, canReadBalance: true, budgetSats: 50_000, budgetRenewal: "daily" };
    app = buildServer({
      store,
      serverSecret: SECRET,
      logger: false,
      simulator: true,
      sms: async (phone, message) => store.addSms(phone, message),
      describeWallet: async () => summary,
    });
  });
  afterEach(() => app.close());

  it("links a wallet to the phone that requested the code", async () => {
    const code = store.createLinkCode(PHONE);
    const res = await post({ code, nwc: NWC, pin: "1234", pin2: "1234", lnAddress: "Amina@Example.com" });
    expect(res.statusCode).toBe(200);
    const user = store.getUser(PHONE);
    expect(user?.lnAddress).toBe("amina@example.com");
    expect(await open(user!.nwcSealed, "1234", SECRET)).toBe(NWC);
    expect(store.phoneForLinkCode(code)).toBeUndefined();
    expect(res.body).not.toContain("walletconnect://a");
  });

  it("rejects wrong codes, bad input and connections that cannot pay", async () => {
    const code = store.createLinkCode(PHONE);
    expect((await post({ code: "000000", nwc: NWC, pin: "1234", pin2: "1234" })).statusCode).toBe(400);
    expect((await post({ code, nwc: "nonsense", pin: "1234", pin2: "1234" })).statusCode).toBe(400);
    expect((await post({ code, nwc: NWC, pin: "12", pin2: "12" })).statusCode).toBe(400);
    expect((await post({ code, nwc: NWC, pin: "1234", pin2: "4321" })).statusCode).toBe(400);
    summary = { ...summary, canPay: false };
    expect((await post({ code, nwc: NWC, pin: "1234", pin2: "1234" })).statusCode).toBe(400);
    expect(store.getUser(PHONE)).toBeUndefined();
  });

  it("expires link codes", () => {
    const code = store.createLinkCode(PHONE, 1000);
    expect(store.phoneForLinkCode(code, 1000 + 16 * 60 * 1000)).toBeUndefined();
  });

  it("serves USSD over HTTP in Africa's Talking format", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/ussd",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      payload: new URLSearchParams({ sessionId: "x", serviceCode: "*384#", phoneNumber: PHONE, text: "" }).toString(),
    });
    expect(res.headers["content-type"]).toContain("text/plain");
    expect(res.body).toMatch(/^CON /);
  });
});
