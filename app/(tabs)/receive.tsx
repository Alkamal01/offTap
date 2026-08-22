import React from 'react';
import { Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { RadioTower } from 'lucide-react-native';
import { useTheme } from '@/contexts/ThemeContext';
import { useWallet } from '@/contexts/WalletContext';

export default function Receive() {
  const { theme } = useTheme();
  const { pendingQueue } = useWallet();

  return (
    <View style={{ flex: 1, backgroundColor: theme.background }}>
      <SafeAreaView className="flex-1 px-8">
        <View className="pt-4 pb-2">
          <Text style={{ color: theme.text }} className="text-2xl font-black">
            Receive
          </Text>
          <Text style={{ color: theme.textSecondary }} className="text-sm mt-1">
            Listens for an incoming tap, verifies it offline, and queues it for merchant sync.
          </Text>
        </View>

        <View className="flex-1 items-center justify-center">
          <View className="items-center">
            <View
              style={{ backgroundColor: theme.accentSoft }}
              className="w-28 h-28 rounded-full items-center justify-center mb-6"
            >
              <RadioTower size={44} color={theme.textMuted} />
            </View>
            <Text style={{ color: theme.text }} className="text-lg font-bold">
              Ready to receive
            </Text>
            <Text style={{ color: theme.textMuted }} className="text-sm mt-2 text-center">
              {pendingQueue.length} payment{pendingQueue.length === 1 ? '' : 's'} queued for sync
            </Text>
          </View>
        </View>
      </SafeAreaView>
    </View>
  );
}
