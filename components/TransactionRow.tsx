import React from 'react';
import { Text, View } from 'react-native';
import { ArrowDownLeft, ArrowUpRight } from 'lucide-react-native';
import { useTheme } from '@/contexts/ThemeContext';
import { QueuedTransaction } from '@/lib/state/LocalStateEngine';

function timeAgo(ts: number): string {
  const diffMs = Date.now() - ts;
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return new Date(ts).toLocaleDateString();
}

interface TransactionRowProps {
  tx: QueuedTransaction;
  direction: 'in' | 'out';
  showDivider?: boolean;
}

export default function TransactionRow({ tx, direction, showDivider = true }: TransactionRowProps) {
  const { theme } = useTheme();
  const isIn = direction === 'in';
  const Icon = isIn ? ArrowDownLeft : ArrowUpRight;
  const iconColor = isIn ? theme.success : theme.text;
  const iconBg = isIn ? theme.successSoft : theme.accentSoft;

  return (
    <View
      style={{ borderTopColor: theme.border, borderTopWidth: showDivider ? 1 : 0 }}
      className="p-4 flex-row items-center"
    >
      <View style={{ backgroundColor: iconBg }} className="w-10 h-10 rounded-full items-center justify-center mr-3">
        <Icon size={17} color={iconColor} />
      </View>
      <View className="flex-1">
        <Text style={{ color: theme.text }} className="font-semibold text-sm">
          {isIn ? 'Received tap' : 'Sent tap'} · #{tx.nonce}
        </Text>
        <Text style={{ color: theme.textMuted }} className="text-xs font-mono mt-0.5">
          {tx.r.substring(0, 14)}…
        </Text>
      </View>
      <View className="items-end">
        <Text style={{ color: isIn ? theme.success : theme.text }} className="font-bold text-sm">
          {isIn ? '+' : '-'}${tx.amount}
        </Text>
        <Text style={{ color: theme.textMuted }} className="text-[10px] mt-0.5">
          {timeAgo(tx.createdAt)}
        </Text>
      </View>
    </View>
  );
}
