import { randomBytes } from "node:crypto";
import { isNwcUri } from "../lightning/nwc.js";

export type NewWallet = { nwcUri: string; lnAddress: string | null };
export type WalletProvider = { name: string; create(): Promise<NewWallet> };

const TIMEOUT_MS = 12_000;

function checked(nwcUri: string, lnAddress: string | null): NewWallet {
  if (!isNwcUri(nwcUri)) throw new Error("Wallet provider returned an invalid connection");
  return { nwcUri, lnAddress: lnAddress ? lnAddress.toLowerCase() : null };
}

export function faucetProvider(sats: number): WalletProvider {
  return {
    name: "faucet",
    async create() {
      const res = await fetch(`https://faucet.nwc.dev?balance=${sats}`, {
        method: "POST",
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (!res.ok) throw new Error(`Faucet returned HTTP ${res.status}`);
      const uri = (await res.text()).trim();
      return checked(uri, new URL(uri).searchParams.get("lud16"));
    },
  };
}

export function albyHubProvider(url: string, token: string): WalletProvider {
  return {
    name: "albyhub",
    async create() {
      const res = await fetch(`${url.replace(/\/$/, "")}/apps`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          name: `offtap-${randomBytes(4).toString("hex")}`,
          pubkey: "",
          maxAmount: 0,
          budgetRenewal: "never",
          scopes: ["pay_invoice", "get_balance", "get_info", "make_invoice", "lookup_invoice"],
          isolated: true,
        }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (!res.ok) throw new Error(`Alby Hub returned HTTP ${res.status}`);
      const body = (await res.json()) as { pairingUri?: string; lud16?: string };
      return checked(body.pairingUri ?? "", body.lud16 || null);
    },
  };
}

export function providerFromConfig(c: {
  walletProvider: string;
  faucetSats: number;
  albyHub: { url: string; token: string };
}): WalletProvider | undefined {
  if (c.walletProvider === "faucet") return faucetProvider(c.faucetSats);
  if (c.walletProvider === "albyhub") {
    if (!c.albyHub.url || !c.albyHub.token) throw new Error("WALLET_PROVIDER=albyhub needs ALBY_HUB_URL and ALBY_HUB_TOKEN");
    return albyHubProvider(c.albyHub.url, c.albyHub.token);
  }
  return undefined;
}
