import type { Contact } from "./db.js";

export function normaliseContactName(input: string): string | undefined {
  const name = input.trim().replace(/\s+/g, " ").toLowerCase();
  return /^[a-z][a-z' ]{1,14}$/.test(name) ? name : undefined;
}

export function displayName(name: string): string {
  return name.replace(/(^|\s)[a-z]/g, (letter) => letter.toUpperCase());
}

export function pickContact(contacts: Contact[], input: string): Contact | undefined {
  const value = input.trim();
  if (/^\d{1,2}$/.test(value)) return contacts[Number(value) - 1];
  const name = normaliseContactName(value);
  return name ? contacts.find((c) => c.name === name) : undefined;
}
