# Spec: offtap - End-to-End Offline P2P Payment App on Monad

You are an expert mobile developer specializing in **React Native Expo**, **TypeScript**, and **EVM Smart Contracts (Solidity)**. Build the complete end-to-end codebase for **offtap**, an offline-first P2P stablecoin payment engine that leverages local hardware security (Secure Enclave/StrongBox) and synchronizes with the Monad blockchain via parallel batch settlement.

---

## 🏗️ Core Architecture Reference

offtap decouples transaction **signing** from network **broadcasting**:
1. **Online Escrow:** Users lock assets (e.g., USDC) on Monad. The funds are isolated to a hardware-tied smart account.
2. **Offline Local State:** The phone's hardware security module tracks balances using local monotonic nonces (`secp256r1`). Transactions are signed via local EIP-712 structured formats over **NFC/BLE**.
3. **Optimistic Parallel Sync:** The receiving merchant stores the signed payloads locally. When internet returns, payloads are batched to Monad using its parallel EVM engine for sub-cent, instant settlements.

---

## 💾 Project Codebase Execution Blueprint

Generate the full production-ready code files for the components specified below. Ensure proper types, explicit error catch gates, and clear separation of concerns.

### 1. Smart Contract: `offtapEscrow.sol`
Create a high-performance Solidity contract optimized for Monad's parallel architecture. It must handle escrow commitments, track monotonic user sequence nonces to prevent replay attacks, and support multi-signature batch processing using `secp256r1` signature verification (mimicking RIP-7212 precompile standards). Include a **30-day emergency time-lock dead-man's switch** allowing standard seed-phrase or social recovery if a hardware module is destroyed.

### 2. Native Hardware Device Bridge: `HardwareSecurityBridge.ts`
Implement an Expo Native Module interface using TypeScript. Mock or simulate the native calls to iOS `CryptoKit.SecureEnclave` and Android `KeyMint/StrongBox` for generating `secp256r1` keys and producing local hardware-enforced signatures. The local sequence counter must be hardwired into the signature generation flow to prevent double-spending.

### 3. P2P Transport Layer: `LocalTransportService.ts`
Implement a transport interface simulating **NFC Host Card Emulation (HCE)** and **Bluetooth Low Energy (BLE)** exchange. It must handle serialization of the compact transaction payload (using a clean structure resembling Protocol Buffers or binary CBOR), perform a local cryptographic handshake, verify the incoming client signature offline, and append the payload to an encrypted incoming transaction queue.

### 4. Local Database Engine: `LocalStateEngine.ts`
Provide a local state manager using an encrypted storage wrapper (simulating SQLCipher / AES-256-GCM). It must store two primary structures:
- `WalletState`: Current off-line available balance, local sequence nonce, and hardware public key.
- `TransactionQueue`: An array of collected offline payloads waiting for an active internet connection to batch-push to Monad.

### 5. React Native Expo Mobile App: `App.tsx`
Build a highly intuitive, clean user interface with single-file execution clarity. It must feature:
- A prominent status banner showing connection states (**Online** vs. **Offline Mode**).
- Dynamic balance panels tracking On-Chain vs. Local Secure Offline Funds.
- Contextual interaction modes: **"Pay (Generate Offline Tap Payload)"** and **"Receive (Listen via Local Transport)"**.
- A merchant reconciliation panel showcasing a **"Sync Batched Payments to Monad"** action button that operates once internet connectivity returns.

---

## 🧑‍💻 Technical Code Generation Blueprint

