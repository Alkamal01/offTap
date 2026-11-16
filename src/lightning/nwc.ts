import { NWCClient } from "@getalby/sdk/nwc";

const MSATS_PER_SAT = 1000;

export type WalletSummary = {
  alias: string;
  network: string;
  canPay: boolean;
  canReadBalance: boolean;
  budgetSats?: number;
  budgetUsedSats?: number;
  budgetRenewal?: string;
};

export type PaymentResult = { preimage: string; feesPaidSats: number };

export function isNwcUri(value: string): boolean {
  try {
    const options = NWCClient.parseWalletConnectUrl(value.trim());
    return Boolean(options.walletPubkey && options.secret && options.relayUrls?.length);
  } catch {
    return false;
  }
}

export async function withWallet<T>(nwcUri: string, fn: (client: NWCClient) => Promise<T>): Promise<T> {
  const client = new NWCClient({ nostrWalletConnectUrl: nwcUri.trim() });
  try {
    return await fn(client);
  } finally {
    client.close();
  }
}

export async function getBalanceSats(nwcUri: string): Promise<number> {
  return withWallet(nwcUri, async (client) => {
    const { balance } = await client.getBalance();
    return Math.floor(balance / MSATS_PER_SAT);
  });
}

export async function payInvoice(nwcUri: string, invoice: string): Promise<PaymentResult> {
  return withWallet(nwcUri, async (client) => {
    const result = await client.payInvoice({ invoice });
    return {
      preimage: result.preimage,
      feesPaidSats: Math.ceil((result.fees_paid ?? 0) / MSATS_PER_SAT),
    };
  });
}

export async function describeWallet(nwcUri: string): Promise<WalletSummary> {
  return withWallet(nwcUri, async (client) => {
    const info = await client.getInfo();
    const summary: WalletSummary = {
      alias: info.alias,
      network: info.network,
      canPay: info.methods.includes("pay_invoice"),
      canReadBalance: info.methods.includes("get_balance"),
    };
    if (info.methods.includes("get_budget")) {
      const budget = await client.getBudget();
      if ("total_budget" in budget) {
        summary.budgetSats = Math.floor(budget.total_budget / MSATS_PER_SAT);
        summary.budgetUsedSats = Math.floor(budget.used_budget / MSATS_PER_SAT);
        summary.budgetRenewal = budget.renewal_period;
      }
    }
    return summary;
  });
}
