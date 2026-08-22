import React, { useState } from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { CheckCircle2, Delete, Radio, Zap } from 'lucide-react-native';
import { useTheme } from '@/contexts/ThemeContext';
import { useWallet } from '@/contexts/WalletContext';
import ActionButton from '@/components/ActionButton';
import { CompactPayload } from '@/lib/transport/LocalTransportService';
import { BleStatus, isNativeAvailable, statusLabel } from '@/lib/transport/BleTransportService';

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0', 'del'];
const MAX_AMOUNT_LENGTH = 9;

export default function Pay() {
  const { theme } = useTheme();
  const { wallet, payOffline } = useWallet();
  const [amountStr, setAmountStr] = useState('10');
  const [status, setStatus] = useState<'idle' | 'signing' | 'success' | 'error'>('idle');
  const [statusText, setStatusText] = useState('Signing with Secure Enclave…');
  const [error, setError] = useState('');
  const [lastPayload, setLastPayload] = useState<CompactPayload | null>(null);

  const amount = parseFloat(amountStr) || 0;

  const handleKeyPress = (key: string) => {
    Haptics.selectionAsync();
    if (key === 'del') {
      setAmountStr((prev) => (prev.length <= 1 ? '0' : prev.slice(0, -1)));
      return;
    }
    if (key === '.') {
      setAmountStr((prev) => (prev.includes('.') ? prev : `${prev}.`));
      return;
    }
    setAmountStr((prev) => {
      if (prev.length >= MAX_AMOUNT_LENGTH) return prev;
      const decimalIndex = prev.indexOf('.');
      if (decimalIndex !== -1 && prev.length - decimalIndex > 2) return prev;
      return prev === '0' ? key : prev + key;
    });
  };

  const handlePay = async () => {
    setStatus('signing');
    setStatusText('Signing with Secure Enclave…');
    setError('');
    try {
      const payload = await payOffline(amount, (bleStatus: BleStatus) => setStatusText(statusLabel(bleStatus)));
      setLastPayload(payload);
      setStatus('success');
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e: any) {
      setError(e?.message ?? 'Something went wrong.');
      setStatus('error');
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    }
  };

  const handleReset = () => {
    setStatus('idle');
    setLastPayload(null);
    setAmountStr('10');
  };

  if (!wallet) return null;

  const disablePay = status === 'signing' || amount <= 0 || wallet.offlineBalance < amount;

  return (
    <View style={{ flex: 1, backgroundColor: theme.background }}>
      <SafeAreaView className="flex-1 px-8">
        <View className="pt-4 pb-2">
          <Text style={{ color: theme.text }} className="text-2xl font-black">
            Pay
          </Text>
          <Text style={{ color: theme.textSecondary }} className="text-sm mt-1">
            Signs offline with your hardware-tied key, then sends it over Bluetooth.
          </Text>
          {!isNativeAvailable() && (
            <Text style={{ color: theme.textMuted }} className="text-xs mt-2">
              Bluetooth simulated in this build — install the OffTap dev-client build for a real radio.
            </Text>
          )}
        </View>

        <View className="flex-1 items-center justify-center">
          {status === 'success' && lastPayload ? (
            <View className="items-center">
              <View
                style={{ backgroundColor: theme.successSoft }}
                className="w-20 h-20 rounded-full items-center justify-center mb-5"
              >
                <CheckCircle2 size={36} color={theme.success} />
              </View>
              <Text style={{ color: theme.text }} className="text-xl font-black">
                Tap complete
              </Text>
              <Text style={{ color: theme.textSecondary }} className="text-sm mt-2 text-center">
                Sequence #{lastPayload.nonce} · ${lastPayload.amount} sent
              </Text>
              <View
                style={{ backgroundColor: theme.inputBg, borderColor: theme.border }}
                className="mt-5 px-4 py-3 rounded-2xl border"
              >
                <Text style={{ color: theme.textMuted }} className="text-[11px] font-mono">
                  sig: {lastPayload.r.substring(0, 24)}…
                </Text>
              </View>
            </View>
          ) : (
            <View className="items-center w-full">
              <View
                style={{ backgroundColor: theme.accentSoft }}
                className="w-20 h-20 rounded-full items-center justify-center mb-4"
              >
                {status === 'signing' ? (
                  <Radio size={32} color={theme.accent} />
                ) : (
                  <Zap size={32} color={theme.accent} />
                )}
              </View>
              <Text style={{ color: theme.text }} className="text-4xl font-black">
                ${amountStr}
              </Text>
              <Text style={{ color: theme.textSecondary }} className="text-sm mt-2">
                {status === 'signing' ? statusText : 'Enter amount to pay'}
              </Text>
              {status === 'error' && (
                <Text style={{ color: theme.danger }} className="text-sm mt-3 text-center">
                  {error}
                </Text>
              )}

              {status !== 'signing' && (
                <View className="w-full mt-6">
                  {[
                    ['1', '2', '3'],
                    ['4', '5', '6'],
                    ['7', '8', '9'],
                    ['.', '0', 'del'],
                  ].map((row, i) => (
                    <View key={i} className="flex-row justify-between mb-3">
                      {row.map((key) => (
                        <TouchableOpacity
                          key={key}
                          onPress={() => handleKeyPress(key)}
                          activeOpacity={0.6}
                          style={{ backgroundColor: theme.inputBg }}
                          className="w-[30%] h-14 rounded-2xl items-center justify-center"
                        >
                          {key === 'del' ? (
                            <Delete size={20} color={theme.text} />
                          ) : (
                            <Text style={{ color: theme.text }} className="text-xl font-bold">
                              {key}
                            </Text>
                          )}
                        </TouchableOpacity>
                      ))}
                    </View>
                  ))}
                </View>
              )}
            </View>
          )}
        </View>

        <View style={{ paddingBottom: 120 }}>
          <ActionButton
            title={status === 'success' ? 'Send another' : 'Sign & Tap to Pay'}
            icon={Zap}
            onPress={status === 'success' ? handleReset : handlePay}
            loading={status === 'signing'}
            disabled={status === 'success' ? false : disablePay}
          />
          {status !== 'success' && wallet.offlineBalance < amount && (
            <Text style={{ color: theme.textMuted }} className="text-xs text-center mt-3">
              Not enough in your Secure Enclave — lock more funds from Home.
            </Text>
          )}
        </View>
      </SafeAreaView>
    </View>
  );
}
