import type { Store, User } from "../db.js";
import { isLightningAddress } from "../lightning/lnaddress.js";
import { PaymentError, type Quote, type Receipt } from "../payments.js";
import { normalisePhone } from "../phone.js";
import { satsToNgn } from "../rates.js";
import type { SmsSender } from "../sms.js";
import { isValidPin, isWeakPin, open, openForServer, seal, sealForServer, WrongPinError } from "../vault.js";
import type { WalletProvider } from "../wallets/provider.js";
import { msg } from "./messages.js";

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

export type UssdDeps = {
  store: Store;
  sms: SmsSender;
  wallet: Wallet;
  provider?: WalletProvider;
  serverSecret: string;
  publicUrl: string;
  ussdCode: string;
  dailyLimitSats: number;
  maxPaymentSats: number;
  balanceWaitMs?: number;
  now?: () => number;
};

export type UssdRequest = { sessionId: string; phoneNumber: string; text: string };
export type UssdResult = { reply: string; background?: Promise<void> };

type Recipient = { address?: string; label: string; phone?: string; managedSealed?: Uint8Array };

const DAY_MS = 24 * 60 * 60 * 1000;
const SESSION_MS = 5 * 60 * 1000;

const con = (text: string): UssdResult => ({ reply: `CON ${text}` });
const end = (text: string, background?: Promise<void>): UssdResult =>
  background ? { reply: `END ${text}`, background } : { reply: `END ${text}` };

function failureReason(err: unknown): string {
  const code = (err as { code?: string }).code;
  if (code === "INSUFFICIENT_BALANCE") return msg.reasonInsufficient;
  if (code === "QUOTA_EXCEEDED") return msg.reasonBudget;
  return msg.reasonGeneric;
}

