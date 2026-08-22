import React, { useState } from 'react';
import { Alert, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { KeyRound } from 'lucide-react-native';
import { useTheme } from '@/contexts/ThemeContext';
import { useWallet } from '@/contexts/WalletContext';
import Logo from '@/components/Logo';
import ActionButton from '@/components/ActionButton';

const DEFAULT_RECOVERY = '0x8ba1f109551bD432803012645Hac136c22C177e';

export default function Setup() {
  const router = useRouter();
  const { theme } = useTheme();
  const { createWallet } = useWallet();
  const [recovery, setRecovery] = useState(DEFAULT_RECOVERY);
  const [loading, setLoading] = useState(false);

  const handleCreate = async () => {
    setLoading(true);
    try {
      await new Promise((r) => setTimeout(r, 700));
      await createWallet(recovery.trim() || DEFAULT_RECOVERY);
      router.replace('/home');
    } catch (e) {
      Alert.alert('Setup Error', 'Could not provision hardware-tied keys. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: theme.background }}>
      <SafeAreaView className="flex-1 px-8">
        <View className="flex-1 items-center justify-center">
          <View
            style={{ backgroundColor: theme.accentSoft }}
            className="w-16 h-16 rounded-2xl items-center justify-center mb-6"
          >
            <KeyRound size={26} color={theme.accent} />
          </View>
          <Logo size={40} style={{ marginBottom: 16 }} />
          <Text style={{ color: theme.text }} className="text-2xl font-black text-center">
            Provision your Secure Enclave
          </Text>
          <Text style={{ color: theme.textSecondary }} className="text-sm text-center mt-3 leading-5">
            OffTap generates a hardware-tied secp256r1 key pair on this device. Add a recovery
            address in case this device is ever lost or destroyed.
          </Text>

          <View className="w-full mt-8">
            <Text style={{ color: theme.textSecondary }} className="text-xs font-semibold uppercase tracking-wide mb-2">
              Recovery address
            </Text>
            <TextInput
              value={recovery}
              onChangeText={setRecovery}
              autoCapitalize="none"
              autoCorrect={false}
              style={{ backgroundColor: theme.inputBg, color: theme.text, borderColor: theme.border }}
              className="rounded-2xl px-4 py-3.5 text-sm border font-mono"
              placeholder="0x…"
              placeholderTextColor={theme.textMuted}
            />
          </View>
        </View>

        <View className="pb-8">
          <ActionButton title="Generate Keys & Continue" onPress={handleCreate} loading={loading} />
        </View>
      </SafeAreaView>
    </View>
  );
}
