import React, { useCallback, useState } from 'react';
import { Alert, RefreshControl, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Bell, Inbox, Lock, Send, User } from 'lucide-react-native';
import { useTheme } from '@/contexts/ThemeContext';
import { useWallet } from '@/contexts/WalletContext';
import BalanceCard from '@/components/BalanceCard';
import ActionButton from '@/components/ActionButton';
import TransactionRow from '@/components/TransactionRow';

export default function Home() {
  const router = useRouter();
  const { theme } = useTheme();
  const { wallet, isOnline, isProcessing, lockToOfflineVault, pendingQueue, settledHistory, refreshQueue } =
    useWallet();
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refreshQueue();
    setRefreshing(false);
  }, [refreshQueue]);

  const handleLock = async () => {
    try {
      await lockToOfflineVault();
    } catch (e: any) {
      Alert.alert('Error', e?.message ?? 'Could not lock funds.');
    }
  };

  const handleNotifications = () => {
    Alert.alert('Notifications', 'No new notifications.');
  };

  if (!wallet) return null;

  const recentActivity = [...pendingQueue, ...settledHistory].sort((a, b) => b.createdAt - a.createdAt).slice(0, 4);

  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

  return (
    <View style={{ flex: 1, backgroundColor: theme.background }}>
      <SafeAreaView className="flex-1">
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: 130 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.accent} />}
        >
          <View className="px-6 pt-2 pb-4 flex-row items-center justify-between">
            <View className="flex-row items-center gap-3">
              <TouchableOpacity
                onPress={() => router.push('/settings')}
                style={{ backgroundColor: theme.accentSoft }}
                className="w-10 h-10 rounded-full items-center justify-center"
              >
                <User size={18} color={theme.accent} />
              </TouchableOpacity>
              <View>
                <Text style={{ color: theme.text }} className="text-sm font-bold">
                  {greeting}
                </Text>
                <Text style={{ color: theme.textMuted }} className="text-xs">
                  {wallet.address.slice(0, 6)}…{wallet.address.slice(-4)}
                </Text>
              </View>
            </View>
            <TouchableOpacity
              onPress={handleNotifications}
              style={{ backgroundColor: theme.inputBg }}
              className="w-10 h-10 rounded-full items-center justify-center"
            >
              <Bell size={18} color={theme.textSecondary} />
            </TouchableOpacity>
          </View>

          <View className="px-6 mt-2 mb-4">
            <BalanceCard
              label="Monad L1 (On-Chain)"
              amount={wallet.onlineBalance}
              topRightIcon={Lock}
              onTopRightPress={handleLock}
              topRightLoading={isProcessing}
              topRightDisabled={!isOnline || wallet.onlineBalance < 50}
              footer={
                <View className="flex-row gap-3 mt-4">
                  <ActionButton
                    title="Send"
                    icon={Send}
                    onPress={() => router.push('/pay')}
                    className="flex-1"
                  />
                  <ActionButton
                    title="Receive"
                    icon={Inbox}
                    variant="secondary"
                    onPress={() => router.push('/receive')}
                    className="flex-1"
                  />
                </View>
              }
            />
          </View>

          <View className="px-6 mb-6">
            <BalanceCard
              label="Secure Enclave (Offline Vault)"
              amount={wallet.offlineBalance}
              accentColor={theme.accent}
            />
          </View>

          <View className="px-6">
            <Text style={{ color: theme.text }} className="font-extrabold text-lg mb-3">
              Recent activity
            </Text>
            <View
              style={{ backgroundColor: theme.surface, borderColor: theme.border }}
              className="rounded-3xl border overflow-hidden"
            >
              {recentActivity.length === 0 ? (
                <View className="p-6 items-center">
                  <Text style={{ color: theme.textMuted }} className="text-sm text-center">
                    Your offline taps will show up here.
                  </Text>
                </View>
              ) : (
                recentActivity.map((tx, i) => (
                  <TransactionRow key={tx.id} tx={tx} direction="in" showDivider={i > 0} />
                ))
              )}
            </View>
          </View>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}
