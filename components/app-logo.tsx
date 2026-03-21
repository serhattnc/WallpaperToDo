import React from 'react';
import { Image, StyleSheet, View } from 'react-native';

type AppLogoProps = {
  size?: number;
};

export default function AppLogo({ size = 80 }: AppLogoProps) {
  return (
    <View style={[styles.container, { width: size, height: size }]}>
      <Image
        source={require('@/assets/images/check-circle.png')}
        style={{ width: size * 0.9, height: size * 0.9 }}
        resizeMode="contain"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
  },
});