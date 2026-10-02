import React, { useEffect, useState } from 'react';
import { ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Check, Copy, EyeOff, ScanLine, ShieldCheck } from 'lucide-react-native';
import { useTheme } from '@/contexts/ThemeContext';
import ActionButton from '@/components/ActionButton';
import { buildDemoDisclosures, people, verifyDisclosure, type DisclosureVerification } from '@/lib/prooftrade/fixtures';

export default function People() {
  const { theme } = useTheme();
  const [selected, setSelected] = useState(people[0]);
  const [verification, setVerification] = useState<DisclosureVerification | null>(null);

  useEffect(() => {
    setVerification(null);
  }, [selected.id]);

  const requestProof = async () => {
    const disclosures = await buildDemoDisclosures();
    const pkg = selected.id === 'cloak_bob_legit' ? disclosures.bob : disclosures.clone;
    setVerification(await verifyDisclosure(pkg));
  };

  return (
    <View style={{ flex: 1, backgroundColor: theme.background }}>
      <SafeAreaView className="flex-1">
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 130 }}>
          <View className="px-6 pt-4">
            <Text style={{ color: theme.text }} className="text-2xl font-black">
              People
            </Text>
            <Text style={{ color: theme.textSecondary }} className="text-sm mt-1">
              Scan a Cloak identity, paste an npub, or choose a known contact.
            </Text>
          </View>

          <View className="px-6 mt-6">
            <ActionButton title="Scan QR Identity" icon={ScanLine} />
          </View>

          <View className="px-6 mt-6">
            <Text style={{ color: theme.textSecondary }} className="text-xs font-semibold uppercase mb-2">
              Demo identities
            </Text>
            <View className="flex-row gap-3">
              {people.map((person) => {
                const active = selected.id === person.id;
                return (
                  <TouchableOpacity
                    key={person.id}
                    onPress={() => setSelected(person)}
                    style={{ backgroundColor: active ? theme.accent : theme.surface, borderColor: active ? theme.accent : theme.border }}
                    className="flex-1 rounded-2xl border p-4"
                  >
                    <Text style={{ color: active ? theme.accentFg : theme.text }} className="font-black text-sm">
                      {person.displayName}
                    </Text>
                    <Text style={{ color: active ? theme.accentFg : theme.textMuted }} className="text-xs mt-1">
                      {person.id === 'cloak_clone' ? 'Identity B' : 'Identity A'}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          <View className="px-6 mt-6">
            <View style={{ backgroundColor: theme.surface, borderColor: theme.border }} className="rounded-3xl border p-5">
              <View className="flex-row items-start justify-between gap-4">
                <View className="flex-1">
                  <Text style={{ color: theme.text }} className="text-2xl font-black">
                    {selected.displayName}
                  </Text>
                  <Text style={{ color: theme.textSecondary }} className="text-sm mt-1">
                    Identity established {selected.establishedMonths} month{selected.establishedMonths === 1 ? '' : 's'} ago
                  </Text>
                </View>
                <View style={{ backgroundColor: theme.accentSoft }} className="w-11 h-11 rounded-2xl items-center justify-center">
                  <EyeOff size={20} color={theme.accent} />
                </View>
              </View>

              <View style={{ backgroundColor: theme.inputBg }} className="rounded-2xl px-4 py-3 mt-5">
                <Text style={{ color: theme.textMuted }} className="text-xs">
                  Public key hidden
                </Text>
                <Text style={{ color: theme.text }} className="text-xs font-mono mt-1" numberOfLines={1}>
                  {selected.npub}
                </Text>
              </View>

              {[
                ['Relationship', selected.relationship],
                ['Your network', selected.networkPath ?? 'No previous relationship'],
                ['Trade evidence', verification ? `${verification.validCount} unique proofs received` : 'Private'],
              ].map(([label, value]) => (
                <View key={label} style={{ borderTopColor: theme.border }} className="flex-row py-3 border-t mt-3">
                  <Text style={{ color: theme.textMuted }} className="text-sm flex-1">
                    {label}
                  </Text>
                  <Text style={{ color: theme.text }} className="text-sm font-bold flex-1 text-right">
                    {value}
                  </Text>
                </View>
              ))}

              <ActionButton title="Request Proof" icon={ShieldCheck} onPress={requestProof} className="mt-4" />
            </View>
          </View>

          {verification && (
            <View className="px-6 mt-6">
              <View style={{ backgroundColor: theme.surface, borderColor: theme.border }} className="rounded-3xl border p-5">
                <View className="flex-row items-center gap-3 mb-3">
                  <Check size={20} color={theme.success} />
                  <Text style={{ color: theme.text }} className="text-lg font-black">
                    {verification.validCount} proofs received
                  </Text>
                </View>
                {verification.results.length === 0 ? (
                  <Text style={{ color: theme.textSecondary }} className="text-sm">
                    No receipts were disclosed. A matching name or profile is not transaction evidence.
                  </Text>
                ) : (
                  verification.results.map((result, index) => (
                    <View key={`${result.receiptId}-${index}`} style={{ borderTopColor: index ? theme.border : 'transparent' }} className="py-3 border-t">
                      <Text style={{ color: theme.text }} className="font-bold text-sm">
                        Receipt {index + 1}{result.duplicate ? ' duplicate ignored' : ''}
                      </Text>
                      <Text style={{ color: result.valid ? theme.success : theme.danger }} className="text-xs mt-1">
                        {result.valid ? 'Integrity valid, both parties signed, subject matches.' : 'Receipt did not pass local verification.'}
                      </Text>
                    </View>
                  ))
                )}
                {verification.duplicateCount > 0 && (
                  <Text style={{ color: theme.warning }} className="text-xs mt-2">
                    {verification.duplicateCount} duplicate receipt ignored.
                  </Text>
                )}
                <View className="flex-row items-center gap-2 mt-4">
                  <Copy size={14} color={theme.textMuted} />
                  <Text style={{ color: theme.textMuted }} className="text-xs flex-1">
                    Evidence confirms signed outcomes only. It does not guarantee future behavior.
                  </Text>
                </View>
              </View>
            </View>
          )}
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}
