import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { HardwareSecurityBridge } from '@/lib/security/HardwareSecurityBridge';
import { LocalTransportService, CompactPayload } from '@/lib/transport/LocalTransportService';
import { LocalStateEngine, WalletState, QueuedTransaction } from '@/lib/state/LocalStateEngine';
import { MonadSettlementClient, SettlementResult } from '@/lib/chain/MonadSettlementClient';

const MOCK_MERCHANT_ADDR = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8';
const OFFLINE_TOP_UP_AMOUNT = 50;
const TAP_TO_PAY_AMOUNT = 10;

interface WalletContextValue {
  wallet: WalletState | null;
  isReady: boolean;
  isOnline: boolean;
  isProcessing: boolean;
  pendingQueue: QueuedTransaction[];
  settledHistory: QueuedTransaction[];
  currentNonce: number;
  toggleOnline: () => void;
  createWallet: (recoveryAddress: string) => Promise<void>;
  lockToOfflineVault: (amount?: number) => Promise<void>;
  payOffline: (amount?: number) => Promise<CompactPayload>;
  receiveOffline: (payload: CompactPayload) => Promise<void>;
  syncBatchToMonad: () => Promise<SettlementResult>;
  refreshQueue: () => Promise<void>;
}

const WalletContext = createContext<WalletContextValue | undefined>(undefined);

export function WalletProvider({ children }: { children: React.ReactNode }) {
  const [wallet, setWallet] = useState<WalletState | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [isOnline, setIsOnline] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [pendingQueue, setPendingQueue] = useState<QueuedTransaction[]>([]);
  const [settledHistory, setSettledHistory] = useState<QueuedTransaction[]>([]);
  const [currentNonce, setCurrentNonce] = useState(0);

  const refreshQueue = useCallback(async () => {
    const [pending, settled] = await Promise.all([
      LocalStateEngine.getPendingSyncQueue(),
      LocalStateEngine.getSettledHistory(),
    ]);
    setPendingQueue(pending);
    setSettledHistory(settled);
  }, []);

  useEffect(() => {
    (async () => {
      await HardwareSecurityBridge.hydrate();
      setCurrentNonce(HardwareSecurityBridge.getCurrentNonce());
      const existing = await LocalStateEngine.getWalletState();
      if (existing) {
        setWallet(existing);
        await refreshQueue();
      }
      setIsReady(true);
    })();
  }, [refreshQueue]);

  const toggleOnline = useCallback(() => setIsOnline((prev) => !prev), []);

  const createWallet = useCallback(async (recoveryAddress: string) => {
    const keys = await HardwareSecurityBridge.generateHardwareTiedKeys();
    const initialWallet: WalletState = {
      address: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb9226',
      onlineBalance: 250,
      offlineBalance: 0,
      hardwareX: keys.publicKeyX,
      hardwareY: keys.publicKeyY,
      recoveryAddress,
    };
    await LocalStateEngine.initializeStorage(initialWallet);
    setWallet(initialWallet);
    setCurrentNonce(0);
  }, []);

  const lockToOfflineVault = useCallback(
    async (amount: number = OFFLINE_TOP_UP_AMOUNT) => {
      if (!wallet) return;
      if (wallet.onlineBalance < amount) throw new Error('Insufficient funds on-chain.');
      setIsProcessing(true);
      try {
        await new Promise((r) => setTimeout(r, 900));
        const next = await LocalStateEngine.updateBalances(
          wallet.onlineBalance - amount,
          wallet.offlineBalance + amount
        );
        if (next) setWallet(next);
      } finally {
        setIsProcessing(false);
      }
    },
    [wallet]
  );

  const payOffline = useCallback(
    async (amount: number = TAP_TO_PAY_AMOUNT) => {
      if (!wallet) throw new Error('No wallet');
      if (wallet.offlineBalance < amount) throw new Error('Secure vault has insufficient balance.');

      const sigPacket = await HardwareSecurityBridge.signOfflineTransaction(
        wallet.address,
        MOCK_MERCHANT_ADDR,
        String(amount * 1e18)
      );

      const payload: CompactPayload = {
        user: wallet.address,
        merchant: MOCK_MERCHANT_ADDR,
        amount: String(amount),
        nonce: sigPacket.nonce,
        r: sigPacket.signatureR,
        s: sigPacket.signatureS,
      };

      const serialized = LocalTransportService.serializePayload(payload);
      const sent = await LocalTransportService.transmitViaNFC(serialized);
      if (!sent) throw new Error('NFC transmission failed');

      const next = await LocalStateEngine.updateBalances(wallet.onlineBalance, wallet.offlineBalance - amount);
      if (next) setWallet(next);
      setCurrentNonce(sigPacket.nonce);

      return payload;
    },
    [wallet]
  );

  const receiveOffline = useCallback(
    async (payload: CompactPayload) => {
      await LocalStateEngine.queueInboundOfflinePayment(payload);
      await refreshQueue();
    },
    [refreshQueue]
  );

  const syncBatchToMonad = useCallback(async () => {
    if (!isOnline) throw new Error('Re-establish internet connection to resolve pending ledgers on Monad.');
    if (pendingQueue.length === 0) throw new Error('No local transaction payloads require reconciliation.');

    setIsProcessing(true);
    try {
      const result = await MonadSettlementClient.settleBatch(pendingQueue);
      await LocalStateEngine.markQueueSettled();
      await refreshQueue();
      return result;
    } finally {
      setIsProcessing(false);
    }
  }, [isOnline, pendingQueue, refreshQueue]);

  const value = useMemo(
    () => ({
      wallet,
      isReady,
      isOnline,
      isProcessing,
      pendingQueue,
      settledHistory,
      currentNonce,
      toggleOnline,
      createWallet,
      lockToOfflineVault,
      payOffline,
      receiveOffline,
      syncBatchToMonad,
      refreshQueue,
    }),
    [
      wallet,
      isReady,
      isOnline,
      isProcessing,
      pendingQueue,
      settledHistory,
      currentNonce,
      toggleOnline,
      createWallet,
      lockToOfflineVault,
      payOffline,
      receiveOffline,
      syncBatchToMonad,
      refreshQueue,
    ]
  );

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}

export function useWallet() {
  const ctx = useContext(WalletContext);
  if (!ctx) throw new Error('useWallet must be used within a WalletProvider');
  return ctx;
}
