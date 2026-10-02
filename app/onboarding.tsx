import React from 'react';
import { Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { EyeOff, ShieldCheck, Users } from 'lucide-react-native';
import { useTheme } from '@/contexts/ThemeContext';
import Logo from '@/components/Logo';
import ActionButton from '@/components/ActionButton';

const points = [
  { icon: ShieldCheck, text: 'Verify mutually signed trade receipts locally.' },
  { icon: EyeOff, text: 'Receipts stay private until you choose what to share.' },
  { icon: Users, text: 'Names and photos are not identity. Cryptographic keys are.' },
];

export default function Onboarding() {
  const router = useRouter();
  const { theme } = useTheme();

  return (
    <View style={{ flex: 1, backgroundColor: theme.background }}>
      <SafeAreaView className="flex-1 px-8">
        <View className="flex-1 items-center justify-center">
          <Logo size={104} />
          <Text style={{ color: theme.text }} className="text-3xl font-black mt-8 text-center">
            Verify trust.{'\n'}Reveal less.
          </Text>
          <Text style={{ color: theme.textSecondary }} className="text-[15px] text-center mt-3 leading-5 px-4">
            Cloak lets people selectively disclose private ProofTrade receipts as evidence of previous economic interactions.
          </Text>

          <View className="w-full mt-10 gap-4">
            {points.map((p, i) => (
              <View key={i} className="flex-row items-center gap-3">
                <View
                  style={{ backgroundColor: theme.accentSoft }}
                  className="w-9 h-9 rounded-full items-center justify-center"
                >
                  <p.icon size={16} color={theme.accent} />
                </View>
                <Text style={{ color: theme.textSecondary }} className="text-sm flex-1">
                  {p.text}
                </Text>
              </View>
            ))}
          </View>
        </View>

        <View className="pb-8">
          <ActionButton title="Get Started" onPress={() => router.push('/setup')} />
        </View>
      </SafeAreaView>
    </View>
  );
}
