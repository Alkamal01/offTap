import { LightningAddress } from "@getalby/lightning-tools/lnurl";

export type ResolvedInvoice = { invoice: string; sats: number; paymentHash: string };

const ADDRESS_RE = /^[a-z0-9._+-]+@[a-z0-9.-]+\.[a-z]{2,}$/i;

export function isLightningAddress(value: string): boolean {
  return ADDRESS_RE.test(value.trim());
}

export async function requestInvoice(address: string, sats: number, comment?: string): Promise<ResolvedInvoice> {
  const normalised = address.trim().toLowerCase();
  if (!isLightningAddress(normalised)) throw new Error("Not a valid Lightning Address");
  if (!Number.isInteger(sats) || sats <= 0) throw new Error("Amount must be a positive whole number of sats");

  const ln = new LightningAddress(normalised, { proxy: false });
  await ln.fetch();
  const lnurlp = ln.lnurlpData;
  if (!lnurlp) throw new Error(`${normalised} does not accept Lightning payments`);

  const msats = sats * 1000;
  if (msats < lnurlp.min || msats > lnurlp.max) {
    throw new Error(
      `${normalised} accepts between ${Math.ceil(lnurlp.min / 1000)} and ${Math.floor(lnurlp.max / 1000)} sats`,
    );
  }

  const allowedComment = comment && lnurlp.commentAllowed ? comment.slice(0, lnurlp.commentAllowed) : undefined;
  const invoice = await ln.requestInvoice({ satoshi: sats, ...(allowedComment ? { comment: allowedComment } : {}) });

  if (invoice.satoshi !== sats) {
    throw new Error(`Invoice amount mismatch: asked for ${sats} sats, got ${invoice.satoshi}`);
  }
  if (invoice.hasExpired()) throw new Error("Recipient returned an expired invoice");

  return { invoice: invoice.paymentRequest, sats, paymentHash: invoice.paymentHash };
}
