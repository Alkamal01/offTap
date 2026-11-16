export function normalisePhone(input: string): string | undefined {
  const digits = input.replace(/[\s\-()]/g, "");
  if (/^\+\d{10,15}$/.test(digits)) return digits;
  if (/^0[789]\d{9}$/.test(digits)) return `+234${digits.slice(1)}`;
  if (/^234[789]\d{9}$/.test(digits)) return `+${digits}`;
  return undefined;
}

export function maskPhone(phone: string): string {
  return phone.length < 8 ? phone : `${phone.slice(0, 6)}***${phone.slice(-3)}`;
}