export function createUssdHandler(deps: UssdDeps) {
  const { store, sms, wallet } = deps;
  const now = deps.now ?? Date.now;
  const quotes = new Map<string, { quote: Quote; at: number }>();

  function rememberQuote(sessionId: string, quote: Quote): void {
    const cutoff = now() - SESSION_MS;
    for (const [id, entry] of quotes) if (entry.at < cutoff) quotes.delete(id);
    quotes.set(sessionId, { quote, at: now() });
  }

  function resolveRecipient(input: string): Recipient | "invalid" | "unregistered" {
    const value = input.trim();
    if (isLightningAddress(value)) return { address: value.toLowerCase(), label: value.toLowerCase() };
    const phone = normalisePhone(value);
    if (!phone) return "invalid";
    const user = store.getUser(phone);
    if (user?.managedSealed) return { label: phone, phone, managedSealed: user.managedSealed };
    if (!user?.lnAddress) return "unregistered";
    return { address: user.lnAddress, label: phone, phone };
  }

  async function unlock(user: User, pin: string): Promise<{ nwcUri: string } | UssdResult> {
    if (store.isLocked(user, now())) return end(msg.locked);
    try {
      if (!isValidPin(pin)) throw new WrongPinError();
      const nwcUri = await open(user.nwcSealed, pin, deps.serverSecret);
      if (user.failedPins > 0) store.clearWrongPins(user.phone);
      return { nwcUri };
    } catch (err) {
      if (!(err instanceof WrongPinError)) throw err;
      const left = store.recordWrongPin(user.phone, now());
      return end(left === 0 ? msg.locked : msg.wrongPin(left));
    }
  }

  function startLinking(phone: string): UssdResult {
    const code = store.createLinkCode(phone, now());
    const url = `${deps.publicUrl}/link`;
    return end(msg.linkCode(code, url), sms(phone, msg.smsLinkCode(code, url)));
  }

  async function signUp(phone: string, parts: string[], provider: WalletProvider): Promise<UssdResult> {
    if (parts.length === 1) return con(msg.choosePin);
    const pin = parts[1] ?? "";
    if (!isValidPin(pin)) return end(msg.invalidPin);
    if (isWeakPin(pin)) return end(msg.weakPin);
    if (parts.length === 2) return con(msg.repeatPin);
    if (parts[2] !== pin) return end(msg.pinMismatch);
    try {
      const created = await provider.create();
      const [sealed, managed] = await Promise.all([
        seal(created.nwcUri, pin, deps.serverSecret),
        sealForServer(created.nwcUri, deps.serverSecret),
      ]);
      store.saveUser(phone, sealed, created.lnAddress, managed, now());
    } catch {
      return end(msg.walletFailed);
    }
    return end(msg.walletCreated(deps.ussdCode), sms(phone, msg.smsWalletCreated(deps.ussdCode)));
  }

  async function send(user: User, sessionId: string, parts: string[]): Promise<UssdResult> {
    if (parts.length === 1) return con(msg.askRecipient);

    const recipient = resolveRecipient(parts[1] ?? "");
    if (recipient === "invalid") return end(msg.invalidRecipient);
    if (recipient === "unregistered") return end(msg.recipientNotRegistered);
    if (parts.length === 2) return con(msg.askAmount);

    const amountNgn = Number(parts[2]);
    if (!/^\d+(\.\d{1,2})?$/.test(parts[2] ?? "") || amountNgn <= 0) return end(msg.invalidAmount);

    if (parts.length === 3) {
      let quote: Quote;
      try {
        quote = await wallet.quote(amountNgn);
      } catch (err) {
        if (err instanceof PaymentError && err.code === "AMOUNT_TOO_LARGE") return end(msg.tooLarge(deps.maxPaymentSats));
        if (err instanceof PaymentError) return end(msg.invalidAmount);
        throw err;
      }
      rememberQuote(sessionId, quote);
      return con(msg.confirm(quote.amountNgn, quote.sats, recipient.label));
    }

    const session = quotes.get(sessionId);
    if (!session || session.quote.amountNgn !== amountNgn || now() - session.at > SESSION_MS) {
      return end(msg.sessionExpired);
    }
    const { quote } = session;

    const unlocked = await unlock(user, parts[3] ?? "");
    if ("reply" in unlocked) return unlocked;
    quotes.delete(sessionId);

    if (store.satsSpentSince(user.phone, now() - DAY_MS) + quote.sats > deps.dailyLimitSats) {
      return end(msg.dailyLimit);
    }

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
          nwcUri: unlocked.nwcUri,
          recipient: recipient.address ?? recipient.label,
          ...(receiverNwcUri ? { receiverNwcUri } : {}),
          amountNgn,
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
    return end(msg.sending, background);
  }

  async function balance(user: User, parts: string[]): Promise<UssdResult> {
    if (parts.length === 1) return con(msg.askPin);
    const unlocked = await unlock(user, parts[1] ?? "");
    if ("reply" in unlocked) return unlocked;

    const lookup = (async () => {
      const [sats, ngnPerBtc] = await Promise.all([wallet.balanceSats(unlocked.nwcUri), wallet.ngnPerBtc()]);
      return { sats, ngn: satsToNgn(sats, ngnPerBtc) };
    })();

    let timer: NodeJS.Timeout | undefined;
    const timeout = new Promise<"slow">((resolve) => {
      timer = setTimeout(() => resolve("slow"), deps.balanceWaitMs ?? 6000);
    });
    try {
      const result = await Promise.race([lookup, timeout]);
      if (result !== "slow") return end(msg.balance(result.sats, result.ngn));
    } catch {
      return end(msg.balanceFailed);
    } finally {
      clearTimeout(timer);
    }
    const background = lookup.then(
      (result) => sms(user.phone, msg.smsBalance(result.sats, result.ngn)),
      () => undefined,
    );
    return end(msg.balanceLater, background);
  }

  return async function handle(req: UssdRequest): Promise<UssdResult> {
    const phone = normalisePhone(req.phoneNumber);
    if (!phone) return end(msg.error);
    const parts = req.text === "" ? [] : req.text.split("*");
    const user = store.getUser(phone);

    if (!user) {
      const provider = deps.provider;
      if (parts.length === 0) return con(provider ? msg.menuNew : msg.menuUnlinked);
      if (provider && parts[0] === "1") return parts.length <= 3 ? signUp(phone, parts, provider) : end(msg.invalidChoice);
      const linkChoice = provider ? "2" : "1";
      return parts[0] === linkChoice && parts.length === 1 ? startLinking(phone) : end(msg.invalidChoice);
    }

    if (parts.length === 0) return con(msg.menu);
    switch (parts[0]) {
      case "1":
        return send(user, req.sessionId, parts);
      case "2":
        return balance(user, parts);
      case "3":
        if (user.managedSealed) return end(msg.receivePhone(user.phone));
        return end(user.lnAddress ? msg.receive(user.lnAddress) : msg.noReceive);
      case "4":
        return startLinking(phone);
      default:
        return end(msg.invalidChoice);
    }
  };
}
