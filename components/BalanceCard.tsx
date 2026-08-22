import React, { useState } from 'react';
import { ActivityIndicator, Text, TouchableOpacity, View } from 'react-native';
import { Eye, EyeOff, LucideIcon } from 'lucide-react-native';
import { useTheme } from '@/contexts/ThemeContext';

interface BalanceCardProps {
  label: string;
  amount: number;
  denom?: string;
  accentColor?: string;
  footer?: React.ReactNode;
  topRightIcon?: LucideIcon;
  onTopRightPress?: () => void;
  topRightLoading?: boolean;
  topRightDisabled?: boolean;
}

export default function BalanceCard({
  label,
  amount,
  denom = 'USDC',
  accentColor,
  footer,
  topRightIcon: TopRightIcon,
  onTopRightPress,
  topRightLoading,
  topRightDisabled,
}: BalanceCardProps) {
  const { theme } = useTheme();
  const [visible, setVisible] = useState(true);
  const amountColor = accentColor ?? theme.text;

  return (
    <View
      style={{
        backgroundColor: theme.surface,
        borderColor: theme.border,
        shadowColor: '#0F172A',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.06,
        shadowRadius: 20,
        elevation: 3,
      }}
      className="p-6 rounded-3xl border"
    >
      <View className="flex-row justify-between items-center mb-3">
        <Text style={{ color: theme.textSecondary }} className="text-xs font-semibold uppercase tracking-wide">
          {label}
        </Text>
        <View className="flex-row items-center gap-3">
          {TopRightIcon && (
            <TouchableOpacity
              onPress={onTopRightPress}
              disabled={topRightLoading || topRightDisabled}
              style={{ backgroundColor: theme.accentSoft, opacity: topRightDisabled ? 0.4 : 1 }}
              className="w-8 h-8 rounded-full items-center justify-center"
            >
              {topRightLoading ? (
                <ActivityIndicator size="small" color={theme.accent} />
              ) : (
                <TopRightIcon size={14} color={theme.accent} />
              )}
            </TouchableOpacity>
          )}
          <TouchableOpacity onPress={() => setVisible((v) => !v)} hitSlop={8}>
            {visible ? (
              <Eye size={16} color={theme.textMuted} />
            ) : (
              <EyeOff size={16} color={theme.textMuted} />
            )}
          </TouchableOpacity>
        </View>
      </View>

      <Text style={{ color: amountColor }} className="text-[34px] font-black mb-1">
        {visible ? `$${amount.toFixed(2)}` : '$ ••••'}
        <Text style={{ color: theme.textMuted }} className="text-base font-medium">
          {' '}
          {denom}
        </Text>
      </Text>

      {footer}
    </View>
  );
}
