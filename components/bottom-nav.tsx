import { AntDesign, Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';

type BottomTab = 'home' | 'calendar' | 'friends' | null;

type BottomNavProps = {
  activeTab?: BottomTab;
};

export default function BottomNav({ activeTab = null }: BottomNavProps) {
  const router = useRouter();

  return (
    <View style={styles.bottomNav}>
      <TouchableOpacity style={styles.tabItem} onPress={() => router.navigate('/(tabs)/home')}>
        <Feather name="home" size={24} color="black" />
        {activeTab === 'home' ? <View style={styles.activeTabDot} /> : null}
      </TouchableOpacity>

      <TouchableOpacity style={styles.tabItem} onPress={() => router.navigate('/(tabs)/calendar')}>
        <Feather name="calendar" size={24} color="black" />
        {activeTab === 'calendar' ? <View style={styles.activeTabDot} /> : null}
      </TouchableOpacity>

      <TouchableOpacity style={styles.navPlusContainer} onPress={() => router.navigate('/(tabs)/add-friend')}>
        <AntDesign name="plus" size={24} color="black" />
      </TouchableOpacity>

      <TouchableOpacity style={styles.tabItem}>
        <Feather name="clipboard" size={24} color="black" />
      </TouchableOpacity>

      <TouchableOpacity style={styles.tabItem} onPress={() => router.navigate('/(tabs)/friends')}>
        <Feather name="users" size={24} color="black" />
        {activeTab === 'friends' ? <View style={styles.activeTabDot} /> : null}
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  bottomNav: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderTopWidth: 1,
    borderTopColor: '#eee',
  },
  tabItem: {
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 28,
  },
  activeTabDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: 'black',
    marginTop: 4,
  },
  navPlusContainer: {
    width: 30,
    height: 30,
    borderRadius: 7,
    borderWidth: 2,
    borderColor: 'black',
    justifyContent: 'center',
    alignItems: 'center',
  },
});
