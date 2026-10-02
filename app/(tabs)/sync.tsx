import React, { useEffect, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AlertTriangle, CheckCircle2, ShieldCheck, XCircle } from 'lucide-react-native';
import { useTheme } from '@/contexts/ThemeContext';
import ActionButton from '@/components/ActionButton';
import { buildDemoDisclosures, verifyDisclosure, type DisclosureVerification } from '@/lib/prooftrade/fixtures';

function CheckRow({ label, ok }: { label: string; ok: boolean }) {
  const { theme } = useTheme();
  return (
    <View className="flex-row items-center gap-2 py-1.5">
      {ok ? <CheckCircle2 size={16} color={theme.success} /> : <XCircle size={16} color={theme.danger} />}
      <Text style={{ color: theme.textSecondary }} className="text-sm">
        {label}
      </Text>
    </View>
  );
}

export default function Proofs() {
  const { theme } = useTheme();
  const [valid, setValid] = useState<DisclosureVerification | null>(null);
  const [tampered, setTampered] = useState<DisclosureVerification | null>(null);

  const runVerification = async () => {
    const disclosures = await buildDemoDisclosures();
    setValid(await verifyDisclosure(disclosures.bob));
    setTampered(await verifyDisclosure(disclosures.tampered));
  };

  useEffect(() => {
    runVerification();
  }, []);

  return (
    <View style={{ flex: 1, backgroundColor: theme.background }}>
      <SafeAreaView className="flex-1">
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 130 }}>
          <View className="px-6 pt-4">
            <Text style={{ color: theme.text }} className="text-2xl font-black">
              Proofs
            </Text>
            <Text style={{ color: theme.textSecondary }} className="text-sm mt-1">
              Disclosure packages are verified on this device without asking a Cloak server.
            </Text>
          </View>

          <View className="px-6 mt-6">
            <View style={{ backgroundColor: theme.surface, borderColor: theme.border }} className="rounded-3xl border p-5">
              <View className="flex-row items-center gap-3 mb-4">
                <View style={{ backgroundColor: theme.successSoft }} className="w-11 h-11 rounded-2xl items-center justify-center">
                  <ShieldCheck size={21} color={theme.success} />
                </View>
                <View>
                  <Text style={{ color: theme.text }} className="text-lg font-black">
                    Bob disclosure
                  </Text>
                  <Text style={{ color: theme.textMuted }} className="text-xs">
                    {valid?.validCount ?? 0} unique proofs received
                  </Text>
                </View>
              </View>
              {valid?.results.map((result, index) => (
                <View key={`${result.receiptId}-${index}`} style={{ borderTopColor: index ? theme.border : 'transparent' }} className="py-3 border-t">
                  <Text style={{ color: theme.text }} className="text-sm font-bold mb-1">
                    Receipt {index + 1}{result.duplicate ? ' duplicate' : ''}
                  </Text>
                  <CheckRow label="Receipt integrity valid" ok={result.integrityValid} />
                  <CheckRow label="Both parties signed" ok={result.bothPartiesSigned} />
                  <CheckRow label="Signatures match expected identities" ok={result.partyASignatureValid && result.partyBSignatureValid} />
                  <CheckRow label="Receipt belongs to Bob" ok={result.subjectMatches} />
                  {result.duplicate && (
                    <Text style={{ color: theme.warning }} className="text-xs mt-1">
                      Duplicate receipt ignored.
                    </Text>
                  )}
                </View>
              ))}
            </View>
          </View>

          <View className="px-6 mt-6">
            <View style={{ backgroundColor: theme.surface, borderColor: theme.border }} className="rounded-3xl border p-5">
              <View className="flex-row items-center gap-3 mb-4">
                <View style={{ backgroundColor: theme.dangerSoft }} className="w-11 h-11 rounded-2xl items-center justify-center">
                  <AlertTriangle size={21} color={theme.danger} />
                </View>
                <View>
                  <Text style={{ color: theme.text }} className="text-lg font-black">
                    Tampered receipt demo
                  </Text>
                  <Text style={{ color: theme.textMuted }} className="text-xs">
                    Changed counterparty after signing
                  </Text>
                </View>
              </View>
              {tampered?.results.map((result, index) => (
                <View key={`${result.receiptId}-${index}`}>
                  <CheckRow label="Receipt contents match signatures" ok={result.partyASignatureValid && result.partyBSignatureValid} />
                  <CheckRow label="Subject matches disclosure" ok={result.subjectMatches} />
                  <Text style={{ color: theme.danger }} className="text-sm font-bold mt-3">
                    Invalid proof. Receipt contents do not match the cryptographic signatures.
                  </Text>
                </View>
              ))}
            </View>
          </View>

          <View className="px-6 mt-6">
            <View style={{ backgroundColor: theme.inputBg }} className="rounded-2xl p-4">
              <Text style={{ color: theme.textSecondary }} className="text-sm leading-5">
                Bitcoin or Lightning settlement evidence can support a receipt, but it does not prove delivery or honest behavior by itself.
              </Text>
            </View>
          </View>

          <View className="px-6 mt-6">
            <ActionButton title="Verify Again" icon={ShieldCheck} variant="secondary" onPress={runVerification} />
          </View>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}
