import { describeWallet, getBalanceSats, isNwcUri } from "./lightning/nwc.js";
import { quoteNgn, sendNgn } from "./payments.js";
import { getRate, satsToNgn } from "./rates.js";

function nwcUri(): string {
  const uri = process.env.NWC_URI ?? "";
  if (!isNwcUri(uri)) {
    throw new Error("Set NWC_URI to a nostr+walletconnect:// connection string (see .env.example)");
  }
  return uri;
}

async function main(): Promise<void> {
  const [command, ...args] = process.argv.slice(2);
  switch (command) {
    case "rate": {
      const rate = await getRate();
      console.log(`1 BTC = NGN ${Math.round(rate.ngnPerBtc).toLocaleString()} (${rate.source})`);
      return;
    }
    case "quote": {
      const quote = await quoteNgn(Number(args[0]));
      console.log(`NGN ${quote.amountNgn.toLocaleString()} = ${quote.sats.toLocaleString()} sats (${quote.rateSource})`);
      return;
    }
    case "wallet": {
      console.log(await describeWallet(nwcUri()));
      return;
    }
    case "balance": {
      const [sats, rate] = await Promise.all([getBalanceSats(nwcUri()), getRate()]);
      console.log(`${sats.toLocaleString()} sats (about NGN ${satsToNgn(sats, rate.ngnPerBtc).toLocaleString()})`);
      return;
    }
    case "pay": {
      const [recipient, amount] = args;
      if (!recipient || !amount) throw new Error("Usage: pay <lightning-address> <amount-in-naira>");
      const receipt = await sendNgn({ nwcUri: nwcUri(), recipient, amountNgn: Number(amount) });
      console.log(`Paid NGN ${receipt.amountNgn.toLocaleString()} (${receipt.sats} sats) to ${receipt.recipient}`);
      console.log(`Fee: ${receipt.feesPaidSats} sats`);
      console.log(`Preimage: ${receipt.preimage}`);
      return;
    }
    default:
      console.log("Commands: rate | quote <ngn> | wallet | balance | pay <lightning-address> <ngn>");
  }
}

main().then(
  () => process.exit(0),
  (err: Error) => {
    console.error(`Error: ${err.message}`);
    process.exit(1);
  },
);
