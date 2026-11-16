Project Document: offTap (Kasuwanci Voice & USSD)

Tagline: Hausa Voice & USSD Lightning Payments powered by Nostr Wallet Connect (NWC) and Open-Source AI.

1. Executive Summary

offTap enables feature-phone users and low-literacy merchants across Northern Nigeria to send, receive, and manage Bitcoin Lightning payments using USSD codes and spoken Hausa commands, without needing a smartphone, mobile data, or a centralized custodial bank.
• Target Region: Northern Nigeria (Kano, Kaduna, Katsina, Sokoto, Bauchi, Maiduguri) and cross-border Sahel trade routes.
• Core Tech Stack: Bitcoin Lightning, Nostr Wallet Connect (NWC / NIP-47), Cashu Ecash, Open-Source Hausa ASR AI (Meta MMS / Whisper), and Africa’s Talking Telecom API.
• License: MIT / Apache 2.0 (100% Free and Open-Source Software).

2. Problem Statement

1. Banking & POS Failures: Traders in major northern markets (such as Kantin Kwari or Dawanau) lose sales daily due to bank network downtime and high POS agent charges.
2. Smartphone & Data Exclusion: Over half of rural farmers and artisans use basic feature phones (2G) or have intermittent mobile data, locking them out of standard self-custodial Bitcoin wallets.
3. Language & Literacy Barriers: Existing Bitcoin wallets rely on English text menus, making them unusable for millions of Hausa-speaking merchants.
4. Custodial Risk in USSD Fintech: Existing USSD crypto bridges act as centralized custodians, creating single points of failure and regulatory bottlenecks.

3. Proposed Solution & User Flows

offTap bridges feature phones to self-custodial Lightning wallets using Africa’s Talking for telecom access, Open-Source AI for Hausa voice understanding, and Nostr Wallet Connect (NWC) for non-custodial payment authorization.

