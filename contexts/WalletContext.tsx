import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import * as SecureStore from 'expo-secure-store';

export interface CloakIdentity {
  displayName: string;
  publicKey: string;
  createdAt: string;
}

interface WalletContextValue {
  wallet: CloakIdentity | null;
  isReady: boolean;
  createWallet: (displayName: string) => Promise<void>;
}

const IDENTITY_KEY = 'cloak.identity';
const WalletContext = createContext<WalletContextValue | undefined>(undefined);

export function WalletProvider({ children }: { children: React.ReactNode }) {
  const [wallet, setWallet] = useState<CloakIdentity | null>(null);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    SecureStore.getItemAsync(IDENTITY_KEY)
      .then((stored) => {
        if (stored) setWallet(JSON.parse(stored) as CloakIdentity);
      })
      .finally(() => setIsReady(true));
  }, []);

  const createWallet = useCallback(async (displayName: string) => {
    const identity: CloakIdentity = {
      displayName: displayName.trim() || 'Alice',
      publicKey: `npub1cloak${Date.now().toString(36)}`,
      createdAt: new Date().toISOString(),
    };
    await SecureStore.setItemAsync(IDENTITY_KEY, JSON.stringify(identity));
    setWallet(identity);
  }, []);

  const value = useMemo(() => ({ wallet, isReady, createWallet }), [wallet, isReady, createWallet]);
  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}

export function useWallet() {
  const ctx = useContext(WalletContext);
  if (!ctx) throw new Error('useWallet must be used within a WalletProvider');
  return ctx;
}
