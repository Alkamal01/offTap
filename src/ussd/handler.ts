import { createActions, type Wallet } from "../actions.js";
import { displayName, normaliseContactName } from "../contacts.js";
import type { Store, User } from "../db.js";
import { isLightningAddress } from "../lightning/lnaddress.js";
import { payAddress } from "../lightning/lnurlp.js";
import { PaymentError, type Quote } from "../payments.js";
import { normalisePhone } from "../phone.js";
import type { SmsSender } from "../sms.js";
import { isValidPin, isWeakPin, seal, sealForServer } from "../vault.js";
import type { WalletProvider } from "../wallets/provider.js";
import { msg } from "./messages.js";

export type { Wallet };

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

const SESSION_MS = 5 * 60 * 1000;

const con = (text: string): UssdResult => ({ reply: `CON ${text}` });
const end = (text: string, background?: Promise<void>): UssdResult =>
  background ? { reply: `END ${text}`, background } : { reply: `END ${text}` };

export function navigate(text: string): string[] {
  const parts: string[] = [];
  for (const entry of text === "" ? [] : text.split("*")) {
    if (entry === "00") parts.length = 0;
    else if (entry === "0") parts.pop();
    else parts.push(entry);
  }
  return parts;
}

export function createUssdHandler(deps: UssdDeps) {
  const { store, sms, wallet } = deps;
  const now = deps.now ?? Date.now;
  const actions = createActions({ ...deps, now });
  const quotes = new Map<string, { quote: Quote; at: number }>();

  function rememberQuote(sessionId: string, quote: Quote): void {
    const cutoff = now() - SESSION_MS;
    for (const [id, entry] of quotes) if (entry.at < cutoff) quotes.delete(id);
    quotes.set(sessionId, { quote, at: now() });
  }

  function contacts(user: User, parts: string[]): UssdResult {
    const saved = store.contacts(user.phone);
    const names = saved.map((c) => displayName(c.name));
    if (parts.length === 1) return con(msg.contactsMenu);

    if (parts[1] === "1") {
      if (parts.length === 2) return con(msg.askContactName);
      const name = normaliseContactName(parts[2] ?? "");
      if (!name) return end(msg.invalidContactName);
      if (parts.length === 3) return con(msg.askContactRecipient(displayName(name)));
      if (parts.length > 4) return end(msg.invalidChoice);
      const value = (parts[3] ?? "").trim();
      const recipient = isLightningAddress(value) ? value.toLowerCase() : normalisePhone(value);
      if (!recipient) return end(msg.invalidRecipient);
      if (!store.saveContact(user.phone, name, recipient, now())) return end(msg.contactsFull);
      return end(msg.contactSaved(displayName(name), recipient));
    }

    if (saved.length === 0) return end(msg.noContacts);
    if (parts[1] === "2" && parts.length === 2) {
      return end(msg.contactList(saved.map((c) => `${displayName(c.name)}: ${c.recipient}`)));
    }
    if (parts[1] === "3") {
      if (parts.length === 2) return con(msg.chooseContactToDelete(names));
      const chosen = /^\d{1,2}$/.test(parts[2] ?? "") ? saved[Number(parts[2]) - 1] : undefined;
      if (!chosen || parts.length > 3) return end(msg.invalidChoice);
      store.deleteContact(user.phone, chosen.name);
      return end(msg.contactDeleted(displayName(chosen.name)));
    }
    return end(msg.invalidChoice);
  }

  async function unlock(user: User, pin: string): Promise<{ nwcUri: string } | UssdResult> {
    const result = await actions.unlock(user, pin);
    if ("nwcUri" in result) return result;
    return end(result.failure === "locked" ? msg.locked : msg.wrongPin(result.left));
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
    if (parts.length === 1) {
      const names = store.contacts(user.phone).map((c) => displayName(c.name));
      return con(names.length > 0 ? msg.askRecipientWithContacts(names.slice(0, 5)) : msg.askRecipient);
    }

    const recipient = actions.resolveRecipient(user.phone, parts[1] ?? "");
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

    const started = actions.pay(user, unlocked.nwcUri, recipient, quote);
    if (started === "dailyLimit") return end(msg.dailyLimit);
    return end(msg.sending, started.background);
  }

  async function balance(user: User, parts: string[]): Promise<UssdResult> {
    if (parts.length === 1) return con(msg.askPin);
    const unlocked = await unlock(user, parts[1] ?? "");
    if ("reply" in unlocked) return unlocked;

    const lookup = actions.balance(unlocked.nwcUri);

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

  async function route(req: UssdRequest, parts: string[]): Promise<UssdResult> {
    const phone = normalisePhone(req.phoneNumber);
    if (!phone) return end(msg.error);
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
        if (user.managedSealed) return end(msg.receivePhone(user.phone, payAddress(user.phone, deps.publicUrl)));
        return end(user.lnAddress ? msg.receive(user.lnAddress) : msg.noReceive);
      case "4":
        return startLinking(phone);
      case "5":
        return contacts(user, parts);
      default:
        return end(msg.invalidChoice);
    }
  }

  return async function handle(req: UssdRequest): Promise<UssdResult> {
    const parts = navigate(req.text);
    const result = await route(req, parts);
    if (parts.length === 0 || !result.reply.startsWith("CON ")) return result;
    return { ...result, reply: `${result.reply}\n${parts.length === 1 ? msg.back : msg.backOrMenu}` };
  };
}
