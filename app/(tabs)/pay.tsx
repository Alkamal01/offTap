import React, { useState } from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CheckCircle2, FileSignature, QrCode } from 'lucide-react-native';
import { useTheme } from '@/contexts/ThemeContext';
import ActionButton from '@/components/ActionButton';
import { people, type ProofTradeOutcome } from '@/lib/prooftrade/fixtures';

const outcomes: ProofTradeOutcome[] = ['COMPLETED', 'DISPUTED', 'CANCELLED'];

export default function CreateReceipt() {
  const { theme } = useTheme();
  const [outcome, setOutcome] = useState<ProofTradeOutcome>('COMPLETED');
  const [signed, setSigned] = useState(false);
  const bob = people[0];

  return (
    <View style={{ flex: 1, backgroundColor: theme.background }}>
      <SafeAreaView className="flex-1 px-6">
        <View className="pt-4">
          <Text style={{ color: theme.text }} className="text-2xl font-black">
            Create Receipt
          </Text>
          <Text style={{ color: theme.textSecondary }} className="text-sm mt-1">
            Both parties must sign the same receipt before it becomes private trade evidence.
          </Text>
        </View>

        <View className="flex-1 justify-center">
          {signed ? (
            <View className="items-center">
              <View style={{ backgroundColor: theme.successSoft }} className="w-20 h-20 rounded-full items-center justify-center mb-5">
                <CheckCircle2 size={36} color={theme.success} />
              </View>
              <Text style={{ color: theme.text }} className="text-xl font-black text-center">
                Receipt proposed
              </Text>
              <Text style={{ color: theme.textSecondary }} className="text-sm mt-2 text-center leading-5">
                You signed a {outcome.toLowerCase()} attestation. Bob must independently review and sign before this becomes fully signed evidence.
              </Text>
            </View>
          ) : (
            <View>
              <View style={{ backgroundColor: theme.surface, borderColor: theme.border }} className="rounded-3xl border p-5">
                <View className="flex-row items-center gap-3">
                  <View style={{ backgroundColor: theme.accentSoft }} className="w-12 h-12 rounded-2xl items-center justify-center">
                    <FileSignature size={23} color={theme.accent} />
                  </View>
                  <View className="flex-1">
                    <Text style={{ color: theme.text }} className="text-lg font-black">
                      Create Trade Proof
                    </Text>
                    <Text style={{ color: theme.textMuted }} className="text-xs">
                      Counterparty: {bob.displayName}
                    </Text>
                  </View>
                </View>

                <Text style={{ color: theme.textSecondary }} className="text-xs font-semibold uppercase mt-6 mb-2">
                  Outcome
                </Text>
                <View className="gap-3">
                  {outcomes.map((item) => {
                    const active = item === outcome;
                    return (
                      <TouchableOpacity
                        key={item}
                        onPress={() => setOutcome(item)}
                        style={{ backgroundColor: active ? theme.accent : theme.inputBg, borderColor: active ? theme.accent : theme.border }}
                        className="rounded-2xl border px-4 py-4 flex-row items-center justify-between"
                      >
                        <Text style={{ color: active ? theme.accentFg : theme.text }} className="font-bold">
                          {item[0] + item.slice(1).toLowerCase()}
                        </Text>
                        {active && <CheckCircle2 size={18} color={theme.accentFg} />}
                      </TouchableOpacity>
                    );
                  })}
                </View>

                <View style={{ backgroundColor: theme.inputBg }} className="rounded-2xl p-4 mt-5">
                  <Text style={{ color: theme.textSecondary }} className="text-sm leading-5">
                    Do not include phone numbers, shipping addresses, product descriptions, or exact fiat amounts in the public receipt.
                  </Text>
                </View>
              </View>
            </View>
          )}
        </View>

        <View style={{ paddingBottom: 120 }}>
          <ActionButton
            title={signed ? 'Create Another' : 'Propose Receipt'}
            icon={signed ? QrCode : FileSignature}
            onPress={() => setSigned((value) => !value)}
          />
        </View>
      </SafeAreaView>
    </View>
  );
}