Flow A: USSD Menu Flow (*384*8822#)

1. User dials *384*8822# on any basic phone (no internet required).
2. Server responds with a Hausa/English menu:
	• 1. Tura Kudi (Send Sats)
	• 2. Duba Balance (Check Balance)
	• 3. Karbi Kudi (Receive / Show LN Address)
	• 4. Saita NWC (Link Wallet)
3. User enters recipient phone number or Nostr alias (e.g., musa@offTap.ng) and amount in Naira (NGN).
4. Backend fetches live BTC/NGN rate, converts to satoshis, and asks for a 4-digit PIN.
5. Backend uses the user's scoped NWC connection token to sign and pay the Lightning invoice, then sends an SMS receipt via Africa's Talking.

Flow B: Hausa Voice Call Flow (IVR + AI)

1. User calls the offTap toll-free/local number via Africa's Talking Voice API.
2. Automated Hausa prompt asks: "Fadi abin da kake son yi" ("State what you want to do").
3. User speaks naturally: "Tura Naira dubu biyar zuwa Musa" ("Send 5,000 Naira to Musa").
4. Africa’s Talking sends the audio clip URL to the offTap AI Engine.
5. AI transcribes the Hausa speech, extracts the intent (SEND, 5000 NGN, Musa), and reads back confirmation: "Zaka tura Naira 5,000 (sats 4,200) zuwa Musa. Danna 1 don tabbatarwa." ("You are sending 5,000 Naira to Musa. Press 1 to confirm.")
6. User presses 1 on their keypad, and the NWC Lightning payment settles instantly.

4. Technical Architecture


Layer	Technology / Protocol	Role in System
Telecom Gateway	Africa's Talking (USSD, Voice, SMS APIs)	Handles 2G USSD sessions, incoming voice calls, DTMF keypad presses, and SMS receipts.
Backend Orchestrator	Python (FastAPI) or Node.js (TypeScript)	Manages session states, fetches BTC/NGN exchange rates, and coordinates Nostr/AI services.
AI Speech & Intent	Meta MMS-1B (hau) / Whisper + Llama-3-8B	Transcribes spoken Hausa into text and extracts structured JSON (action, amount, recipient).
Identity & Directory	Nostr Relays (NIP-05 & NIP-44 Encryption)	Maps hashed phone numbers to Nostr npub identities and Lightning Addresses (LNURL-pay).
Non-Custodial Payment	Nostr Wallet Connect (NIP-47) + Cashu	Executes Lightning payments via user-authorized NWC strings with strict daily spending caps.


Security & Non-Custodial Guarantees

• Zero Private Keys on Server: offTap never stores a user's seed phrase or master private key.
• Scoped NWC Tokens: When onboarding (via a companion web/mobile dashboard or trusted community agent), users generate an NWC URI restricted to pay_invoice and get_balance with a daily budget limit (e.g., 50,000 sats/day).
• PIN-Encrypted Storage: The NWC string is encrypted at rest using a key derived from the user's 4-digit USSD PIN (Argon2id + AES-256-GCM), so even the server admin cannot spend user funds without an active PIN session.

5. Hackathon Deliverables Checklist

Deliverables:
• Open-Source GitHub Repository: Clean codebase with setup instructions, architecture diagram, and MIT license.
• Working Bitcoin/Lightning Implementation: Live testnet/signet or mainnet integration via NWC (nostr-sdk / NDK) + Lightning Address resolution (LNURLp).
• Nostr Integration: NIP-05 identifier resolver (phone_hash -> npub -> Lightning Address) and NIP-47 NWC client.
• AI Component: Working Hausa speech-to-intent pipeline demonstrating voice commands over Africa's Talking Voice Simulator.
• Build-in-Public Logs: 8–10 public progress posts on Nostr and X tagging organizers with short demo clips.
• 3-Minute Demo Video: End-to-end walkthrough showing a simulated feature phone dialing USSD, speaking Hausa, and settling a real Lightning invoice.

6. 4-Week Execution Roadmap


Week 1: Core Infrastructure & NWC Engine

• Set up GitHub repository and FOSS license.
• Build the Nostr Wallet Connect (NIP-47) client module to check balances and pay BOLT11 invoices.
• Implement LNURL-pay resolver and live BTC/NGN price oracle (using Yadio or CoinGecko APIs).
• Public Update #1: Share architecture diagram and first NWC testnet payment on Nostr/X.

Week 2: Africa’s Talking USSD & SMS Integration

• Register free Africa’s Talking sandbox account and configure USSD callback webhook.
• Build USSD state machine (CON / END menus) in Hausa and English.
• Implement PIN-based encryption for storing user NWC connection strings.
• Public Update #2: Post screen recording of USSD simulator sending sats and triggering an SMS receipt.

Week 3: Hausa Voice AI Pipeline

• Configure Africa’s Talking Voice webhook to capture user audio recordings.
• Deploy open-source Hausa ASR (facebook/mms-1b-all with Hausa adapter) + intent parser.
• Connect voice confirmation (DTMF keypress 1) to the NWC payment trigger.
• Public Update #3: Post video demo speaking Hausa into the simulator and watching the AI parse and pay.

Week 4: Testing, Polish & Final Pitch

• Conduct user testing with 5–10 local Hausa speakers/merchants and record feedback.
• Harden error handling (insufficient balance, invalid invoice, network timeouts).
• Record and edit the final 3-minute pitch video and submit before the deadline.

7. Pitch Deck Outline (For Final Submission)

1. The Hook: Live clip of a trader in Kano completing a Bitcoin payment on a basic phone using Hausa voice commands.
2. The Problem: Bank failures in Northern Nigerian markets + 2G feature phone dominance.
3. The Solution: offTap — USSD + Hausa AI + Non-Custodial NWC.
4. Why It’s Different: Zero custodial risk (unlike traditional crypto-USSD apps) and 100% open-source.
5. Live Demo: USSD menu + Voice call transaction settling on Lightning.
6. Future Roadmap: Cashu offline ecash vouchers via SMS and cross-border NGN/XOF (CFA) liquidity pools via Nostr.
