import { config } from "./config.js";
import { requestInvoice } from "./lightning/lnaddress.js";
import { payInvoice } from "./lightning/nwc.js";
import { getRate, ngnToSats } from "./rates.js";

export type Quote = { amountNgn: number; sats: number; ngnPerBtc: number; rateSource: string };

export type Receipt = Quote & {
  recipient: string;
  paymentHash: string;
  preimage: string;
  feesPaidSats: number;
};

export class PaymentError extends Error {
  constructor(
    public readonly code: "AMOUNT_TOO_LARGE" | "INVALID_AMOUNT",
    message: string,
  ) {
    super(message);
  }
}

export async function quoteNgn(amountNgn: number): Promise<Quote> {
  if (!Number.isFinite(amountNgn) || amountNgn <= 0) {
    throw new PaymentError("INVALID_AMOUNT", "Amount must be greater than zero");
  }
  const rate = await getRate();
  const sats = ngnToSats(amountNgn, rate.ngnPerBtc);
  if (sats > config.maxPaymentSats) {
    throw new PaymentError(
      "AMOUNT_TOO_LARGE",
      `Amount is ${sats} sats; the limit per payment is ${config.maxPaymentSats} sats`,
    );
  }
  return { amountNgn, sats, ngnPerBtc: rate.ngnPerBtc, rateSource: rate.source };
}

export async function sendNgn(args: {
  nwcUri: string;
  recipient: string;
  amountNgn: number;
  quote?: Quote;
}): Promise<Receipt> {
  const quote = args.quote ?? (await quoteNgn(args.amountNgn));
  const { invoice, paymentHash } = await requestInvoice(args.recipient, quote.sats, "offTap");
  const paid = await payInvoice(args.nwcUri, invoice);
  return { ...quote, recipient: args.recipient, paymentHash, ...paid };
}
