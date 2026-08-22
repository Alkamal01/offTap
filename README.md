# OffTap

Offline-first peer-to-peer payments on Monad. OffTap lets a user lock stablecoin balance into a hardware-secured local vault, then tap to pay another device over NFC/BLE with no network connection at all. Payloads are collected locally and settled on-chain in a single batched transaction the next time either party is back online.

## How it works

1. **Escrow.** A user deposits funds into `ShadowPayEscrow` on Monad, tied to a hardware-generated `secp256r1` key pair. The deposit is the collateral backing everything that gets spent offline.
2. **Offline signing.** A slice of that balance is locked into the device's Secure Enclave / StrongBox vault. Each payment is signed locally against a monotonically increasing nonce and handed to the recipient over NFC or BLE — no server, no internet, no chain interaction.
3. **Batch settlement.** The merchant device holds signed payloads in a local queue. Once it regains connectivity, the whole queue is pushed to Monad as one call, verified and settled in parallel.

This mirrors an EIP-712-style offline signing flow with on-chain reconciliation, rather than a custodial or IOU-based offline payment scheme — every payload traces back to collateral already locked on-chain.

## Deployment

`ShadowPayEscrow` is deployed on Monad testnet.

- **Network:** Monad Testnet (chain ID `10143`)
- **Contract:** [`0xC6d3FaBDA93CA816a8F10Da914A9024B6086B0Aa`](https://testnet.monadexplorer.com/address/0xC6d3FaBDA93CA816a8F10Da914A9024B6086B0Aa)
- **Deployment tx:** [`0xea88f58ce7fa81243f0310eebe53ab7e56f4a79e8beb4cd4c94f96f075e0640b`](https://testnet.monadexplorer.com/tx/0xea88f58ce7fa81243f0310eebe53ab7e56f4a79e8beb4cd4c94f96f075e0640b)

Built and deployed with Foundry:

```
forge build
forge script contracts-script/Deploy.s.sol:Deploy --rpc-url monad_testnet --private-key $PRIVATE_KEY --broadcast
```

## Screens

- **Home** — on-chain and offline vault balances, recent activity, lock funds into the offline vault
- **Pay** — enter an amount on the on-screen keypad and sign a tap
- **Receive** — listens for and queues an incoming tap
- **Sync** — batch-settles the local queue to Monad once online, shows settled history
- **Settings** — theme, connectivity toggle (for exercising offline mode), wallet details

## Tech stack

- Expo SDK 54 / React Native 0.81, TypeScript
- expo-router (file-based navigation)
- NativeWind (Tailwind for React Native)
- expo-secure-store, expo-sqlite for local persistence
- expo-crypto for hashing/signing
- Solidity ^0.8.20 escrow contract, deployed with Foundry

## Project structure

```
app/                    expo-router screens
  (tabs)/                home, pay, receive, sync, settings
  onboarding.tsx, setup.tsx
components/             shared UI (ActionButton, BalanceCard, TransactionRow, ...)
contexts/               WalletContext, ThemeContext
lib/
  security/             HardwareSecurityBridge — key generation & offline signing
  transport/             LocalTransportService — NFC/BLE payload transport
  state/                 LocalStateEngine — SQLite queue + secure wallet state
  chain/                 MonadSettlementClient — batch settlement
contracts/              ShadowPayEscrow.sol — on-chain escrow, deployed to Monad testnet
contracts-script/       Deploy.s.sol — Foundry deployment script
```

## Getting started

Requires Node 18+ and the Expo CLI (`npx expo`, no global install needed).

```
npm install
npm start
```

Then run on a target from the Expo CLI, or directly:

```
npm run ios       # iOS simulator
npm run android   # Android emulator
npm run web       # browser
```

On first launch you'll be walked through provisioning a hardware-tied key pair and setting a recovery address before landing on the home screen.

## Notes

- `ShadowPaySpecification.md` is the original architecture spec this build was implemented against — useful background on the design intent.
- The app currently seeds every new wallet with a fixed on-chain balance and a fixed counterparty address for the pay flow; there's no real peer discovery or funding path yet.
- This repo was forked from [monad-developers/monad-blitz-abuja](https://github.com/monad-developers/monad-blitz-abuja) as a Monad Blitz Abuja hackathon submission.
