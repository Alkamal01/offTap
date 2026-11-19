import type { Actions, Recipient, Wallet } from "../actions.js";
import { displayName } from "../contacts.js";
import type { Contact, Store } from "../db.js";
import { PaymentError, type Quote } from "../payments.js";
import { normalisePhone } from "../phone.js";
import { parseIntent, spokenAmount, type Intent } from "./intent.js";
import { matchContact } from "./match.js";
import { say } from "./messages.js";
import { normaliseHausa, parseHausaNumber } from "./numbers.js";
import type { Understander } from "./understand.js";

export type VoiceStep = { say: string; expect: "speech" | "pin" | "end"; background?: Promise<void> };

export type VoiceDeps = {
  store: Store;
  actions: Actions;
  wallet: Wallet;
  ussdCode: string;
  understand?: Understander;
  onUnderstandError?: (err: Error) => void;
  now?: () => number;
};

type Target = { name: string; recipient: Recipient };
type Pending = { kind: "balance" } | { kind: "send"; target: Target; quote: Quote };
type Call = { phone: string; tries: number; amountNgn?: number; target?: Target; pending?: Pending; at: number };

const MAX_TRIES = 4;
const CALL_MS = 10 * 60 * 1000;

export function createVoiceCalls(deps: VoiceDeps) {
  const { store, actions, wallet } = deps;
  const now = deps.now ?? Date.now;
  const calls = new Map<string, Call>();

  const finish = (callId: string, text: string, background?: Promise<void>): VoiceStep => {
    calls.delete(callId);
    return background ? { say: text, expect: "end", background } : { say: text, expect: "end" };
  };

  function retry(callId: string, call: Call, text: string): VoiceStep {
    call.tries += 1;
    if (call.tries >= MAX_TRIES) return finish(callId, say.giveUp(deps.ussdCode));
    return { say: text, expect: "speech" };
  }

  async function interpret(transcript: string, contacts: Contact[]): Promise<Intent> {
    const byRules = parseIntent(transcript);
    const clear =
      byRules.kind === "balance" ||
      (byRules.kind === "send" &&
        byRules.amountNgn !== undefined &&
        byRules.recipient !== undefined &&
        matchContact(contacts, byRules.recipient) !== undefined);
    if (clear || !deps.understand || transcript.trim() === "") return byRules;

    let byModel: Intent;
    try {
      byModel = await deps.understand(transcript, contacts.map((c) => displayName(c.name)));
    } catch (err) {
      deps.onUnderstandError?.(err as Error);
      return byRules;
    }
    if (byModel.kind !== "send") return byRules.kind === "unknown" ? byModel : byRules;
    const amountNgn = spokenAmount(transcript) ?? byModel.amountNgn;
    const recipient = byModel.recipient ?? (byRules.kind === "send" ? byRules.recipient : undefined);
    return {
      kind: "send",
      ...(amountNgn !== undefined ? { amountNgn } : {}),
      ...(recipient !== undefined ? { recipient } : {}),
    };
  }

  function start(callId: string, phoneNumber: string): VoiceStep {
    const cutoff = now() - CALL_MS;
    for (const [id, call] of calls) if (call.at < cutoff) calls.delete(id);
    const phone = normalisePhone(phoneNumber);
    const user = phone ? store.getUser(phone) : undefined;
    if (!phone || !user) return { say: say.noWallet(deps.ussdCode), expect: "end" };
    if (store.isLocked(user, now())) return { say: say.locked, expect: "end" };
    calls.set(callId, { phone, tries: 0, at: now() });
    return { say: say.welcome, expect: "speech" };
  }

  async function heard(callId: string, transcript: string): Promise<VoiceStep> {
    const call = calls.get(callId);
    if (!call) return { say: say.error, expect: "end" };
    if (call.pending) return { say: say.askPin, expect: "pin" };

    const contacts = store.contacts(call.phone);
    const intent = await interpret(transcript, contacts);
    let amountNgn = call.amountNgn;
    let spokenName: string | undefined;

    if (intent.kind === "balance") {
      call.pending = { kind: "balance" };
      return { say: say.askPin, expect: "pin" };
    }
    if (intent.kind === "send") {
      amountNgn = intent.amountNgn ?? amountNgn;
      spokenName = intent.recipient;
    } else {
      const tokens = normaliseHausa(transcript).filter((token) => token !== "naira");
      const number = parseHausaNumber(tokens);
      const inProgress = call.amountNgn !== undefined || call.target !== undefined;
      if (number !== undefined) amountNgn = number;
      else if (inProgress && tokens.length > 0) spokenName = tokens.join(" ");
      else return retry(callId, call, say.notUnderstood);
    }

    if (amountNgn !== undefined && amountNgn !== call.amountNgn) {
      call.amountNgn = amountNgn;
      call.tries = 0;
    }
    if (spokenName) {
      const contact = matchContact(contacts, spokenName);
      if (!contact) return retry(callId, call, say.unknownContact);
      const recipient = actions.resolveRecipient(call.phone, contact.name);
      if (typeof recipient === "string") return finish(callId, say.notRegistered);
      if (call.target?.name !== displayName(contact.name)) call.tries = 0;
      call.target = { name: displayName(contact.name), recipient };
    }

    if (!call.target) return retry(callId, call, say.askRecipient);
    if (call.amountNgn === undefined) return retry(callId, call, say.askAmount(call.target.name));

    try {
      const quote = await wallet.quote(call.amountNgn);
      call.pending = { kind: "send", target: call.target, quote };
      return { say: say.confirm(quote.amountNgn, call.target.name), expect: "pin" };
    } catch (err) {
      if (err instanceof PaymentError) return finish(callId, say.tooLarge);
      throw err;
    }
  }

  async function digits(callId: string, pin: string): Promise<VoiceStep> {
    const call = calls.get(callId);
    const user = call ? store.getUser(call.phone) : undefined;
    if (!call || !user || !call.pending) return finish(callId, say.error);

    const unlocked = await actions.unlock(user, pin.replace(/\D/g, ""));
    if ("failure" in unlocked) {
      if (unlocked.failure === "locked") return finish(callId, say.locked);
      return { say: say.wrongPin(unlocked.left), expect: "pin" };
    }

    const { pending } = call;
    if (pending.kind === "balance") {
      try {
        const result = await actions.balance(unlocked.nwcUri);
        return finish(callId, say.balance(result.sats, result.ngn));
      } catch {
        return finish(callId, say.balanceFailed);
      }
    }
    const started = actions.pay(user, unlocked.nwcUri, pending.target.recipient, pending.quote);
    if (started === "dailyLimit") return finish(callId, say.dailyLimit);
    return finish(callId, say.sending, started.background);
  }

  function hangup(callId: string): void {
    calls.delete(callId);
  }

  const active = (callId: string) => calls.has(callId);

  function names(phoneNumber: string): string[] {
    const phone = normalisePhone(phoneNumber);
    return phone ? store.contacts(phone).map((c) => displayName(c.name)) : [];
  }

  return { start, heard, digits, hangup, active, names };
}

export type VoiceCalls = ReturnType<typeof createVoiceCalls>;
