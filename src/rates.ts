const SATS_PER_BTC = 100_000_000;
const CACHE_MS = 60_000;
const FETCH_TIMEOUT_MS = 8_000;

export type Rate = { ngnPerBtc: number; source: string; fetchedAt: number };

type RateSource = { name: string; fetch: () => Promise<number> };

async function getJson(url: string): Promise<unknown> {
  const res = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

function asRate(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    throw new Error("rate missing from response");
  }
  return value;
}

const sources: RateSource[] = [
  {
    name: "yadio",
    fetch: async () => {
      const body = (await getJson("https://api.yadio.io/rate/NGN/BTC")) as { rate?: unknown };
      return asRate(body.rate);
    },
  },
  {
    name: "coingecko",
    fetch: async () => {
      const body = (await getJson(
        "https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=ngn",
      )) as { bitcoin?: { ngn?: unknown } };
      return asRate(body.bitcoin?.ngn);
    },
  },
];

let cached: Rate | undefined;

export async function getRate(now: number = Date.now()): Promise<Rate> {
  if (cached && now - cached.fetchedAt < CACHE_MS) return cached;

  const errors: string[] = [];
  for (const source of sources) {
    try {
      cached = { ngnPerBtc: await source.fetch(), source: source.name, fetchedAt: now };
      return cached;
    } catch (err) {
      errors.push(`${source.name}: ${(err as Error).message}`);
    }
  }
  throw new Error(`Could not fetch BTC/NGN rate (${errors.join("; ")})`);
}

export function ngnToSats(amountNgn: number, ngnPerBtc: number): number {
  if (!Number.isFinite(amountNgn) || amountNgn <= 0) throw new Error("Amount must be positive");
  const exact = (amountNgn * SATS_PER_BTC) / ngnPerBtc;
  return Math.ceil(Number(exact.toFixed(6)));
}

export function satsToNgn(sats: number, ngnPerBtc: number): number {
  return Math.floor((sats / SATS_PER_BTC) * ngnPerBtc);
}

export function clearRateCache(): void {
  cached = undefined;
}
