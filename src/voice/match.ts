import type { Contact } from "../db.js";

function distance(a: string, b: string): number {
  let previous = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const current = [i];
    for (let j = 1; j <= b.length; j++) {
      current[j] = Math.min(previous[j]! + 1, current[j - 1]! + 1, previous[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    previous = current;
  }
  return previous[b.length]!;
}

const squash = (name: string) => name.toLowerCase().replace(/[^a-z]/g, "");

export function matchContact(contacts: Contact[], spoken: string): Contact | undefined {
  const heard = squash(spoken);
  if (heard.length < 2) return undefined;
  const scored = contacts
    .map((contact) => ({ contact, score: distance(heard, squash(contact.name)) }))
    .sort((a, b) => a.score - b.score);
  const best = scored[0];
  if (!best) return undefined;
  const allowed = best.score === 0 ? 0 : Math.max(1, Math.floor(squash(best.contact.name).length / 4));
  if (best.score > allowed) return undefined;
  if (scored[1] && scored[1].score === best.score) return undefined;
  return best.contact;
}
