import AppLogo from '@/components/app-logo';
import BottomNav from '@/components/bottom-nav';
import SideSlider from '@/components/side-slider';
import {
  FriendItem,
  loadFriendDashboard,
  loadOutgoingRequests,
  removeFriend,
  sendFriendRequest,
} from '@/constants/friends-storage';
import { supabase } from '@/constants/supabase';
import { Feather } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  FlatList,
  Image, InteractionManager, StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

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

const normalizeAsUsername = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_\.]/g, '');

type DiscoverUser = {
  id: string;
  username: string;
  avatarUrl: string | null;
};

const SEARCH_DEBOUNCE_MS = 280;

const escapeIlikePattern = (value: string) => value.replace(/[\\%_]/g, (match) => `\\${match}`);

const resolveAvatarUrl = (value?: string | null) => {
  const raw = String(value || '').trim();
  if (!raw) return null;

  if (/^https?:\/\//i.test(raw)) return raw;

  const { data } = supabase.storage.from('profile-avatars').getPublicUrl(raw);
  return data?.publicUrl || null;
};

export default function FriendsScreen() {
  const router = useRouter();
  const [isSideMenuVisible, setIsSideMenuVisible] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [friends, setFriends] = useState<FriendItem[]>([]);
  const [outgoingRequestIds, setOutgoingRequestIds] = useState<Set<string>>(new Set());
  const [discoverResults, setDiscoverResults] = useState<DiscoverUser[]>([]);
  const [isSearchingUsers, setIsSearchingUsers] = useState(false);
  const [disableRemoteSearch, setDisableRemoteSearch] = useState(false);
  const [currentUserId, setCurrentUserId] = useState('');
  const [incomingRequestCount, setIncomingRequestCount] = useState(0);
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState('');

  const loadFriendList = useCallback(async () => {
    const dashboard = await loadFriendDashboard();
    setCurrentUserId(dashboard.currentUserId);
    setFriends(dashboard.friends);
    setOutgoingRequestIds(dashboard.outgoingRequestIds);
    setIncomingRequestCount(dashboard.incomingRequestCount);
  }, []);

  useFocusEffect(
    useCallback(() => {
      const handle = InteractionManager.runAfterInteractions(() => {
        loadFriendList();
      });
      return () => handle.cancel();
    }, [loadFriendList])
  );

  const filteredFriends = useMemo(() => {
    const query = searchQuery.trim();
    if (!query) return friends;

    return friends.filter((friend) => isFuzzyMatch(friend.username, query));
  }, [friends, searchQuery]);

  const friendIds = useMemo(() => new Set(friends.map((item) => item.id)), [friends]);

  useEffect(() => {
    const handle = setTimeout(() => {
      setDebouncedSearchQuery(searchQuery);
    }, SEARCH_DEBOUNCE_MS);

    return () => clearTimeout(handle);
  }, [searchQuery]);

  useEffect(() => {
    let alive = true;

    const runSearch = async () => {
      const query = debouncedSearchQuery.trim().toLowerCase();
      if (!query) {
        setDiscoverResults([]);
        setIsSearchingUsers(false);
        return;
      }

      // Keep single-letter lookups local to avoid frequent broad remote scans.
      if (query.length < 2) {
        setDiscoverResults([]);
        setIsSearchingUsers(false);
        return;
      }

      setIsSearchingUsers(true);
      let results: DiscoverUser[] = [];
      const pattern = `%${escapeIlikePattern(query)}%`;

      if (!disableRemoteSearch) {
        const tableCandidates = ['profiles', 'user_profiles'];

        for (const tableName of tableCandidates) {
          try {
            let request = supabase
              .from(tableName)
              .select('id,username,avatar_url')
              .ilike('username', pattern)
              .order('username', { ascending: true })
              .limit(20);

            if (currentUserId) {
              request = request.neq('id', currentUserId);
            }

            const { data, error } = await request;

            if (error || !Array.isArray(data)) {
              continue;
            }

            results = data
              .map((row) => ({
                id: String((row as { id?: string }).id || ''),
                username: String((row as { username?: string }).username || '').trim(),
                avatarUrl: resolveAvatarUrl((row as { avatar_url?: string | null }).avatar_url),
              }))
              .filter((item) => item.id.length > 0 && item.username.length > 0)
              .filter((item) => item.id !== currentUserId);

            break;
          } catch {
            setDisableRemoteSearch(true);
            break;
          }
        }
      }

      if (!alive) return;
      setDiscoverResults(results);
      setIsSearchingUsers(false);
    };

    runSearch();

    return () => {
      alive = false;
    };
  }, [currentUserId, debouncedSearchQuery, disableRemoteSearch]);

  const onSendRequest = async (user: DiscoverUser) => {
    const normalized = normalizeAsUsername(user.username);
    if (!normalized) return;

    const result = await sendFriendRequest({
      userId: user.id,
      username: normalized,
      avatarUrl: user.avatarUrl,
    });

    if (result.status === 'self-request') {
      Alert.alert('Bilgi', 'Kendi hesabina istek gonderemezsin.');
      return;
    }

    if (result.status === 'already-friend') {
      Alert.alert('Bilgi', 'Bu kullanici zaten takipte.');
      return;
    }

    if (result.status === 'already-requested') {
      Alert.alert('Bilgi', 'Bu kullaniciya zaten istek gonderdin.');
      return;
    }

    if (result.status === 'incoming-exists') {
      Alert.alert('Bilgi', 'Bu kullanicidan sana gelen istek var. Bildirimlerden kabul edebilirsin.');
      return;
    }

    if (result.status === 'auth-required' || result.status === 'table-missing' || result.status === 'failed') {
      Alert.alert('Hata', 'Istek gonderilemedi. Supabase tablo/policy ayarlarini kontrol et.');
      return;
    }

    const outgoing = await loadOutgoingRequests();
    setOutgoingRequestIds(new Set(outgoing.map((item) => item.userId)));
  };

  const askRemoveFriend = (friend: FriendItem) => {
    Alert.alert(
      'Arkadastan cikarmak ister misin?',
      `${friend.username} listesinden kaldirilacak.`,
      [
        { text: 'Vazgec', style: 'cancel' },
        {
          text: 'Cikar',
          style: 'destructive',
          onPress: async () => {
            const next = await removeFriend(friend.id);
            setFriends(next);
          },
        },
      ]
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.headerMenuButton} onPress={() => setIsSideMenuVisible(true)}>
          <Feather name="menu" size={22} color="#111827" />
        </TouchableOpacity>
        <AppLogo size={40} />
      </View>

      <View style={styles.topRow}>
        <Text style={styles.pageTitle}>Arkadaslar</Text>
        <View style={styles.actionsRow}>
          <TouchableOpacity
            style={styles.iconButton}
            onPress={() => router.navigate('/(tabs)/notifications')}
          >
            <Feather name="bell" size={19} color="#111827" />
            {incomingRequestCount > 0 ? <View style={styles.actionDot} /> : null}
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.searchWrap}>
        <Feather name="search" size={18} color="#6B7280" />
        <TextInput
          style={styles.searchInput}
          placeholder="Username ara"
          placeholderTextColor="#9CA3AF"
          value={searchQuery}
          onChangeText={setSearchQuery}
          autoCapitalize="none"
        />
      </View>

      <View style={styles.searchResultList}>
        {!searchQuery.trim() ? (
          <Text style={styles.emptyText}>Arama yaparak kullanici bulabilirsin.</Text>
        ) : isSearchingUsers ? (
          <Text style={styles.emptyText}>Araniyor...</Text>
        ) : discoverResults.length === 0 ? (
          <Text style={styles.emptyText}>Aramana gore kullanici bulunamadi.</Text>
        ) : (
          discoverResults.slice(0, 5).map((item) => {
            const initial = item.username.slice(0, 1).toUpperCase();
            const isFollowing = friendIds.has(item.id);
            const isRequested = outgoingRequestIds.has(item.id);
            const buttonDisabled = isFollowing || isRequested;
            const buttonText = isFollowing ? 'Takipte' : isRequested ? 'Istek Gonderildi' : 'Istek Gonder';

            return (
              <View key={item.id} style={styles.resultRow}>
                <View style={styles.friendIdentity}>
                  {item.avatarUrl ? (
                    <Image source={{ uri: item.avatarUrl }} style={styles.avatar} />
                  ) : (
                    <View style={styles.avatarFallback}>
                      <Text style={styles.avatarFallbackText}>{initial}</Text>
                    </View>
                  )}
                  <Text style={styles.friendName}>{item.username}</Text>
                </View>

                <TouchableOpacity
                  style={[
                    styles.requestButton,
                    buttonDisabled ? styles.requestButtonDisabled : null,
                    isFollowing ? styles.followingButton : null,
                  ]}
                  disabled={buttonDisabled}
                  onPress={() => onSendRequest(item)}
                >
                  <Text style={[styles.requestButtonText, buttonDisabled ? styles.requestButtonTextDisabled : null]}>
                    {buttonText}
                  </Text>
                </TouchableOpacity>
              </View>
            );
          })
        )}
      </View>

      <Text style={styles.sectionTitle}>Arkadaslarim</Text>

      <FlatList
        data={filteredFriends}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.friendListContent}
        ListEmptyComponent={<Text style={styles.emptyText}>Henuz arkadasin yok.</Text>}
        renderItem={({ item }) => {
          const initial = item.username.slice(0, 1).toUpperCase();
          return (
            <View style={styles.friendRow}>
              <TouchableOpacity
                style={styles.friendIdentity}
                activeOpacity={0.85}
                onPress={() =>
                  router.push({
                    pathname: '/(tabs)/friend-profile',
                    params: {
                      friendId: item.id,
                      username: item.username,
                      avatarUrl: item.avatarUrl || '',
                    },
                  })
                }
              >
                {item.avatarUrl ? (
                  <Image source={{ uri: item.avatarUrl }} style={styles.avatar} />
                ) : (
                  <View style={styles.avatarFallback}>
                    <Text style={styles.avatarFallbackText}>{initial}</Text>
                  </View>
                )}
                <View style={styles.friendNameWrap}>
                  <Text style={styles.friendName}>{item.username}</Text>
                  <Text style={styles.friendSubtitle}>Gorev ver</Text>
                </View>
                <Feather name="chevron-right" size={18} color="#9CA3AF" />
              </TouchableOpacity>

              <TouchableOpacity style={styles.removeButton} onPress={() => askRemoveFriend(item)}>
                <Feather name="x" size={20} color="#DC2626" />
              </TouchableOpacity>
            </View>
          );
        }}
      />

      <BottomNav activeTab="friends" />

      <SideSlider
        visible={isSideMenuVisible}
        onClose={() => setIsSideMenuVisible(false)}
        currentRoute="friends"
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    padding: 20,
  },
  header: {
    alignItems: 'center',
    marginBottom: 20,
    position: 'relative',
    paddingTop: 6,
  },
  headerMenuButton: {
    position: 'absolute',
    left: 0,
    top: 6,
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  actionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  pageTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: '#111827',
  },
  iconButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    position: 'relative',
  },
  actionDot: {
    position: 'absolute',
    top: 7,
    right: 7,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#EF4444',
  },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 12,
    backgroundColor: '#F9FAFB',
    paddingHorizontal: 12,
    marginBottom: 12,
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
    marginBottom: 10,
  },
  searchResultList: {
    marginBottom: 8,
  },
  resultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 10,
  },
  requestButton: {
    backgroundColor: '#111827',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  requestButtonDisabled: {
    backgroundColor: '#E5E7EB',
  },
  followingButton: {
    backgroundColor: '#DCFCE7',
  },
  requestButtonText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  requestButtonTextDisabled: {
    color: '#374151',
  },
  friendListContent: {
    paddingBottom: 140,
  },
  friendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 10,
  },
  friendIdentity: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  friendNameWrap: {
    flex: 1,
    marginLeft: 12,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#F3F4F6',
  },
  avatarFallback: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#E5E7EB',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarFallbackText: {
    color: '#111827',
    fontWeight: '700',
    fontSize: 14,
  },
  friendName: {
    fontSize: 16,
    color: '#111827',
    fontWeight: '600',
  },
  friendSubtitle: {
    marginTop: 2,
    fontSize: 12,
    color: '#6B7280',
  },
  removeButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FEE2E2',
  },
  emptyText: {
    textAlign: 'center',
    marginTop: 20,
    color: '#6B7280',
    fontSize: 15,
  },
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
  },
  navPlusContainer: {
    width: 50,
    height: 50,
    borderRadius: 25,
    borderWidth: 2,
    borderColor: '#000',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: -25,
    backgroundColor: '#fff',
  },
});
