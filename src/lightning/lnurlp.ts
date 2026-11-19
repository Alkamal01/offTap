import { createHash } from "node:crypto";
import type { FastifyInstance } from "fastify";
import type { Store } from "../db.js";
import { normalisePhone } from "../phone.js";
import { satsToNgn } from "../rates.js";
import type { SmsSender } from "../sms.js";
import { msg } from "../ussd/messages.js";
import { openForServer } from "../vault.js";

export type PayAddressDeps = {
  store: Store;
  sms: SmsSender;
  serverSecret: string;
  publicUrl: string;
  maxSats: number;
  makeInvoice: (nwcUri: string, sats: number, description: string, descriptionHash?: string) => Promise<{ invoice: string; paymentHash: string }>;
  invoiceSettled: (nwcUri: string, paymentHash: string) => Promise<boolean>;
  ngnPerBtc: () => Promise<number>;
  watchEveryMs?: number;
  watchForMs?: number;
};

const WINDOW_MS = 10 * 60 * 1000;
const MAX_INVOICES_PER_WINDOW = 20;
const MAX_WATCHERS = 100;

export function payAddress(phone: string, publicUrl: string): string {
  return `${phone.replace("+", "")}@${new URL(publicUrl).host}`;
}

function phoneFromName(name: string): string | undefined {
  return /^\+?\d{10,15}$/.test(name) ? normalisePhone(name.startsWith("0") || name.startsWith("+") ? name : `+${name}`) : undefined;
}

export function registerPayAddressRoutes(app: FastifyInstance, deps: PayAddressDeps): void {
  const { store } = deps;
  const issued = new Map<string, { count: number; resetAt: number }>();
  let watchers = 0;

  const metadataFor = (phone: string) =>
    JSON.stringify([
      ["text/plain", "offTap wallet"],
      ["text/identifier", payAddress(phone, deps.publicUrl)],
    ]);

  const fail = (reason: string) => ({ status: "ERROR", reason });

  function managedWallet(name: string) {
    const phone = phoneFromName(name);
    const user = phone ? store.getUser(phone) : undefined;
    return user?.managedSealed ? { phone: user.phone, sealed: user.managedSealed } : undefined;
  }

  function tooMany(phone: string): boolean {
    const now = Date.now();
    const entry = issued.get(phone);
    if (!entry || entry.resetAt < now) {
      issued.set(phone, { count: 1, resetAt: now + WINDOW_MS });
      return false;
    }
    entry.count += 1;
    return entry.count > MAX_INVOICES_PER_WINDOW;
  }

  function watch(phone: string, nwcUri: string, paymentHash: string, sats: number): void {
    if (watchers >= MAX_WATCHERS) return;
    watchers += 1;
    const every = deps.watchEveryMs ?? 5000;
    const deadline = Date.now() + (deps.watchForMs ?? 10 * 60 * 1000);
    const check = async (): Promise<void> => {
      try {
        if (await deps.invoiceSettled(nwcUri, paymentHash)) {
          watchers -= 1;
          const ngn = satsToNgn(sats, await deps.ngnPerBtc());
          await deps.sms(phone, msg.smsReceivedOutside(ngn, sats));
          return;
        }
      } catch {}
      if (Date.now() >= deadline) {
        watchers -= 1;
        return;
      }
      setTimeout(() => void check(), every).unref();
    };
    setTimeout(() => void check(), every).unref();
  }

  app.get<{ Params: { name: string } }>("/.well-known/lnurlp/:name", async (req, reply) => {
    const wallet = managedWallet(req.params.name);
    if (!wallet) return reply.code(404).send(fail("No such wallet"));
    return {
      tag: "payRequest",
      callback: `${deps.publicUrl}/lnurlp/${wallet.phone.replace("+", "")}/callback`,
      minSendable: 1000,
      maxSendable: deps.maxSats * 1000,
      metadata: metadataFor(wallet.phone),
    };
  });

  app.get<{ Params: { name: string }; Querystring: { amount?: string } }>("/lnurlp/:name/callback", async (req, reply) => {
    const wallet = managedWallet(req.params.name);
    if (!wallet) return reply.code(404).send(fail("No such wallet"));
    const msats = Number(req.query.amount);
    if (!Number.isInteger(msats) || msats < 1000 || msats % 1000 !== 0 || msats > deps.maxSats * 1000) {
      return fail("Amount must be whole sats within the allowed range");
    }
    if (tooMany(wallet.phone)) return reply.code(429).send(fail("Too many requests, try again later"));
    const sats = msats / 1000;
    try {
      const nwcUri = await openForServer(wallet.sealed, deps.serverSecret);
      const hash = createHash("sha256").update(metadataFor(wallet.phone)).digest("hex");
      const { invoice, paymentHash } = await deps.makeInvoice(nwcUri, sats, "offTap wallet", hash);
      watch(wallet.phone, nwcUri, paymentHash, sats);
      return { pr: invoice, routes: [] };
    } catch (err) {
      req.log.error({ err: (err as Error).message }, "could not create invoice");
      return reply.code(502).send(fail("Wallet is not reachable, try again"));
    }
  });
}
