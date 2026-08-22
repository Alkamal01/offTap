import React, { useState } from 'react';
import { Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ScrollView } from 'react-native';
import { CheckCircle2, RefreshCw } from 'lucide-react-native';
import { useTheme } from '@/contexts/ThemeContext';
import { useWallet } from '@/contexts/WalletContext';
import ActionButton from '@/components/ActionButton';
import TransactionRow from '@/components/TransactionRow';
import { SettlementResult } from '@/lib/chain/MonadSettlementClient';

export default function Sync() {
  const { theme } = useTheme();
  const { isOnline, pendingQueue, settledHistory, syncBatchToMonad, isProcessing } = useWallet();
  const [lastResult, setLastResult] = useState<SettlementResult | null>(null);
  const [error, setError] = useState('');

  const handleSync = async () => {
    setError('');
    try {
      const result = await syncBatchToMonad();
      setLastResult(result);
    } catch (e: any) {
      setError(e?.message ?? 'Sync failed.');
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: theme.background }}>
      <SafeAreaView className="flex-1">
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 130 }}>
          <View className="px-6 pt-4 pb-2">
            <Text style={{ color: theme.text }} className="text-2xl font-black">
              Merchant sync
            </Text>
            <Text style={{ color: theme.textSecondary }} className="text-sm mt-1">
              Batch-settle queued offline taps to Monad in one parallel transaction.
            </Text>
          </View>

          {lastResult && (
            <View className="px-6 mt-4">
              <View
                style={{ backgroundColor: theme.successSoft }}
                className="rounded-2xl p-4 flex-row items-center gap-3"
              >
                <CheckCircle2 size={20} color={theme.success} />
                <View className="flex-1">
                  <Text style={{ color: theme.text }} className="font-bold text-sm">
                    Settled {lastResult.settledCount} payment{lastResult.settledCount === 1 ? '' : 's'} · $
                    {lastResult.totalVolume.toFixed(2)}
                  </Text>
                  <Text style={{ color: theme.textMuted }} className="text-[11px] font-mono mt-0.5">
                    tx: {lastResult.txHash.substring(0, 20)}…
                  </Text>
                </View>
              </View>
            </View>
          )}

          <View className="px-6 mt-6">
            <Text style={{ color: theme.text }} className="font-extrabold text-lg mb-3">
              Pending queue ({pendingQueue.length})
            </Text>
            <View
              style={{ backgroundColor: theme.surface, borderColor: theme.border }}
              className="rounded-3xl border overflow-hidden"
            >
              {pendingQueue.length === 0 ? (
                <View className="p-6 items-center">
                  <Text style={{ color: theme.textMuted }} className="text-sm text-center">
                    No un-synchronized payloads cached on this device.
                  </Text>
                </View>
              ) : (
                pendingQueue.map((tx, i) => <TransactionRow key={tx.id} tx={tx} direction="in" showDivider={i > 0} />)
              )}
            </View>

            {error !== '' && (
              <Text style={{ color: theme.danger }} className="text-sm mt-3 text-center">
                {error}
              </Text>
            )}

            <ActionButton
              title="Sync Batch to Monad"
              icon={RefreshCw}
              onPress={handleSync}
              loading={isProcessing}
              disabled={!isOnline || pendingQueue.length === 0}
              className="mt-4"
            />
          </View>

          {settledHistory.length > 0 && (
            <View className="px-6 mt-8">
              <Text style={{ color: theme.text }} className="font-extrabold text-lg mb-3">
                Settled history
              </Text>
              <View
                style={{ backgroundColor: theme.surface, borderColor: theme.border }}
                className="rounded-3xl border overflow-hidden"
              >
                {settledHistory.map((tx, i) => (
                  <TransactionRow key={tx.id} tx={tx} direction="in" showDivider={i > 0} />
                ))}
              </View>
            </View>
          )}
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}
