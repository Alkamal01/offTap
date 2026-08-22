import React, { useEffect } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { useTheme } from '@/contexts/ThemeContext';
import { useWallet } from '@/contexts/WalletContext';

export default function Index() {
  const router = useRouter();
  const { theme } = useTheme();
  const { wallet, isReady } = useWallet();

  useEffect(() => {
    if (!isReady) return;
    router.replace(wallet ? '/home' : '/onboarding');
  }, [isReady, wallet]);

  return (
    <View style={{ flex: 1, backgroundColor: theme.background }} className="items-center justify-center">
      <ActivityIndicator size="large" color={theme.accent} />
    </View>
  );
}
