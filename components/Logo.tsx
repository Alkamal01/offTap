import React from 'react';
import { Image, ImageStyle, StyleProp } from 'react-native';

interface LogoProps {
  size?: number;
  style?: StyleProp<ImageStyle>;
}

export default function Logo({ size = 64, style }: LogoProps) {
  return (
    <Image
      source={require('../logo.png')}
      style={[{ width: size, height: size * (639 / 588) }, style]}
      resizeMode="contain"
    />
  );
}
