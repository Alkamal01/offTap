import React from 'react';
import { ScrollView, Switch, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Fingerprint, Hash, Moon, ShieldAlert, Sun, Wifi } from 'lucide-react-native';
import { useTheme } from '@/contexts/ThemeContext';
import { useWallet } from '@/contexts/WalletContext';
import Logo from '@/components/Logo';

function Row({
  icon: Icon,
  label,
  value,
  mono = false,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  mono?: boolean;
}) {
  const { theme } = useTheme();
  return (
    <View style={{ borderTopColor: theme.border }} className="flex-row items-center gap-3 py-4 border-t first:border-t-0">
      <Icon size={16} color={theme.textMuted} />
      <Text style={{ color: theme.textSecondary }} className="text-sm flex-1">
        {label}
      </Text>
      <Text style={{ color: theme.text }} className={`text-sm font-semibold ${mono ? 'font-mono' : ''}`} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

export default function Settings() {
  const { theme, mode, setMode, isDark } = useTheme();
  const { wallet, isOnline, toggleOnline, currentNonce } = useWallet();

  if (!wallet) return null;

  return (
    <View style={{ flex: 1, backgroundColor: theme.background }}>
      <SafeAreaView className="flex-1">
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 130 }}>
          <View className="px-6 pt-4 pb-2">
            <Text style={{ color: theme.text }} className="text-2xl font-black">
              Settings
            </Text>
          </View>

          <View className="px-6 mt-6 items-center">
            <Logo size={48} />
            <Text style={{ color: theme.textMuted }} className="text-xs mt-3">
              OffTap v1.0.0
            </Text>
          </View>

          <View className="px-6 mt-8">
            <Text style={{ color: theme.textSecondary }} className="text-xs font-semibold uppercase tracking-wide mb-2">
              Hardware Secure Enclave
            </Text>
            <View style={{ backgroundColor: theme.surface, borderColor: theme.border }} className="rounded-2xl border px-4">
              <Row icon={Fingerprint} label="Public key (X)" value={`${wallet.hardwareX.slice(0, 10)}…`} mono />
              <Row icon={Fingerprint} label="Public key (Y)" value={`${wallet.hardwareY.slice(0, 10)}…`} mono />
              <Row icon={Hash} label="Monotonic nonce" value={String(currentNonce)} />
              <Row icon={ShieldAlert} label="Recovery address" value={`${wallet.recoveryAddress.slice(0, 10)}…`} mono />
            </View>
          </View>

          <View className="px-6 mt-8">
            <Text style={{ color: theme.textSecondary }} className="text-xs font-semibold uppercase tracking-wide mb-2">
              Network
            </Text>
            <View
              style={{ backgroundColor: theme.surface, borderColor: theme.border }}
              className="rounded-2xl border px-4 flex-row items-center py-4"
            >
              <Wifi size={16} color={theme.textMuted} />
              <Text style={{ color: theme.textSecondary }} className="text-sm flex-1 ml-3">
                Simulate online connection
              </Text>
              <Switch
                value={isOnline}
                onValueChange={toggleOnline}
                trackColor={{ false: theme.border, true: theme.successSoft }}
                thumbColor={isOnline ? theme.success : theme.textMuted}
              />
            </View>
          </View>

          <View className="px-6 mt-8">
            <Text style={{ color: theme.textSecondary }} className="text-xs font-semibold uppercase tracking-wide mb-2">
              Appearance
            </Text>
            <View
              style={{ backgroundColor: theme.surface, borderColor: theme.border }}
              className="rounded-2xl border px-4 flex-row items-center py-4"
            >
              {isDark ? <Moon size={16} color={theme.textMuted} /> : <Sun size={16} color={theme.textMuted} />}
              <Text style={{ color: theme.textSecondary }} className="text-sm flex-1 ml-3">
                Dark mode
              </Text>
              <Switch
                value={mode === 'dark'}
                onValueChange={(v) => setMode(v ? 'dark' : 'light')}
                trackColor={{ false: theme.border, true: theme.successSoft }}
                thumbColor={mode === 'dark' ? theme.success : theme.textMuted}
              />
            </View>
          </View>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}
