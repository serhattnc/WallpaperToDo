import AppLogo from '@/components/app-logo';
import {
    loadFriends,
    loadOutgoingRequests,
    sendFriendRequest,
} from '@/constants/friends-storage';
import { supabase } from '@/constants/supabase';
import { Feather } from '@expo/vector-icons';
import { Stack, useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
    Alert,
    FlatList,
    Image,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

type DiscoverUser = {
  id: string;
  username: string;
  avatarUrl: string | null;
};


const normalizeAsUsername = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_\.]/g, '');

const normalizeForSearch = (value: string) =>
  value
    .toLowerCase()
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/ı/g, 'i')
    .replace(/ğ/g, 'g')
    .replace(/ü/g, 'u')
    .replace(/ş/g, 's')
    .replace(/ö/g, 'o')
    .replace(/ç/g, 'c');

const isFuzzyMatch = (candidate: string, rawQuery: string) => {
  const query = normalizeForSearch(rawQuery.trim());
  const text = normalizeForSearch(candidate);
  if (!query) return true;
  if (text.includes(query)) return true;

  let qIndex = 0;
  for (let i = 0; i < text.length && qIndex < query.length; i += 1) {
    if (text[i] === query[qIndex]) qIndex += 1;
  }

  return qIndex >= Math.max(2, Math.ceil(query.length * 0.7));
};

