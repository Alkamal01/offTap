const ONES: Record<string, number> = {
  daya: 1,
  guda: 1,
  biyu: 2,
  uku: 3,
  hudu: 4,
  biyar: 5,
  shida: 6,
  bakwai: 7,
  takwas: 8,
  tara: 9,
};

const TENS: Record<string, number> = {
  ashirin: 20,
  talatin: 30,
  arbain: 40,
  hamsin: 50,
  sittin: 60,
  sabain: 70,
  tamanin: 80,
  casain: 90,
  tisain: 90,
};

const UNITS: Record<string, number> = { dari: 100, dubu: 1000, miliyan: 1_000_000 };

export function normaliseHausa(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/ɗ/g, "d")
    .replace(/ɓ/g, "b")
    .replace(/ƙ/g, "k")
    .replace(/['’ʼ`]/g, "")
    .replace(/(\d),(?=\d{3})/g, "$1")
    .replace(/[^a-z0-9@.+\s]/g, " ")
    .replace(/\.(?=\s|$)/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

export function isNumberWord(token: string): boolean {
  return (
    token in ONES || token in TENS || token in UNITS || token === "goma" || token === "sha" || /^\d+(\.\d+)?$/.test(token)
  );
}

type Parsed = { value: number; next: number } | undefined;

function small(tokens: string[], i: number): Parsed {
  const token = tokens[i];
  if (token === undefined) return undefined;
  if (/^\d+$/.test(token)) return { value: Number(token), next: i + 1 };
  if (token in ONES) return { value: ONES[token]!, next: i + 1 };
  if (token === "sha" && tokens[i + 1]! in ONES) return { value: 10 + ONES[tokens[i + 1]!]!, next: i + 2 };
  if (token === "goma") {
    if (tokens[i + 1] === "sha" && tokens[i + 2]! in ONES) return { value: 10 + ONES[tokens[i + 2]!]!, next: i + 3 };
    return { value: 10, next: i + 1 };
  }
  if (token in TENS) {
    if (tokens[i + 1] === "da" && tokens[i + 2]! in ONES) return { value: TENS[token]! + ONES[tokens[i + 2]!]!, next: i + 3 };
    return { value: TENS[token]!, next: i + 1 };
  }
  return undefined;
}

function hundreds(tokens: string[], i: number): Parsed {
  if (tokens[i] !== "dari") return undefined;
  const count = tokens[i + 1]! in ONES ? ONES[tokens[i + 1]!]! : undefined;
  let value = (count ?? 1) * 100;
  let next = count === undefined ? i + 1 : i + 2;
  if (tokens[next] === "da") {
    const rest = small(tokens, next + 1);
    if (rest && tokens[next + 1]! in TENS) {
      value += rest.value;
      next = rest.next;
    }
  }
  return { value, next };
}

function group(tokens: string[], i: number): { value: number; next: number; unit: number } | undefined {
  const token = tokens[i];
  if (token === "dubu" || token === "miliyan") {
    const unit = UNITS[token]!;
    const count = (token === "dubu" ? hundreds(tokens, i + 1) : undefined) ?? small(tokens, i + 1);
    return count ? { value: count.value * unit, next: count.next, unit } : { value: unit, next: i + 1, unit };
  }
  if (token === "dari") {
    const count = tokens[i + 1]! in ONES ? ONES[tokens[i + 1]!]! : undefined;
    return { value: (count ?? 1) * 100, next: count === undefined ? i + 1 : i + 2, unit: 100 };
  }
  const value = small(tokens, i);
  if (!value) return undefined;
  const following = tokens[value.next];
  if (following === "dubu" || following === "miliyan") {
    return { value: value.value * UNITS[following]!, next: value.next + 1, unit: UNITS[following]! };
  }
  return { ...value, unit: 1 };
}

export function parseHausaNumber(tokens: string[]): number | undefined {
  if (tokens.length === 1 && /^\d+(\.\d+)?$/.test(tokens[0]!)) return Number(tokens[0]);
  let total = 0;
  let i = 0;
  let lastUnit = 0;
  while (i < tokens.length) {
    if (i > 0) {
      if (tokens[i] !== "da") return undefined;
      i += 1;
      if (tokens[i] === "rabi" && lastUnit > 1) {
        total += lastUnit / 2;
        i += 1;
        continue;
      }
    }
    const part = group(tokens, i);
    if (!part) return undefined;
    total += part.value;
    lastUnit = part.unit;
    i = part.next;
  }
  return total > 0 ? total : undefined;
}
