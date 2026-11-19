import { isNumberWord, normaliseHausa, parseHausaNumber } from "./numbers.js";

export type Intent =
  | { kind: "send"; amountNgn?: number; recipient?: string }
  | { kind: "balance" }
  | { kind: "unknown" };

const SEND_WORDS = new Set(["tura", "aika", "biya", "turawa", "aikawa", "send", "pay", "chura", "tora", "dura", "aiko"]);
const BALANCE_WORDS = new Set(["balance", "balans", "nawa", "saura", "ragowa"]);
const TO_WORDS = new Set(["zuwa", "wa", "ga", "to"]);
const FILLER = new Set([
  "naira",
  "kudi",
  "kudin",
  "ina",
  "so",
  "in",
  "na",
  "ka",
  "don",
  "allah",
  "ne",
  "ce",
  "mai",
  "malam",
  "sats",
  "n",
  "a",
  "da",
]);

function amountSpan(tokens: string[]): { from: number; to: number } | undefined {
  const from = tokens.findIndex(isNumberWord);
  if (from < 0) return undefined;
  let to = from + 1;
  while (to < tokens.length) {
    const token = tokens[to]!;
    if (isNumberWord(token)) to += 1;
    else if (token === "da" && (isNumberWord(tokens[to + 1] ?? "") || tokens[to + 1] === "rabi")) to += 2;
    else break;
  }
  return { from, to };
}

export function spokenAmount(text: string): number | undefined {
  const tokens = normaliseHausa(text).map((token) => token.replace(/^n(?=\d)/, ""));
  const span = amountSpan(tokens);
  return span ? parseHausaNumber(tokens.slice(span.from, span.to)) : undefined;
}

export function parseIntent(text: string): Intent {
  const tokens = normaliseHausa(text).map((token) => token.replace(/^n(?=\d)/, ""));
  if (tokens.length === 0) return { kind: "unknown" };

  const span = amountSpan(tokens);
  const amountNgn = span ? parseHausaNumber(tokens.slice(span.from, span.to)) : undefined;
  const isSend = tokens.some((token) => SEND_WORDS.has(token));

  if (!isSend && amountNgn === undefined) {
    if (tokens.some((token) => BALANCE_WORDS.has(token)) || tokens.join(" ").includes("duba kudi")) return { kind: "balance" };
    return { kind: "unknown" };
  }
  if (!isSend && !tokens.some((token) => TO_WORDS.has(token))) return { kind: "unknown" };

  const outside = tokens.map((token, i) => (span && i >= span.from && i < span.to ? undefined : token));
  const toIndex = outside.findIndex((token) => token !== undefined && TO_WORDS.has(token));
  const verbIndex = outside.findIndex((token) => token !== undefined && SEND_WORDS.has(token));
  const start = toIndex >= 0 ? toIndex + 1 : verbIndex + 1;
  const name: string[] = [];
  for (let i = start; i < outside.length; i++) {
    const token = outside[i];
    if (token === undefined) {
      if (name.length > 0) break;
      continue;
    }
    if (FILLER.has(token) || TO_WORDS.has(token) || SEND_WORDS.has(token)) {
      if (name.length > 0) break;
      continue;
    }
    name.push(token);
  }

  const recipient = name.join(" ");
  return {
    kind: "send",
    ...(amountNgn !== undefined ? { amountNgn } : {}),
    ...(recipient ? { recipient } : {}),
  };
}
