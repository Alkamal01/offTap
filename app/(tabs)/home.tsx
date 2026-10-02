import React from 'react';
import { ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Bell, FileSignature, QrCode, ScanLine, ShieldCheck, Users } from 'lucide-react-native';
import { useTheme } from '@/contexts/ThemeContext';
import ActionButton from '@/components/ActionButton';
import { localIdentity } from '@/lib/prooftrade/fixtures';

function Stat({ label, value }: { label: string; value: string }) {
  const { theme } = useTheme();
  return (
    <View style={{ backgroundColor: theme.inputBg }} className="flex-1 rounded-2xl px-4 py-3">
      <Text style={{ color: theme.text }} className="text-lg font-black">
        {value}
      </Text>
      <Text style={{ color: theme.textMuted }} className="text-xs mt-1">
        {label}
      </Text>
    </View>
  );
}

export default function Home() {
  const router = useRouter();
  const { theme } = useTheme();

  return (
    <View style={{ flex: 1, backgroundColor: theme.background }}>
      <SafeAreaView className="flex-1">
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 130 }}>
          <View className="px-6 pt-3 pb-4 flex-row items-center justify-between">
            <View>
              <Text style={{ color: theme.text }} className="text-3xl font-black">
                Cloak
              </Text>
              <Text style={{ color: theme.textSecondary }} className="text-sm mt-1">
                Verify trust. Reveal less.
              </Text>
            </View>
            <TouchableOpacity style={{ backgroundColor: theme.inputBg }} className="w-10 h-10 rounded-full items-center justify-center">
              <Bell size={18} color={theme.textSecondary} />
            </TouchableOpacity>
          </View>

          <View className="px-6 mt-2">
            <View style={{ backgroundColor: theme.surface, borderColor: theme.border }} className="rounded-3xl border p-5">
              <View className="flex-row items-center gap-3">
                <View style={{ backgroundColor: theme.accentSoft }} className="w-12 h-12 rounded-2xl items-center justify-center">
                  <ShieldCheck size={23} color={theme.accent} />
                </View>
                <View className="flex-1">
                  <Text style={{ color: theme.text }} className="text-lg font-black">
                    {localIdentity.displayName}
                  </Text>
                  <Text style={{ color: theme.textMuted }} className="text-xs font-mono" numberOfLines={1}>
                    {localIdentity.npub}
                  </Text>
                </View>
              </View>
              <View className="flex-row gap-3 mt-5">
                <Stat label="Identity age" value={`${localIdentity.establishedMonths} mo`} />
                <Stat label="Stored proofs" value="3" />
                <Stat label="Pending" value="2" />
              </View>
            </View>
          </View>

          <View className="px-6 mt-7">
            <Text style={{ color: theme.text }} className="text-lg font-black mb-3">
              Quick actions
            </Text>
            <View className="flex-row gap-3 mb-3">
              <ActionButton title="Check Someone" icon={ScanLine} onPress={() => router.push('/receive')} className="flex-1" />
              <ActionButton title="Request Proof" icon={ShieldCheck} variant="secondary" onPress={() => router.push('/receive')} className="flex-1" />
            </View>
            <View className="flex-row gap-3">
              <ActionButton title="Create Receipt" icon={FileSignature} variant="secondary" onPress={() => router.push('/pay')} className="flex-1" />
              <ActionButton title="Show My QR" icon={QrCode} variant="outline" onPress={() => router.push('/settings')} className="flex-1" />
            </View>
          </View>

          <View className="px-6 mt-8">
            <Text style={{ color: theme.text }} className="text-lg font-black mb-3">
              Pending
            </Text>
            <View style={{ backgroundColor: theme.surface, borderColor: theme.border }} className="rounded-3xl border overflow-hidden">
              {[
                ['Alice is requesting trust evidence', 'Choose which receipts to disclose'],
                ['Receipt proposal from Bob Electronics', 'Review outcome before signing'],
              ].map(([title, subtitle], index) => (
                <View key={title} style={{ borderTopColor: index ? theme.border : 'transparent' }} className="px-5 py-4 border-t">
                  <View className="flex-row items-center gap-3">
                    <Users size={17} color={theme.accent} />
                    <View className="flex-1">
                      <Text style={{ color: theme.text }} className="text-sm font-bold">
                        {title}
                      </Text>
                      <Text style={{ color: theme.textMuted }} className="text-xs mt-1">
                        {subtitle}
                      </Text>
                    </View>
                  </View>
                </View>
              ))}
            </View>
          </View>

          <View className="px-6 mt-8">
            <Text style={{ color: theme.textSecondary }} className="text-sm leading-5">
              Private by default. Public by choice. Cloak presents signed evidence; people decide what it means.
            </Text>
          </View>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}
