import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useEffect, useMemo, useRef } from 'react';
import {
    Animated,
    Modal,
    Pressable,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';

type SideSliderProps = {
  visible: boolean;
  onClose: () => void;
  currentRoute: 'home' | 'calendar' | 'profile';
};

const DRAWER_WIDTH = 270;

export default function SideSlider({ visible, onClose, currentRoute }: SideSliderProps) {
  const router = useRouter();
  const slideAnim = useRef(new Animated.Value(-DRAWER_WIDTH)).current;

  useEffect(() => {
    Animated.timing(slideAnim, {
      toValue: visible ? 0 : -DRAWER_WIDTH,
      duration: 220,
      useNativeDriver: true,
    }).start();
  }, [slideAnim, visible]);

  const menuItems = useMemo(
    () => [{ key: 'profile', label: 'Profile', icon: 'user', route: '/(tabs)/profile' as const }],
    []
  );

  const navigate = (route: '/(tabs)/profile') => {
    onClose();
    router.navigate(route);
  };

  return (
    <Modal transparent visible={visible} animationType="none" onRequestClose={onClose}>
      <View style={styles.wrapper}>
        <Pressable style={styles.backdrop} onPress={onClose} />

        <Animated.View style={[styles.drawer, { transform: [{ translateX: slideAnim }] }]}>
          <Text style={styles.title}>Menu</Text>

          {menuItems.map((item) => {
            const isActive = currentRoute === item.key;
            return (
              <TouchableOpacity
                key={item.key}
                style={styles.item}
                onPress={() => navigate(item.route)}
                activeOpacity={0.85}
              >
                <Feather name={item.icon as 'user'} size={18} color="#111827" />
                <Text style={[styles.itemText, isActive && styles.itemTextActive]}>{item.label}</Text>
              </TouchableOpacity>
            );
          })}
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    flex: 1,
    flexDirection: 'row',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.3)',
  },
  drawer: {
    width: DRAWER_WIDTH,
    backgroundColor: '#FFFFFF',
    paddingTop: 72,
    paddingHorizontal: 16,
    borderRightWidth: 0,
  },
  title: {
    fontSize: 20,
    fontWeight: '800',
    color: '#111827',
    marginBottom: 16,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 2,
    minHeight: 50,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  itemText: {
    marginLeft: 10,
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
  },
  itemTextActive: {
    color: '#111827',
    fontWeight: '800',
  },
});
