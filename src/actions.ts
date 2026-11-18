import { displayName, pickContact } from "./contacts.js";
import type { Store, User } from "./db.js";
import { isLightningAddress } from "./lightning/lnaddress.js";
import type { Quote, Receipt } from "./payments.js";
import { normalisePhone } from "./phone.js";
import { satsToNgn } from "./rates.js";
import type { SmsSender } from "./sms.js";
import { msg } from "./ussd/messages.js";
import { isValidPin, open, openForServer, WrongPinError } from "./vault.js";

export type Wallet = {
  quote(amountNgn: number): Promise<Quote>;
  send(args: {
    nwcUri: string;
    recipient: string;
    receiverNwcUri?: string;
    amountNgn: number;
    quote: Quote;
  }): Promise<Receipt>;
  balanceSats(nwcUri: string): Promise<number>;
  ngnPerBtc(): Promise<number>;
};

export type Recipient = { address?: string; label: string; phone?: string; managedSealed?: Uint8Array };
export type Unlocked = { nwcUri: string } | { failure: "locked" } | { failure: "wrong"; left: number };

export type ActionDeps = {
  store: Store;
  sms: SmsSender;
  wallet: Wallet;
  serverSecret: string;
  dailyLimitSats: number;
  now?: () => number;
};

const DAY_MS = 24 * 60 * 60 * 1000;

function failureReason(err: unknown): string {
  const code = (err as { code?: string }).code;
  if (code === "INSUFFICIENT_BALANCE") return msg.reasonInsufficient;
  if (code === "QUOTA_EXCEEDED") return msg.reasonBudget;
  return msg.reasonGeneric;
}

export function createActions(deps: ActionDeps) {
  const { store, sms, wallet } = deps;
  const now = deps.now ?? Date.now;

  function resolveDirect(input: string): Recipient | "invalid" | "unregistered" {
    const value = input.trim();
    if (isLightningAddress(value)) return { address: value.toLowerCase(), label: value.toLowerCase() };
    const phone = normalisePhone(value);
    if (!phone) return "invalid";
    const user = store.getUser(phone);
    if (user?.managedSealed) return { label: phone, phone, managedSealed: user.managedSealed };
    if (!user?.lnAddress) return "unregistered";
    return { address: user.lnAddress, label: phone, phone };
  }

  function resolveRecipient(owner: string, input: string): Recipient | "invalid" | "unregistered" {
    const direct = resolveDirect(input);
    if (direct !== "invalid") return direct;
    const contact = pickContact(store.contacts(owner), input);
    if (!contact) return "invalid";
    const saved = resolveDirect(contact.recipient);
    if (typeof saved === "string") return saved;
    return { ...saved, label: `${displayName(contact.name)} (${saved.label})` };
  }

  async function unlock(user: User, pin: string): Promise<Unlocked> {
    if (store.isLocked(user, now())) return { failure: "locked" };
    try {
      if (!isValidPin(pin)) throw new WrongPinError();
      const nwcUri = await open(user.nwcSealed, pin, deps.serverSecret);
      if (user.failedPins > 0) store.clearWrongPins(user.phone);
      return { nwcUri };
    } catch (err) {
      if (!(err instanceof WrongPinError)) throw err;
      const left = store.recordWrongPin(user.phone, now());
      return left === 0 ? { failure: "locked" } : { failure: "wrong", left };
    }
  }

  function pay(user: User, nwcUri: string, recipient: Recipient, quote: Quote): { background: Promise<void> } | "dailyLimit" {
    if (store.satsSpentSince(user.phone, now() - DAY_MS) + quote.sats > deps.dailyLimitSats) return "dailyLimit";
    const paymentId = store.createPayment(
      { phone: user.phone, recipient: recipient.label, amountNgn: quote.amountNgn, sats: quote.sats },
      now(),
    );
    const background = (async () => {
      try {
        const receiverNwcUri = recipient.managedSealed
          ? await openForServer(recipient.managedSealed, deps.serverSecret)
          : undefined;
        const receipt = await wallet.send({
          nwcUri,
          recipient: recipient.address ?? recipient.label,
          ...(receiverNwcUri ? { receiverNwcUri } : {}),
          amountNgn: quote.amountNgn,
          quote,
        });
        store.finishPayment(paymentId, "paid", { paymentHash: receipt.paymentHash, feesSats: receipt.feesPaidSats });
        await sms(user.phone, msg.smsPaid(quote.amountNgn, quote.sats, recipient.label, receipt.feesPaidSats));
        if (recipient.phone) await sms(recipient.phone, msg.smsReceived(quote.amountNgn, quote.sats, user.phone));
      } catch (err) {
        store.finishPayment(paymentId, "failed", { error: (err as { code?: string }).code ?? "ERROR" });
        await sms(user.phone, msg.smsFailed(quote.amountNgn, recipient.label, failureReason(err)));
      }
    })();
    return { background };
  }

  async function balance(nwcUri: string): Promise<{ sats: number; ngn: number }> {
    const [sats, ngnPerBtc] = await Promise.all([wallet.balanceSats(nwcUri), wallet.ngnPerBtc()]);
    return { sats, ngn: satsToNgn(sats, ngnPerBtc) };
  }

  return { resolveRecipient, unlock, pay, balance };
}

export type Actions = ReturnType<typeof createActions>;