export default function AddFriendScreen() {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [existingFriends, setExistingFriends] = useState<Set<string>>(new Set());
  const [outgoingRequests, setOutgoingRequests] = useState<Set<string>>(new Set());
  const [currentUserId, setCurrentUserId] = useState('');
  const [usernameResults, setUsernameResults] = useState<DiscoverUser[]>([]);
  const [isSearchingUsers, setIsSearchingUsers] = useState(false);
  const [disableRemoteSearch, setDisableRemoteSearch] = useState(false);

  useEffect(() => {
    const bootstrap = async () => {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        setCurrentUserId(user?.id || '');

        const currentFriends = await loadFriends();
        setExistingFriends(new Set(currentFriends.map((item) => item.id)));

        const outgoing = await loadOutgoingRequests();
        setOutgoingRequests(new Set(outgoing.map((item) => item.userId)));
      } catch {
        setExistingFriends(new Set());
        setOutgoingRequests(new Set());
        setCurrentUserId('');
      }
    };

    bootstrap();
  }, []);

  const searchLower = query.trim().toLowerCase();

  useEffect(() => {
    let alive = true;

    const searchUsers = async () => {
      if (!searchLower) {
        setUsernameResults([]);
        setIsSearchingUsers(false);
        return;
      }

      setIsSearchingUsers(true);

      let results: DiscoverUser[] = [];

      if (!disableRemoteSearch) {
        const tableCandidates = ['profiles', 'user_profiles'];

        for (const tableName of tableCandidates) {
          try {
            const { data, error } = await supabase
              .from(tableName)
              .select('id,username,avatar_url')
              .limit(80);

            if (error || !Array.isArray(data)) {
              continue;
            }

            results = data
              .map((row) => ({
                id: String((row as { id?: string }).id || ''),
                username: String((row as { username?: string }).username || '').trim(),
                avatarUrl:
                  typeof (row as { avatar_url?: string | null }).avatar_url === 'string'
                    ? ((row as { avatar_url?: string }).avatar_url as string)
                    : null,
              }))
              .filter((item) => item.id.length > 0 && item.username.length > 0)
              .filter((item) => isFuzzyMatch(item.username, searchLower))
              .filter((item) => item.id !== currentUserId)
              .filter((item) => !existingFriends.has(item.id))
              .filter((item) => !outgoingRequests.has(item.id));

            if (results.length > 0) {
              break;
            }
          } catch {
            setDisableRemoteSearch(true);
            break;
          }
        }
      }

      if (!alive) return;
      setUsernameResults(results);
      setIsSearchingUsers(false);
    };

    searchUsers();

    return () => {
      alive = false;
    };
  }, [currentUserId, disableRemoteSearch, existingFriends, outgoingRequests, searchLower]);

  const onSendRequest = async (user: DiscoverUser) => {
    const normalized = normalizeAsUsername(user.username);
    if (!normalized) return;

    const result = await sendFriendRequest({
      userId: user.id,
      username: normalized,
      avatarUrl: user.avatarUrl ?? null,
    });

    if (result.status === 'self-request') {
      Alert.alert('Bilgi', 'Kendi hesabina istek gonderemezsin.');
      return;
    }

    if (result.status === 'already-friend') {
      Alert.alert('Bilgi', 'Bu kullanici zaten arkadasin.');
      return;
    }

    if (result.status === 'already-requested') {
      Alert.alert('Bilgi', 'Bu kullaniciya zaten istek gonderdin.');
      return;
    }

    if (result.status === 'incoming-exists') {
      Alert.alert('Bilgi', 'Bu kullanicidan sana zaten gelen bir istek var. Bildirimlerden kabul edebilirsin.');
      return;
    }

    if (result.status === 'auth-required' || result.status === 'table-missing' || result.status === 'failed') {
      Alert.alert('Hata', 'Istek gonderilemedi. Supabase tablo/policy ayarlarini kontrol et.');
      return;
    }

    const outgoing = await loadOutgoingRequests();
    setOutgoingRequests(new Set(outgoing.map((item) => item.userId)));
    Alert.alert('Istek Gonderildi', `${normalized} kullanicisina arkadaslik istegi gonderildi.`);
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

      <Text style={styles.title}>Arkadas Ekle</Text>
      <Text style={styles.subtitle}>Username ara ve arkadaslik istegi gonder.</Text>

      <View style={styles.searchWrap}>
        <Feather name="search" size={18} color="#6B7280" />
        <TextInput
          style={styles.searchInput}
          placeholder="Username ara"
          placeholderTextColor="#9CA3AF"
          autoCapitalize="none"
          value={query}
          onChangeText={setQuery}
        />
      </View>

      <Text style={styles.sectionTitle}>Username Sonuclari</Text>
      <FlatList
        data={usernameResults}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.inlineList}
        ListEmptyComponent={
          <Text style={styles.emptyText}>
            {isSearchingUsers ? 'Araniyor...' : 'Aramana gore sonuc bulunamadi.'}
          </Text>
        }
        renderItem={({ item }) => (
          <View style={styles.row}>
            <View style={styles.userWrap}>
              {item.avatarUrl ? (
                <Image source={{ uri: item.avatarUrl }} style={styles.avatar} />
              ) : (
                <View style={styles.avatarFallback}>
                  <Text style={styles.avatarFallbackText}>{item.username.slice(0, 1).toUpperCase()}</Text>
                </View>
              )}
              <Text style={styles.userName}>{item.username}</Text>
            </View>
            <TouchableOpacity
              style={styles.addSmallButton}
              onPress={() => onSendRequest(item)}
            >
              <Text style={styles.addSmallButtonText}>Istek Gonder</Text>
            </TouchableOpacity>
          </View>
        )}
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
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 12,
    backgroundColor: '#F9FAFB',
    paddingHorizontal: 12,
    marginBottom: 14,
  },
  searchInput: {
    flex: 1,
    height: 46,
    paddingHorizontal: 10,
    fontSize: 15,
    color: '#111827',
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#374151',
    marginBottom: 8,
    marginTop: 2,
  },
  inlineList: {
    paddingBottom: 8,
  },
  contactsList: {
    paddingBottom: 30,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 9,
    marginBottom: 8,
  },
  userWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
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
    marginRight: 10,
  },
  avatarFallbackText: {
    color: '#111827',
    fontSize: 13,
    fontWeight: '700',
  },
  userName: {
    marginLeft: 10,
    fontSize: 15,
    fontWeight: '600',
    color: '#111827',
  },
  addSmallButton: {
    backgroundColor: '#111827',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginLeft: 10,
  },
  addSmallButtonText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  emptyText: {
    color: '#6B7280',
    fontSize: 13,
    marginBottom: 10,
    textAlign: 'center',
    paddingVertical: 10,
  },
});
