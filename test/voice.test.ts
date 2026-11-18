import { describe, expect, it } from "vitest";
import { parseIntent } from "../src/voice/intent.js";
import { normaliseHausa, parseHausaNumber } from "../src/voice/numbers.js";

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
