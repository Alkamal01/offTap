import React from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { useRouter, usePathname } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Home, Inbox, Zap, RefreshCw, Settings } from 'lucide-react-native';
import { useTheme } from '@/contexts/ThemeContext';

interface NavItem {
  icon: React.ElementType;
  label: string;
  route: string;
  tabName: string;
}

const navItems: NavItem[] = [
  { icon: Home, label: 'Home', route: '/home', tabName: 'home' },
  { icon: Inbox, label: 'Receive', route: '/receive', tabName: 'receive' },
  { icon: Zap, label: '', route: '/pay', tabName: 'pay' },
  { icon: RefreshCw, label: 'Sync', route: '/sync', tabName: 'sync' },
  { icon: Settings, label: 'Settings', route: '/settings', tabName: 'settings' },
];

export default function PillTabBar() {
  const router = useRouter();
  const pathname = usePathname();
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();

  const isActive = (item: NavItem) => pathname === `/${item.tabName}`;

  return (
    <View style={{ position: 'absolute', bottom: insets.bottom + 16, left: 20, right: 20 }}>
      <View
        style={{
          backgroundColor: theme.surface,
          borderColor: theme.border,
          shadowColor: '#0F172A',
          shadowOffset: { width: 0, height: 6 },
          shadowOpacity: 0.12,
          shadowRadius: 16,
          elevation: 10,
          borderRadius: 999,
          height: 76,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingHorizontal: 20,
        }}
        className="border"
      >
        {navItems.map((item, index) => {
          const active = isActive(item);
          const Icon = item.icon;

          if (index === 2) {
            return (
              <TouchableOpacity key={item.tabName} onPress={() => router.push(item.route as any)} style={{ marginTop: -30 }}>
                <View
                  style={{
                    backgroundColor: theme.accent,
                    width: 60,
                    height: 60,
                    borderRadius: 30,
                    alignItems: 'center',
                    justifyContent: 'center',
                    shadowColor: '#0F172A',
                    shadowOffset: { width: 0, height: 4 },
                    shadowOpacity: 0.3,
                    shadowRadius: 8,
                    elevation: 8,
                  }}
                >
                  <Icon size={24} color={theme.accentFg} />
                </View>
              </TouchableOpacity>
            );
          }

          return (
            <TouchableOpacity key={item.tabName} onPress={() => router.push(item.route as any)} style={{ alignItems: 'center', gap: 3 }}>
              <Icon size={22} color={active ? theme.accent : theme.textMuted} />
              <Text style={{ color: active ? theme.accent : theme.textMuted, fontSize: 10, fontWeight: '600' }}>
                {item.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}
