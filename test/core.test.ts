import { describe, expect, it } from "vitest";
import { isLightningAddress } from "../src/lightning/lnaddress.js";
import { isNwcUri } from "../src/lightning/nwc.js";
import { ngnToSats, satsToNgn } from "../src/rates.js";

describe("rates", () => {
  const ngnPerBtc = 90_000_000;

  it("converts naira to sats, rounding up", () => {
    expect(ngnToSats(900, ngnPerBtc)).toBe(1000);
    expect(ngnToSats(5000, ngnPerBtc)).toBe(5556);
  });

  it("converts sats to naira, rounding down", () => {
    expect(satsToNgn(1000, ngnPerBtc)).toBe(900);
  });

  it("rejects zero, negative and non-numeric amounts", () => {
    expect(() => ngnToSats(0, ngnPerBtc)).toThrow();
    expect(() => ngnToSats(-5, ngnPerBtc)).toThrow();
    expect(() => ngnToSats(Number.NaN, ngnPerBtc)).toThrow();
  });
});

describe("input validation", () => {
  it("recognises Lightning Addresses", () => {
    expect(isLightningAddress("musa@example.com")).toBe(true);
    expect(isLightningAddress("musa")).toBe(false);
    expect(isLightningAddress("musa@")).toBe(false);
    expect(isLightningAddress("https://example.com")).toBe(false);
  });

  it("recognises NWC connection strings", () => {
    const pubkey = "a".repeat(64);
    const secret = "b".repeat(64);
    expect(isNwcUri(`nostr+walletconnect://${pubkey}?relay=wss://relay.example.com&secret=${secret}`)).toBe(true);
    expect(isNwcUri(`nostr+walletconnect://${pubkey}?relay=wss://relay.example.com`)).toBe(false);
    expect(isNwcUri("not a uri")).toBe(false);
    expect(isNwcUri("")).toBe(false);
  });
});