### File 1: `offtapEscrow.sol`
```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title offtapEscrow
 * @notice Manages locked on-chain collateral and processes optimistic offline batched transactions.
 * Optimized for Monad's high-speed parallel EVM execution environment.
 */
contract offtapEscrow {
    
    struct OfflineAccount {
        bytes32 hardwarePublicKeyX;
        bytes32 hardwarePublicKeyY;
        uint256 lockedBalance;
        uint256 lastSettledNonce;
        uint256 lastActiveTimestamp;
        address recoveryAddress;
    }

    struct OfflineTransaction {
        address user;
        address merchant;
        uint256 amount;
        uint256 nonce;
        bytes32 r;
        bytes32 s;
    }

    mapping(address => OfflineAccount) public accounts;
    uint256 public constant EMERGENCY_TIMELOCK = 30 days;

    event FundsEscrowed(address indexed user, uint256 amount);
    event BatchSettled
    (address indexed merchant, uint256 totalTransactions, uint256 totalVolume);
    event EmergencyRecoveryTriggered(address indexed user, address indexed receiver, uint256 amount);

    /**
     * @notice Users lock capital on-chain to enable offline-ready payments.
     */
    function depositToOfflineEscrow(
        bytes32 pubKeyX, 
        bytes32 pubKeyY, 
        address recovery
    ) external payable {
        require(msg.value > 0, "Must deposit collateral");
        
        OfflineAccount storage account = accounts[msg.sender];
        if (account.hardwarePublicKeyX == bytes32(0)) {
            account.hardwarePublicKeyX = pubKeyX;
            account.hardwarePublicKeyY = pubKeyY;
            account.recoveryAddress = recovery;
        }
        
        account.lockedBalance += msg.value;
        account.lastActiveTimestamp = block.timestamp;
        
        emit FundsEscrowed(msg.sender, msg.value);
    }

    /**
     * @notice Processes bundles of offline signatures collected by a merchant.
     * Uses parallelizable loops checking explicit state boundaries.
     */
    function settleOfflineBatch(OfflineTransaction[] calldata batch) external {
        uint256 totalVolume = 0;
        uint256 batchSize = batch.length;
        require(batchSize > 0, "Empty batch");

        for (uint256 i = 0; i < batchSize; i++) {
            OfflineTransaction calldata txData = batch[i];
            OfflineAccount storage account = accounts[txData.user];

            // Enforce sequential monotonic nonce validation to eliminate double spends offline
            require(txData.nonce == account.lastSettledNonce + 1, "Invalid sequence nonce");
            require(account.lockedBalance >= txData.amount, "Insufficient escrow balances");

            // Crytographic validation boundary
            bool isValid = verifyP256Signature(
                txData.user,
                txData.merchant,
                txData.amount,
                txData.nonce,
                txData.r,
                txData.s,
                account.hardwarePublicKeyX,
                account.hardwarePublicKeyY
            );
            require(isValid, "Cryptographic verification failed");

            // Commit state transitions
            account.lastSettledNonce = txData.nonce;
            account.lockedBalance -= txData.amount;
            account.lastActiveTimestamp = block.timestamp;
            totalVolume += txData.amount;

            // Pay the merchant instantly using Monad native tokens
            payable(txData.merchant).transfer(txData.amount);
        }

        emit BatchSettled(msg.sender, batchSize, totalVolume);
    }

    /**
     * @notice Dead-Man's Switch recovery if hardware secure module or phone is completely destroyed.
     */
    function emergencyRecovery(address userAddress) external {
        OfflineAccount storage account = accounts[userAddress];
        require(account.lockedBalance > 0, "No funds to recover");
        require(msg.sender == account.recoveryAddress, "Unauthorized recovery actor");
        require(block.timestamp > account.lastActiveTimestamp + EMERGENCY_TIMELOCK, "Time-lock active");

        uint256 remainingFunds = account.lockedBalance;
        account.lockedBalance = 0;
        
        payable(account.recoveryAddress).transfer(remainingFunds);
        emit EmergencyRecoveryTriggered(userAddress, account.recoveryAddress, remainingFunds);
    }

    /**
     * @dev Mocking RIP-7212 precompile behavior for P-256 (secp256r1) curves inside standard Solidity.
     */
    function verifyP256Signature(
        address user, address merchant, uint256 amount, uint256 nonce,
        bytes32 r, bytes32 s, bytes32 pubKeyX, bytes32 pubKeyY
    ) internal pure returns (bool) {
        if(pubKeyX == bytes32(0) || pubKeyY == bytes32(0)) return false;
        bytes32 messageHash = keccak256(abi.encodePacked(user, merchant, amount, nonce));
        // Real implementations compile directly via assembly call to precompile address 0x14
        return (r != bytes32(0) && s != bytes32(0) && messageHash != bytes32(0));
    }
}
```

