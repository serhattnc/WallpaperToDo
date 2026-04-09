import AppLogo from '@/components/app-logo';
import {
    FriendRequestItem,
    acceptIncomingRequest,
    loadIncomingRequests,
    rejectIncomingRequest,
} from '@/constants/friends-storage';
import { Feather } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { Stack, useRouter } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { FlatList, Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function NotificationsScreen() {
  const router = useRouter();
  const [incomingRequests, setIncomingRequests] = useState<FriendRequestItem[]>([]);

  const loadRequests = useCallback(async () => {
    const incoming = await loadIncomingRequests();
    setIncomingRequests(incoming);
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadRequests();
    }, [loadRequests])
  );

  const onAccept = async (item: FriendRequestItem) => {
    await acceptIncomingRequest(item.id);
    await loadRequests();
  };

  const onReject = async (item: FriendRequestItem) => {
    await rejectIncomingRequest(item.id);
    await loadRequests();
  };

  return (
    <SafeAreaView style={styles.container}>
      <Stack.Screen options={{ headerShown: false }} />

      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Feather name="arrow-left" size={20} color="#111827" />
        </TouchableOpacity>
        <AppLogo size={36} />
      </View>

      <Text style={styles.title}>Bildirimler</Text>
      <Text style={styles.subtitle}>Gelen arkadaslik isteklerini buradan yonet.</Text>

      <FlatList
        data={incomingRequests}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={<Text style={styles.emptyText}>Su an gelen bir istek yok.</Text>}
        renderItem={({ item }) => {
          const initial = item.username.slice(0, 1).toUpperCase();
          return (
            <View style={styles.card}>
              <View style={styles.userInfo}>
                {item.avatarUrl ? (
                  <Image source={{ uri: item.avatarUrl }} style={styles.avatar} />
                ) : (
                  <View style={styles.avatarFallback}>
                    <Text style={styles.avatarText}>{initial}</Text>
                  </View>
                )}
                <Text style={styles.username}>{item.username}</Text>
              </View>

              <View style={styles.actions}>
                <TouchableOpacity style={styles.rejectButton} onPress={() => onReject(item)}>
                  <Text style={styles.rejectText}>Reddet</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.acceptButton} onPress={() => onAccept(item)}>
                  <Text style={styles.acceptText}>Kabul Et</Text>
                </TouchableOpacity>
              </View>
            </View>
          );
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 20,
    paddingTop: 10,
  },
  header: {
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
    position: 'relative',
  },
  backButton: {
    position: 'absolute',
    left: 0,
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 24,
    fontWeight: '800',
    color: '#111827',
    marginBottom: 6,
  },
  subtitle: {
    fontSize: 14,
    color: '#6B7280',
    marginBottom: 14,
  },
  listContent: {
    paddingBottom: 24,
  },
  card: {
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 12,
    padding: 12,
    marginBottom: 10,
    backgroundColor: '#FFFFFF',
  },
  userInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  avatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#F3F4F6',
  },
  avatarFallback: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#E5E7EB',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    color: '#111827',
    fontSize: 13,
    fontWeight: '700',
  },
  username: {
    marginLeft: 10,
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
  },
  rejectButton: {
    borderWidth: 1,
    borderColor: '#FCA5A5',
    backgroundColor: '#FEF2F2',
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  acceptButton: {
    backgroundColor: '#111827',
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  rejectText: {
    color: '#991B1B',
    fontSize: 13,
    fontWeight: '700',
  },
  acceptText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  emptyText: {
    textAlign: 'center',
    color: '#6B7280',
    fontSize: 14,
    marginTop: 12,
  },
});
