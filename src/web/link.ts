import type { FastifyInstance } from "fastify";
import type { Store } from "../db.js";
import { isLightningAddress } from "../lightning/lnaddress.js";
import { isNwcUri, type WalletSummary } from "../lightning/nwc.js";
import type { SmsSender } from "../sms.js";
import { msg } from "../ussd/messages.js";
import { isValidPin, seal } from "../vault.js";
import { escapeHtml, page } from "./html.js";

export type LinkDeps = {
  store: Store;
  sms: SmsSender;
  describeWallet: (nwcUri: string) => Promise<WalletSummary>;
  serverSecret: string;
  ussdCode: string;
};

type LinkForm = { code?: string; nwc?: string; pin?: string; pin2?: string; lnAddress?: string };

const WINDOW_MS = 10 * 60 * 1000;
const MAX_ATTEMPTS = 10;

function form(error?: string, values: LinkForm = {}): string {
  const v = (key: keyof LinkForm) => escapeHtml(values[key] ?? "");
  return page(
    "Hada wallet",
    `<h1>Hada wallet dinka</h1>
<p class="muted">Link your Lightning wallet to your phone number.</p>
${error ? `<p class="error" role="alert">${escapeHtml(error)}</p>` : ""}
<form method="post" action="/link" autocomplete="off">
  <label for="code">Lambar hadawa <span>Link code from USSD or SMS</span></label>
  <input id="code" name="code" inputmode="numeric" pattern="[0-9]{6}" maxlength="6" required value="${v("code")}">

  <label for="nwc">NWC connection <span>From your wallet: pay + balance only, with a daily budget</span></label>
  <textarea id="nwc" name="nwc" rows="4" required placeholder="nostr+walletconnect://..."></textarea>

  <label for="lnAddress">Lightning address <span>Where you receive payments (optional)</span></label>
  <input id="lnAddress" name="lnAddress" inputmode="email" placeholder="suna@wallet.com" value="${v("lnAddress")}">

  <label for="pin">PIN (lambobi 4) <span>You will enter this on USSD to approve payments</span></label>
  <input id="pin" name="pin" type="password" inputmode="numeric" pattern="[0-9]{4}" maxlength="4" required>

  <label for="pin2">Maimaita PIN <span>Repeat PIN</span></label>
  <input id="pin2" name="pin2" type="password" inputmode="numeric" pattern="[0-9]{4}" maxlength="4" required>

  <button type="submit">Hada wallet</button>
</form>
<p class="muted">offTap can only spend up to the budget you set in your wallet. You can revoke the connection in your wallet at any time.</p>`,
  );
}

function success(summary: WalletSummary, ussdCode: string): string {
  const budget =
    summary.budgetSats !== undefined
      ? `<p>Wallet budget: <strong>${summary.budgetSats.toLocaleString()} sats</strong> (${escapeHtml(summary.budgetRenewal ?? "")})</p>`
      : `<p class="error">This connection has no budget limit. We recommend creating one with a daily budget.</p>`;
  return page(
    "An hada wallet",
    `<h1>An hada wallet dinka</h1>
<p>Your wallet is linked. Dial <strong>${escapeHtml(ussdCode)}</strong> to send money.</p>
${budget}`,
  );
}

export function registerLinkRoutes(app: FastifyInstance, deps: LinkDeps): void {
  const attempts = new Map<string, { count: number; resetAt: number }>();

  function tooMany(ip: string): boolean {
    const now = Date.now();
    const entry = attempts.get(ip);
    if (!entry || entry.resetAt < now) {
      attempts.set(ip, { count: 1, resetAt: now + WINDOW_MS });
      return false;
    }
    entry.count += 1;
    return entry.count > MAX_ATTEMPTS;
  }

  app.get("/link", async (_req, reply) => reply.type("text/html").send(form()));

  app.post<{ Body: LinkForm }>("/link", async (req, reply) => {
    reply.type("text/html");
    const body = req.body ?? {};
    const fail = (status: number, error: string) => reply.code(status).send(form(error, body));

    if (tooMany(req.ip)) return fail(429, "Too many attempts. Try again in 10 minutes.");

    const code = (body.code ?? "").trim();
    const nwc = (body.nwc ?? "").trim();
    const pin = body.pin ?? "";
    const lnInput = (body.lnAddress ?? "").trim().toLowerCase();

    const phone = /^\d{6}$/.test(code) ? deps.store.phoneForLinkCode(code) : undefined;
    if (!phone) return fail(400, "Link code is wrong or has expired. Dial the USSD code again to get a new one.");
    if (!isNwcUri(nwc)) return fail(400, "That is not a valid NWC connection string.");
    if (!isValidPin(pin)) return fail(400, "PIN must be exactly 4 digits.");
    if (pin !== body.pin2) return fail(400, "The two PINs do not match.");
    if (lnInput && !isLightningAddress(lnInput)) return fail(400, "That is not a valid Lightning address.");

    let summary: WalletSummary;
    try {
      summary = await deps.describeWallet(nwc);
    } catch {
      return fail(502, "Could not reach your wallet. Check that it is online and try again.");
    }
    if (!summary.canPay) return fail(400, "This connection is not allowed to make payments. Enable pay_invoice.");

    const lnAddress = lnInput || summary.lightningAddress?.toLowerCase() || null;
    deps.store.saveUser(phone, await seal(nwc, pin, deps.serverSecret), lnAddress);
    deps.store.consumeLinkCode(code);
    await deps.sms(phone, msg.smsLinked(deps.ussdCode));
    return reply.send(success(summary, deps.ussdCode));
  });
}