### File 2: `HardwareSecurityBridge.ts`
```typescript
import { Crypto } from 'expo-crypto';

export interface HardwareKeyPair {
  publicKeyX: string;
  publicKeyY: string;
}

export interface OfflineSignaturePacket {
  signatureR: string;
  signatureS: string;
  nonce: number;
}

export class HardwareSecurityBridge {
  private static localNonceCounter: number = 0;

  /**
   * Simulates the creation of un-exportable secp256r1 keys inside secure hardware elements
   */
  public static async generateHardwareTiedKeys(): Promise<HardwareKeyPair> {
    // Simulating deterministic P-256 Public Key derivation inside standard hardware enclaves
    const randomBytesX = await Crypto.getRandomBytesAsync(32);
    const randomBytesY = await Crypto.getRandomBytesAsync(32);
    
    return {
      publicKeyX: Array.from(randomBytesX).map(b => b.toString(16).padStart(2, '0')).join(''),
      publicKeyY: Array.from(randomBytesY).map(b => b.toString(16).padStart(2, '0')).join('')
    };
  }

  /**
   * Hardware-enforced signature creation. Mutates internal nonces structurally.
   */
  public static async signOfflineTransaction(
    userAddress: string,
    merchantAddress: string,
    amountInWei: string
  ): Promise<OfflineSignaturePacket> {
    // Increment the monotonic counter inside isolated state layout
    this.localNonceCounter += 1;
    const trackingNonce = this.localNonceCounter;

    // Simulate EIP-712 structured data isolation hashing packed data
    const executionBlob = `${userAddress}:${merchantAddress}:${amountInWei}:${trackingNonce}`;
    const digest = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, executionBlob);

    // Mock native production of r and s vectors from the hardware chip
    const signatureR = '0x' + digest.substring(0, 32);
    const signatureS = '0x' + digest.substring(32, 64);

    return {
      signatureR,
      signatureS,
      nonce: trackingNonce
    };
  }

  public static getCurrentNonce(): number {
    return this.localNonceCounter;
  }

  public static resetHardwareState(): void {
    this.localNonceCounter = 0;
  }
}
```

### File 3: `LocalTransportService.ts`
```typescript
import { OfflineSignaturePacket } from './HardwareSecurityBridge';

export interface CompactPayload {
  user: string;
  merchant: string;
  amount: string;
  nonce: number;
  r: string;
  s: string;
}

export class LocalTransportService {
  /**
   * Simulates passing packed data frames through short-range radio frequencies (NFC Tag / BLE)
   */
  public static serializePayload(payload: CompactPayload): string {
    // Compact binary format encapsulation simulation (akin to Protocol Buffers)
    return JSON.stringify([
      payload.user,
      payload.merchant,
      payload.amount,
      payload.nonce,
      payload.r,
      payload.s
    ]);
  }

  public static deserializePayload(serialized: string): CompactPayload {
    const parsed = JSON.parse(serialized);
    return {
      user: parsed[0],
      merchant: parsed[1],
      amount: parsed[2],
      nonce: parsed[3],
      r: parsed[4],
      s: parsed[5]
    };
  }

  /**
   * Execution loop simulating dynamic peer-to-peer transmission states
   */
  public static async transmitViaNFC(serializedData: string): Promise<boolean> {
    return new Promise((resolve) => {
      // Simulate low-level latency factors of a 100ms standard hardware device tap
      setTimeout(() => {
        resolve(true);
      }, 120);
    });
  }
}
```

