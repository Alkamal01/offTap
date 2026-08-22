# OffTap

Offline-first peer-to-peer payments on Monad. OffTap lets a user lock stablecoin balance into a hardware-secured local vault, then tap to pay another device over NFC/BLE with no network connection at all. Payloads are collected locally and settled on-chain in a single batched transaction the next time either party is back online.

## How it works

1. **Escrow.** A user deposits funds into `ShadowPayEscrow` on Monad, tied to a hardware-generated `secp256r1` key pair. The deposit is the collateral backing everything that gets spent offline.
2. **Offline signing.** A slice of that balance is locked into the device's Secure Enclave / StrongBox vault. Each payment is signed locally against a monotonically increasing nonce and handed to the recipient over NFC or BLE — no server, no internet, no chain interaction.
3. **Batch settlement.** The merchant device holds signed payloads in a local queue. Once it regains connectivity, the whole queue is pushed to Monad as one call, verified and settled in parallel.

This mirrors an EIP-712-style offline signing flow with on-chain reconciliation, rather than a custodial or IOU-based offline payment scheme — every payload traces back to collateral already locked on-chain.

## Status

This build is a working prototype of the app and interaction flow, not a production payments system. Some pieces are real, others are stand-ins for hardware and network capabilities that aren't reachable from a managed Expo app or from this environment:

| Layer | File | Status |
|---|---|---|
| Wallet / queue persistence | `lib/state/LocalStateEngine.ts` | Real — SQLite for the transaction queue, `expo-secure-store` (Keychain / Keystore) for wallet state |
| Key custody | `lib/security/HardwareSecurityBridge.ts` | Partially real — nonce and key material persist through Secure Store, but the key pair itself is software-generated, not enclave-backed (no native module bridge in this build) |
| NFC/BLE transport | `lib/transport/LocalTransportService.ts` | Simulated — payload shape and offline signature verification are real, the radio transmission is a timed stand-in |
| On-chain settlement | `lib/chain/MonadSettlementClient.ts` | Simulated — no deployed contract or RPC endpoint; returns a fake tx hash after a delay |
| Escrow contract | `contracts/ShadowPayEscrow.sol` | Reference implementation, not deployed |

Swapping in a real native hardware module, an actual NFC/BLE bridge, and a live Monad RPC against a deployed `ShadowPayEscrow` would make this end-to-end real without changing the app's UI or state layer.

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
- expo-crypto for hashing/signing in this build
- Solidity ^0.8.20 for the reference escrow contract

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
contracts/              ShadowPayEscrow.sol — reference on-chain design
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

- `ShadowPaySpecification.md` is the original architecture spec this build was implemented against — useful background on the design intent behind the mocked layers.
- The app currently seeds every new wallet with a fixed on-chain balance and a fixed counterparty address for the pay flow; there's no real peer discovery or funding path yet.
