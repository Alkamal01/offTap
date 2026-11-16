function intFromEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive whole number`);
  }
  return value;
}

export const config = {
  port: intFromEnv("PORT", 3000),
  maxPaymentSats: intFromEnv("MAX_PAYMENT_SATS", 50_000),
};
