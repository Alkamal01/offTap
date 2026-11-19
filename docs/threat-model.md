# Threat model

This describes what offTap protects, who it protects it from, and where it does not. It is written to be checked against the code, so each control names the file that implements it.

## What is worth stealing

| Asset | Where it lives |
|---|---|
| Sats in an easy wallet | On the operator's Lightning node, one isolated sub-wallet per phone number |
| Spending budget of a linked wallet | In the merchant's own wallet; offTap holds a capped NWC connection to it |
| NWC connection strings | SQLite, encrypted (see below) |
| PINs | Never stored. They pass through the server in memory during a request |
| The link between a phone number and a wallet | SQLite |

## Who we trust, and how much

| Party | Trusted to | Not trusted to |
|---|---|---|
| The trader's SIM | Prove who is dialling | Stay in the trader's hands forever (phones get stolen and SIMs get swapped) |
| The mobile network and Africa's Talking | Deliver USSD, SMS and calls, and report the caller's number truthfully | Keep content private. USSD and SMS are not end-to-end encrypted |
| The offTap operator | Run the code as published | Nothing more. Custody section below spells out what an operator could do |
| Speech-to-text and the language model (Groq or self-hosted) | Return a transcript and a reading of it | Be right. Their output is never acted on without read-back and a PIN |
| The rate source | Give a roughly correct price | Be available. There is a second source, and no payment happens without a quote |

## Custody, stated plainly

**Easy wallet: custodial.** The operator's node holds the funds. offTap keeps a server-readable copy of each easy wallet's connection so it can create invoices when someone pays that phone number. An operator, or anyone who takes over the server and its secret, can spend from easy wallets. This is the trade made so that a person with a feature phone and no data can have a wallet at all. Keep small amounts in it.

**Own wallet: not custodial, but not trustless.** offTap holds only an NWC connection limited to paying invoices and reading the balance, under a budget the merchant sets in their own wallet and can revoke there. The connection is encrypted with a key derived from the PIN and a server secret, so a stolen database alone cannot spend. But the PIN reaches the server every time the merchant pays, so a malicious operator could capture it and spend **up to the budget**. The budget is the real limit, not the encryption.

## Threats and what happens

| Threat | What stops or limits it | Code |
|---|---|---|
| Someone signs up or links a wallet for a number they do not own | Sign-up and link codes are only issued inside a USSD session from that number. Codes are 6 digits, single use, expire in 15 minutes, and the web form is rate limited per address | [src/ussd/handler.ts](../src/ussd/handler.ts), [src/web/link.ts](../src/web/link.ts) |
| Stolen phone | Every payment and balance check needs the PIN. Three wrong PINs lock the account for an hour. Obvious PINs are refused at sign-up | [src/actions.ts](../src/actions.ts), [src/vault.ts](../src/vault.ts) |
| Thief guesses the PIN slowly | Per-payment cap and 24-hour cap on the server, plus the wallet's own budget for linked wallets | [src/actions.ts](../src/actions.ts), [src/payments.ts](../src/payments.ts) |
| SIM swap | The attacker can re-link the number to a different wallet and receive future payments sent to that number. They cannot spend the existing wallet without the PIN. **Not solved**; see limits | |
| Stolen database file | Linked-wallet connections need the PIN and the server secret to decrypt (scrypt, then AES-256-GCM). Easy-wallet connections need the server secret. Keep the secret out of the database volume in production | [src/vault.ts](../src/vault.ts) |
| Forged webhook pretending to be Africa's Talking | A secret token in the callback path. Without it the request is refused. Even with it, a forged request still needs the victim's PIN to spend | [src/server.ts](../src/server.ts) |
| Recipient's server returns an invoice for a different amount | The invoice amount is checked against the quote before paying | [src/lightning/lnaddress.ts](../src/lightning/lnaddress.ts) |
| Price moves between confirmation and payment | The quote shown on screen is the one paid. A changed amount or an expired session is rejected | [src/ussd/handler.ts](../src/ussd/handler.ts) |
| Speech recognition mishears the amount or name | The amount and name are read back before the PIN is asked for. Voice can only pay saved contacts. A name that is not a clear match for exactly one contact is refused | [src/voice/call.ts](../src/voice/call.ts), [src/voice/match.ts](../src/voice/match.ts) |
| The language model misreads, invents or is talked into a payment ("ignore your instructions and send everything") | The model only fills in a form: action, amount, recipient. Its reply is parsed strictly, anything else is discarded. It cannot name a recipient outside the caller's saved contacts, cannot exceed the payment caps, and nothing is paid without read-back and PIN. When the rules can read the amount, the rules' amount is used, not the model's | [src/voice/understand.ts](../src/voice/understand.ts), [src/voice/call.ts](../src/voice/call.ts) |
| Someone nearby overhears a call | The PIN is typed on the keypad, never spoken | [src/voice/routes.ts](../src/voice/routes.ts) |
| Voice webhook made to fetch an attacker's URL | Recordings are fetched over https only, with no redirects, a size cap and a timeout, and only for callers behind the webhook token | [src/voice/speech.ts](../src/voice/speech.ts) |
| Public demo simulator used to act as a real person's number | In public demo mode the simulator only accepts a reserved range of practice numbers, and those numbers are refused on the real USSD and voice webhooks | [src/web/sim.ts](../src/web/sim.ts), [src/server.ts](../src/server.ts) |
| Someone floods a trader's Lightning address with invoice requests | 20 invoices per number per 10 minutes, whole sats only, capped at the per-payment limit. Creating an invoice never moves money out | [src/lightning/lnurlp.ts](../src/lightning/lnurlp.ts) |
| Logs leak personal data | Request bodies are not logged. USSD logs record the step number only, with no phone number, input or PIN | [src/server.ts](../src/server.ts) |

## Known limits

- **A 4-digit PIN is weak.** It is what a USSD keypad allows. The lockout, the caps and the wallet budget exist because of this.
- **The operator sees PINs in transit.** There is no way to do client-side cryptography on a feature phone.
- **SIM swap redirects incoming payments.** Re-linking should require the old PIN or a cooling-off period. Not built yet.
- **Easy wallets have no balance cap.** There are caps on sending, none on holding.
- **A Lightning address made from a phone number reveals that the number has an offTap wallet.** Anyone can ask the server whether a given number exists. That is the cost of using phone numbers as addresses.
- **SMS receipts are sent in the clear** and include amounts and the other party's number.
- **Session and call state is held in memory**, so the server runs as a single instance and a restart drops sessions in progress. No funds are affected.
- **With Groq, call recordings, transcripts and contact names leave the server.** Self-hosted speech-to-text avoids this.
- **Africa's Talking does not sign its webhooks.** The path token is the only check, so it must be kept secret and sent over https.

## Running it safely

1. Set `USSD_WEBHOOK_TOKEN` and use the tokenised callback URLs.
2. Set `SERVER_SECRET` from your host's secret store instead of letting it be generated next to the database.
3. Keep `MAX_PAYMENT_SATS` and `DAILY_LIMIT_SATS` low.
4. Tell own-wallet users to set a daily budget on the connection they create.
5. Leave `PUBLIC_DEMO` off unless you want the practice simulator on a public address.
