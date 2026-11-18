import type { Actions, Wallet } from "./actions.js";
import type { Store } from "./db.js";
import { seal, sealForServer } from "./vault.js";
import type { WalletProvider } from "./wallets/provider.js";

export type DemoAccount = { name: string; phone: string; pin: string };

export const DEMO_ACCOUNTS: DemoAccount[] = [
  { name: "Amina", phone: "+2348030000001", pin: "4826" },
  { name: "Musa", phone: "+2348030000002", pin: "7391" },
  { name: "Aisha", phone: "+2348030000003", pin: "5802" },
];

const DEMO_PAYMENTS = [
  { from: "Amina", to: "Musa", amountNgn: 1500 },
  { from: "Musa", to: "Aisha", amountNgn: 700 },
];

export type SeedDeps = {
  store: Store;
  provider: WalletProvider;
  actions: Actions;
  wallet: Wallet;
  serverSecret: string;
};

export async function seedDemo(deps: SeedDeps): Promise<"seeded" | "skipped"> {
  const { store } = deps;
  if (DEMO_ACCOUNTS.some((account) => store.getUser(account.phone))) return "skipped";

  const wallets: Awaited<ReturnType<WalletProvider["create"]>>[] = [];
  for (const _ of DEMO_ACCOUNTS) wallets.push(await deps.provider.create());
  const sealed = await Promise.all(
    DEMO_ACCOUNTS.map(async (account, i) => ({
      pin: await seal(wallets[i]!.nwcUri, account.pin, deps.serverSecret),
      server: await sealForServer(wallets[i]!.nwcUri, deps.serverSecret),
    })),
  );
  DEMO_ACCOUNTS.forEach((account, i) => {
    store.saveUser(account.phone, sealed[i]!.pin, wallets[i]!.lnAddress, sealed[i]!.server);
    for (const other of DEMO_ACCOUNTS) {
      if (other !== account) store.saveContact(account.phone, other.name.toLowerCase(), other.phone);
    }
  });

  for (const payment of DEMO_PAYMENTS) {
    const from = DEMO_ACCOUNTS.findIndex((account) => account.name === payment.from);
    const sender = store.getUser(DEMO_ACCOUNTS[from]!.phone)!;
    const recipient = deps.actions.resolveRecipient(sender.phone, payment.to);
    if (typeof recipient === "string") continue;
    const started = deps.actions.pay(sender, wallets[from]!.nwcUri, recipient, await deps.wallet.quote(payment.amountNgn));
    if (started !== "dailyLimit") await started.background;
  }
  return "seeded";
}
