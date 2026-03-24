import { AntDesign } from '@expo/vector-icons';
import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

type FlameStreakBadgeProps = {
  days: number;
  size?: number;
};

export default function FlameStreakBadge({ days, size = 76 }: FlameStreakBadgeProps) {
  const styles = useMemo(() => createStyles(size), [size]);

  return (
    <View style={styles.wrap}>
      <View style={styles.fireWrap}>
        <AntDesign name="fire" size={Math.max(34, size * 0.56)} color="#111111" style={styles.flameIcon} />
        <Text style={styles.dayCount}>{days}</Text>
      </View>
    </View>
  );
}

const createStyles = (size: number) =>
  StyleSheet.create({
    wrap: {
      alignItems: 'center',
      justifyContent: 'center',
    },
    fireWrap: {
      width: size,
      height: size,
      alignItems: 'center',
      justifyContent: 'center',
      position: 'relative',
    },
    flameIcon: {
      position: 'absolute',
      top: Math.max(7, size * 0.06),
    },
    dayCount: {
      color: '#FFFFFF',
      fontSize: Math.max(14, size * 0.24),
      fontWeight: '800',
      lineHeight: Math.max(16, size * 0.26),
      marginTop: Math.max(4, size * 0.08),
    },
  });
