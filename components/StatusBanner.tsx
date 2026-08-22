import React from 'react';
import { Text, View } from 'react-native';
import { Wifi, WifiOff } from 'lucide-react-native';
import { useTheme } from '@/contexts/ThemeContext';

export default function StatusBanner({ isOnline }: { isOnline: boolean }) {
  const { theme } = useTheme();
  const Icon = isOnline ? Wifi : WifiOff;
  const label = isOnline ? 'Online' : 'Offline — Shadow Mode';
  const color = isOnline ? theme.success : theme.warning;
  const bg = isOnline ? theme.successSoft : theme.warningSoft;

  return (
    <View
      style={{ backgroundColor: bg }}
      className="flex-row items-center justify-center gap-2 py-2.5 px-4 rounded-full self-center"
    >
      <Icon size={14} color={color} />
      <Text style={{ color }} className="text-xs font-bold uppercase tracking-wide">
        {label}
      </Text>
    </View>
  );
}