### File 4: `LocalStateEngine.ts`
```typescript
import { CompactPayload } from './LocalTransportService';

export interface WalletState {
  address: string;
  onlineBalance: number;
  offlineBalance: number;
  hardwareX: string;
  hardwareY: string;
}

export class LocalStateEngine {
  private static mockDatabase: Record<string, string> = {};
  private static inboundBatchQueue: CompactPayload[] = [];

  public static async initializeEncryptedStorage(state: WalletState): Promise<void> {
    this.mockDatabase['wallet_state'] = JSON.stringify(state);
  }

  public static async getWalletState(): Promise<WalletState | null> {
    const raw = this.mockDatabase['wallet_state'];
    return raw ? JSON.parse(raw) : null;
  }

  public static async updateBalances(online: number, offline: number): Promise<void> {
    const currentState = await this.getWalletState();
    if (currentState) {
      currentState.onlineBalance = online;
      currentState.offlineBalance = offline;
      this.mockDatabase['wallet_state'] = JSON.stringify(currentState);
    }
  }

  public static queueInboundOfflinePayment(tx: CompactPayload): void {
    this.inboundBatchQueue.push(tx);
  }

  public static getPendingSyncQueue(): CompactPayload[] {
    return this.inboundBatchQueue;
  }

  public static clearPendingQueue(): void {
    this.inboundBatchQueue = [];
  }
}
```

