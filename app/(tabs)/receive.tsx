import React, { useEffect, useRef, useState } from 'react';
import { Alert, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { RadioTower, CheckCircle2 } from 'lucide-react-native';
import { useTheme } from '@/contexts/ThemeContext';
import { useWallet } from '@/contexts/WalletContext';
import { BleStatus, isNativeAvailable, statusLabel } from '@/lib/transport/BleTransportService';
import { CompactPayload } from '@/lib/transport/LocalTransportService';
import ActionButton from '@/components/ActionButton';

const RECEIVED_BANNER_MS = 2500;

export default function Receive() {
  const { theme } = useTheme();
  const { startListeningForTaps, stopListening, pendingQueue } = useWallet();
  const [listening, setListening] = useState(false);
  const [starting, setStarting] = useState(false);
  const [statusText, setStatusText] = useState('Ready to receive');
  const [justReceived, setJustReceived] = useState<CompactPayload | null>(null);
  const revertTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      stopListening();
      if (revertTimer.current) clearTimeout(revertTimer.current);
    };
  }, [stopListening]);

  const handleToggle = async () => {
    if (listening) {
      stopListening();
      setListening(false);
      setStatusText('Ready to receive');
      return;
    }

    setStarting(true);
    setJustReceived(null);
    try {
      await startListeningForTaps(
        (status: BleStatus) => setStatusText(statusLabel(status)),
        (payload) => {
          setJustReceived(payload);
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          revertTimer.current = setTimeout(() => setJustReceived(null), RECEIVED_BANNER_MS);
        }
      );
      setListening(true);
    } catch (e: any) {
      Alert.alert('Bluetooth Error', e?.message ?? 'Could not start listening.');
    } finally {
      setStarting(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: theme.background }}>
      <SafeAreaView className="flex-1 px-8">
        <View className="pt-4 pb-2">
          <Text style={{ color: theme.text }} className="text-2xl font-black">
            Receive
          </Text>
          <Text style={{ color: theme.textSecondary }} className="text-sm mt-1">
            Advertises over Bluetooth, verifies an incoming tap offline, and queues it for merchant sync.
          </Text>
          {!isNativeAvailable() && (
            <Text style={{ color: theme.textMuted }} className="text-xs mt-2">
              Bluetooth simulated in this build — install the OffTap dev-client build for a real radio.
            </Text>
          )}
        </View>

        <View className="flex-1 items-center justify-center">
          {justReceived ? (
            <View className="items-center">
              <View
                style={{ backgroundColor: theme.successSoft }}
                className="w-20 h-20 rounded-full items-center justify-center mb-5"
              >
                <CheckCircle2 size={36} color={theme.success} />
              </View>
              <Text style={{ color: theme.text }} className="text-xl font-black">
                Payload accepted
              </Text>
              <Text style={{ color: theme.textSecondary }} className="text-sm mt-2 text-center">
                Seq #{justReceived.nonce} · ${justReceived.amount} queued locally
              </Text>
            </View>
          ) : (
            <View className="items-center">
              <View
                style={{ backgroundColor: theme.accentSoft }}
                className="w-28 h-28 rounded-full items-center justify-center mb-6"
              >
                <RadioTower size={44} color={listening ? theme.accent : theme.textMuted} />
              </View>
              <Text style={{ color: theme.text }} className="text-lg font-bold">
                {listening ? statusText : 'Ready to receive'}
              </Text>
              <Text style={{ color: theme.textMuted }} className="text-sm mt-2 text-center">
                {pendingQueue.length} payment{pendingQueue.length === 1 ? '' : 's'} queued for sync
              </Text>
            </View>
          )}
        </View>

        <View style={{ paddingBottom: 120 }}>
          <ActionButton
            title={listening ? 'Stop Listening' : 'Start Listening'}
            icon={RadioTower}
            variant={listening ? 'secondary' : 'primary'}
            onPress={handleToggle}
            loading={starting}
          />
        </View>
      </SafeAreaView>
    </View>
  );
}
