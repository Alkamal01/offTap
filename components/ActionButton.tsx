import React from 'react';
import { ActivityIndicator, Text, TouchableOpacity, TouchableOpacityProps } from 'react-native';
import { LucideIcon } from 'lucide-react-native';
import { useTheme } from '@/contexts/ThemeContext';

interface ActionButtonProps extends TouchableOpacityProps {
  title: string;
  icon?: LucideIcon;
  variant?: 'primary' | 'secondary' | 'outline';
  loading?: boolean;
  className?: string;
}

export default function ActionButton({
  title,
  icon: Icon,
  variant = 'primary',
  loading = false,
  disabled,
  className = '',
  style,
  ...props
}: ActionButtonProps) {
  const { theme } = useTheme();

  const bg = variant === 'primary' ? theme.accent : variant === 'secondary' ? theme.inputBg : 'transparent';
  const textColor = variant === 'primary' ? theme.accentFg : theme.text;
  const borderColor = variant === 'outline' ? theme.border : 'transparent';

  return (
    <TouchableOpacity
      disabled={disabled || loading}
      style={[
        {
          backgroundColor: bg,
          borderColor,
          borderWidth: variant === 'outline' ? 1.5 : 0,
          opacity: disabled ? 0.5 : 1,
        },
        style,
      ]}
      className={`py-3.5 rounded-2xl flex-row items-center justify-center gap-2 ${className}`}
      activeOpacity={0.85}
      {...props}
    >
      {loading ? (
        <ActivityIndicator size="small" color={textColor} />
      ) : (
        <>
          {Icon && <Icon size={17} color={textColor} />}
          <Text style={{ color: textColor }} className="font-bold text-[15px]">
            {title}
          </Text>
        </>
      )}
    </TouchableOpacity>
  );
}