### File 5: `App.tsx`
```tsx
import React, { useState, useEffect } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, ScrollView, Alert, ActivityIndicator } from 'react-native';
import { HardwareSecurityBridge, HardwareKeyPair } from './HardwareSecurityBridge';
import { LocalTransportService, CompactPayload } from './LocalTransportService';
import { LocalStateEngine, WalletState } from './LocalStateEngine';

export default function App() {
  const [isConnected, setIsConnected] = useState<boolean>(true);
  const [wallet, setWallet] = useState<WalletState | null>(null);
  const [pendingQueue, setPendingQueue] = useState<CompactPayload[]>([]);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);

  const MOCK_MERCHANT_ADDR = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8';

  useEffect(() => {
    setupInitialState();
  }, []);

  const setupInitialState = async () => {
    const keys: HardwareKeyPair = await HardwareSecurityBridge.generateHardwareTiedKeys();
    const initialWallet: WalletState = {
      address: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
      onlineBalance: 250.00,
      offlineBalance: 0.00,
      hardwareX: keys.publicKeyX,
      hardwareY: keys.publicKeyY
    };
    await LocalStateEngine.initializeEncryptedStorage(initialWallet);
    setWallet(initialWallet);
  };

  const toggleNetworkMode = () => {
    setIsConnected(!isConnected);
  };

  const loadFundsToOfflineEnclave = async () => {
    if (!wallet || !isConnected) return;
    if (wallet.onlineBalance < 50) {
      Alert.alert("Error", "Insufficient funds on-chain.");
      return;
    }
    
    setIsProcessing(true);
    // Simulate smart contract escrow invocation block delay
    setTimeout(async () => {
      const nextOnline = wallet.onlineBalance - 50;
      const nextOffline = wallet.offlineBalance + 50;
      await LocalStateEngine.updateBalances(nextOnline, nextOffline);
      setWallet({ ...wallet, onlineBalance: nextOnline, offlineBalance: nextOffline });
      setIsProcessing(false);
      Alert.alert("Escrow Committed", "$50 loaded into Secure Enclave hardware vault.");
    }, 1000);
  };

  const simulateTriggerOfflinePayment = async () => {
    if (!wallet) return;
    if (wallet.offlineBalance < 10) {
      Alert.alert("Declined", "Secure hardware vault contains insufficient balances.");
      return;
    }

    try {
      // Create local cryptographic proof completely cut off from network nodes
      const sigPacket = await HardwareSecurityBridge.signOfflineTransaction(
        wallet.address,
        MOCK_MERCHANT_ADDR,
        '10000000000000000000' // $10 in Wei scale
      );

      const generatedPayload: CompactPayload = {
        user: wallet.address,
        merchant: MOCK_MERCHANT_ADDR,
        amount: '10',
        nonce: sigPacket.nonce,
        r: sigPacket.signatureR,
        s: sigPacket.signatureS
      };

      const serializedString = LocalTransportService.serializePayload(generatedPayload);
      const transmitSuccess = await LocalTransportService.transmitViaNFC(serializedString);

      if (transmitSuccess) {
        // Mutate dynamic state variables internally
        const newOfflineBal = wallet.offlineBalance - 10;
        await LocalStateEngine.updateBalances(wallet.onlineBalance, newOfflineBal);
        setWallet({ ...wallet, offlineBalance: newOfflineBal });
        
        // Simulating the merchant's machine accepting the payload frame
        LocalStateEngine.queueInboundOfflinePayment(generatedPayload);
        setPendingQueue([...LocalStateEngine.getPendingSyncQueue()]);

        Alert.alert("Success", `NFC Tap Complete! Signed receipt sequence #${sigPacket.nonce} transferred to merchant.`);
      }
    } catch (err) {
      Alert.alert("Hardware Error", "Secure Enclave communication failed.");
    }
  };

  const clearAndSettleBatchOnMonad = async () => {
    if (!isConnected) {
      Alert.alert("Sync Blocked", "Re-establish internet connection to resolve pending ledgers on Monad.");
      return;
    }
    if (pendingQueue.length === 0) {
      Alert.alert("Queue Clean", "No local transaction payloads require reconciliation.");
      return;
    }

    setIsProcessing(true);
    // Simulating parallel execution processing pipelines inside Monad RPC layers
    setTimeout(() => {
      LocalStateEngine.clearPendingQueue();
      setPendingQueue([]);
      setIsProcessing(false);
      Alert.alert(
        "Monad Settled", 
        `Parallel settlement successful! All transactions verified via native curve parameters instantly.`
      );
    }, 1500);
  };

  if (!wallet) {
    return <View style={styles.centered}><ActivityIndicator size="large" color="#4F46E5" /></View>;
  }

  return (
    <View style={styles.container}>
      <View style={[styles.statusBanner, isConnected ? styles.online : styles.offline]}>
        <Text style={styles.statusText}>
          {isConnected ? "🌐 ONLINE NETWORK ACCESS" : "⚠️ DISCONNECTED - OFFLINE SHADOW MODE"}
        </Text>
      </View>

      <ScrollView contentContainerStyle={styles.scrollLayout}>
        <Text style={styles.titleHeadline}>offtap Dashboard</Text>
        <Text style={styles.subtext}>Account: {wallet.address.substring(0, 8)}...{wallet.address.substring(34)}</Text>

        <View style={styles.cardLayout}>
          <Text style={styles.cardHeader}>Monad Layer 1 Ledger State</Text>
          <Text style={styles.balanceDisplay}>${wallet.onlineBalance.toFixed(2)} <Text style={styles.denom}>USDC</Text></Text>
          
          <TouchableOpacity 
            style={[styles.actionBtn, !isConnected && styles.disabledBtn]} 
            onPressed={loadFundsToOfflineEnclave}
            disabled={!isConnected || isProcessing}
          >
            <Text style={styles.btnText}>🔒 Lock $50 inside Secure Enclave</Text>
          </TouchableOpacity>
        </View>

        <View style={[styles.cardLayout, styles.enclaveContainer]}>
          <Text style={styles.enclaveHeader}>Hardware Secure Enclave State</Text>
          <Text style={styles.balanceDisplayEnclave}>${wallet.offlineBalance.toFixed(2)} <Text style={styles.denom}>USDC</Text></Text>
          <Text style={styles.nonceLabel}>Internal Monotonic Nonce: {HardwareSecurityBridge.getCurrentNonce()}</Text>

          <TouchableOpacity 
            style={styles.payBtn} 
            onPressed={simulateTriggerOfflinePayment}
            disabled={isProcessing}
          >
            <Text style={styles.btnText}>⚡ Tap to Pay $10.00 (Offline NFC)</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.cardLayout}>
          <Text style={styles.cardHeader}>Merchant Inbound Processing Log ({pendingQueue.length})</Text>
          {pendingQueue.length === 0 ? (
            <Text style={styles.emptyLogText}>No un-synchronized payment receipts cached on device storage.</Text>
          ) : (
            pendingQueue.map((tx, idx) => (
              <View key={idx} style={styles.logItem}>
                <Text style={styles.logText}>Seq #{tx.nonce} | From: {tx.user.substring(0, 6)}... -> Amt: ${tx.amount}</Text>
                <Text style={styles.cryptoSigText}>Sig: {tx.r.substring(0, 16)}...</Text>
              </View>
            ))
          )}

          <TouchableOpacity 
            style={[styles.syncBtn, pendingQueue.length === 0 && styles.disabledBtn]} 
            onPressed={clearAndSettleBatchOnMonad}
            disabled={pendingQueue.length === 0 || isProcessing}
          >
            <Text style={styles.btnText}>🔄 Sync Batch to Monad Engine</Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity style={styles.networkToggle} onPressed={toggleNetworkMode}>
          <Text style={styles.toggleBtnText}>
            Simulate: {isConnected ? "Disconnect Internet" : "Restore Internet Connection"}
          </Text>
        </TouchableOpacity>
      </ScrollView>

      {isProcessing && (
        <View style={styles.overlayMask}>
          <ActivityIndicator size="large" color="#FFFFFF" />
          <Text style={styles.overlayText}>Reconciliation Processes Moving...</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F3F4F6' },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  statusBanner: { paddingVertical: 10, alignItems: 'center', justifyContent: 'center' },
  online: { backgroundColor: '#10B981' },
  offline: { backgroundColor: '#F59E0B' },
  statusText: { color: '#FFFFFF', fontWeight: 'bold', fontSize: 13, letterSpacing: 1 },
  scrollLayout: { padding: 20 },
  titleHeadline: { fontSize: 26, fontWeight: '900', color: '#111827' },
  subtext: { fontSize: 12, color: '#6B7280', marginBottom: 20 },
  cardLayout: { backgroundColor: '#FFFFFF', borderRadius: 16, padding: 20, marginBottom: 20, elevation: 2, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.2, shadowRadius: 1.41 },
  enclaveContainer: { borderColor: '#4F46E5', borderWidth: 2 },
  cardHeader: { fontSize: 14, fontWeight: '700', color: '#374151', marginBottom: 10 },
  enclaveHeader: { fontSize: 14, fontWeight: '700', color: '#4F46E5', marginBottom: 10 },
  balanceDisplay: { fontSize: 32, fontWeight: '800', color: '#111827', marginBottom: 15 },
  balanceDisplayEnclave: { fontSize: 32, fontWeight: '800', color: '#4F46E5', marginBottom: 5 },
  denom: { fontSize: 16, fontWeight: '400', color: '#9CA3AF' },
  nonceLabel: { fontSize: 12, color: '#6B7280', marginBottom: 15, fontWeight: '600' },
  actionBtn: { backgroundColor: '#111827', padding: 14, borderRadius: 10, alignItems: 'center' },
  payBtn: { backgroundColor: '#4F46E5', padding: 14, borderRadius: 10, alignItems: 'center' },
  syncBtn: { backgroundColor: '#10B981', padding: 14, borderRadius: 10, alignItems: 'center', marginTop: 15 },
  disabledBtn: { backgroundColor: '#9CA3AF', opacity: 0.6 },
  btnText: { color: '#FFFFFF', fontWeight: '700', fontSize: 14 },
  emptyLogText: { fontSize: 13, color: '#9CA3AF', fontStyle: 'italic', marginVertical: 10 },
  logItem: { backgroundColor: '#F9FAFB', padding: 10, borderRadius: 8, marginVertical: 4, borderWidth: 1, borderColor: '#E5E7EB' },
  logText: { fontSize: 12, fontWeight: '600', color: '#374151' },
  cryptoSigText: { fontSize: 10, color: '#9CA3AF', fontFamily: 'monospace' },
  networkToggle: { borderStyle: 'dashed', borderWidth: 2, borderColor: '#6B7280', padding: 14, borderRadius: 10, alignItems: 'center', marginTop: 10 },
  toggleBtnText: { color: '#374151', fontWeight: '700', fontSize: 13 },
  overlayMask: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', alignItems: 'center', zIndex: 999 },
  overlayText: { color: '#FFFFFF', marginTop: 10, fontWeight: '600', fontSize: 14 }
});
```

---

## 🚀 Execution Instructions for AI
1. Parse all files and preserve signature validation constraints.
2. Build the state management logic such that local state is persistently written using standard Expo data persistence methodologies.
3. Ensure formatting is production-ready with zero ellipses or truncation flags within the designated files.