import React from 'react';
import { Tabs } from 'expo-router';
import PillTabBar from '@/components/PillTabBar';

export default function TabLayout() {
  return (
    <Tabs tabBar={() => <PillTabBar />} screenOptions={{ headerShown: false }}>
      <Tabs.Screen name="home" />
      <Tabs.Screen name="receive" />
      <Tabs.Screen name="pay" />
      <Tabs.Screen name="sync" />
      <Tabs.Screen name="settings" />
    </Tabs>
  );
}
