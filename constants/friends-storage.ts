import { supabase } from '@/constants/supabase';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system/legacy';

export type FriendItem = {
  id: string;
  username: string;
  avatarUrl?: string | null;
};

export type FriendRequestItem = {
  id: string;
  userId: string;
  username: string;
  avatarUrl?: string | null;
  direction: 'incoming' | 'outgoing';
  createdAt: number;
};

const PROFILE_AVATAR_STORAGE_KEY_PREFIX = '@wallpapertodo:profile_avatar';
const PROFILE_AVATAR_BUCKET = 'profile-avatars';
const FRIEND_REQUEST_TABLE_CANDIDATES = ['friend_requests', 'user_friend_requests'];
const PROFILE_TABLE_CANDIDATES = ['profiles', 'user_profiles'];

let cachedFriendRequestTable: string | null | undefined;
let friendRequestResolvePromise: Promise<string | null> | null = null;

type FriendRequestRow = {
  id: string;
  sender_id: string;
  receiver_id: string;
  status: string;
  created_at?: string;
};

type ProfileRow = {
  id?: string;
  username?: string;
  avatar_url?: string | null;
};

const resolveAvatarPublicUrl = (value?: string | null) => {
  const raw = String(value || '').trim();
  if (!raw) return null;

  if (/^https?:\/\//i.test(raw)) {
    return raw;
  }

  const { data } = supabase.storage.from(PROFILE_AVATAR_BUCKET).getPublicUrl(raw);
  return data?.publicUrl || null;
};

const normalizeUsername = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_');

const getAuthUserId = async () => {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (session?.user?.id) {
    return session.user.id;
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  return user?.id || null;
};

const resolveFriendRequestTable = async () => {
  if (cachedFriendRequestTable !== undefined) {
    return cachedFriendRequestTable;
  }

  if (!friendRequestResolvePromise) {
    friendRequestResolvePromise = (async () => {
      for (const tableName of FRIEND_REQUEST_TABLE_CANDIDATES) {
        const { error } = await supabase.from(tableName).select('id').limit(1);
        if (!error) {
          cachedFriendRequestTable = tableName;
          return tableName;
        }
      }

      cachedFriendRequestTable = null;
      return null;
    })();
  }

  return friendRequestResolvePromise;
};

let cachedProfileTable: string | null | undefined;
let profileTableResolvePromise: Promise<string | null> | null = null;

const resolveProfileTable = async () => {
  if (cachedProfileTable !== undefined) return cachedProfileTable;
  
  if (!profileTableResolvePromise) {
    profileTableResolvePromise = (async () => {
      for (const tableName of PROFILE_TABLE_CANDIDATES) {
        const { error } = await supabase.from(tableName).select('id').limit(1);
        if (!error) {
          cachedProfileTable = tableName;
          return tableName;
        }
      }
      cachedProfileTable = null;
      return null;
    })();
  }
  return profileTableResolvePromise;
};

const loadProfilesByIds = async (ids: string[]) => {
  const uniqueIds = [...new Set(ids.filter((item) => item.length > 0))];
  if (uniqueIds.length === 0) return new Map<string, { username: string; avatarUrl: string | null }>();

  const tableName = await resolveProfileTable();
  if (!tableName) return new Map<string, { username: string; avatarUrl: string | null }>();

  const { data, error } = await supabase
    .from(tableName)
    .select('id,username,avatar_url')
    .in('id', uniqueIds);

  if (error || !Array.isArray(data)) {
    return new Map<string, { username: string; avatarUrl: string | null }>();
  }

  const map = new Map<string, { username: string; avatarUrl: string | null }>();
  data.forEach((row) => {
    const typedRow = row as ProfileRow;
    const id = String(typedRow.id || '');
    const username = normalizeUsername(String(typedRow.username || ''));
    if (!id || !username) return;

    map.set(id, {
      username,
      avatarUrl: resolveAvatarPublicUrl(typedRow.avatar_url),
    });
  });

  return map;
};

const loadRawRequestsForCurrentUser = async (status?: 'pending' | 'accepted') => {
  const currentUserId = await getAuthUserId();
  if (!currentUserId) return [] as FriendRequestRow[];

  const tableName = await resolveFriendRequestTable();
  if (!tableName) return [] as FriendRequestRow[];

  let query = supabase
    .from(tableName)
    .select('id,sender_id,receiver_id,status,created_at')
    .or(`sender_id.eq.${currentUserId},receiver_id.eq.${currentUserId}`);

  if (status) {
    query = query.eq('status', status);
  }

  const { data, error } = await query.order('created_at', { ascending: false });
  if (error || !Array.isArray(data)) return [] as FriendRequestRow[];

  return data
    .map((item) => ({
      id: String((item as FriendRequestRow).id || ''),
      sender_id: String((item as FriendRequestRow).sender_id || ''),
      receiver_id: String((item as FriendRequestRow).receiver_id || ''),
      status: String((item as FriendRequestRow).status || ''),
      created_at: typeof (item as FriendRequestRow).created_at === 'string' ? (item as FriendRequestRow).created_at : undefined,
    }))
    .filter((item) => item.id && item.sender_id && item.receiver_id);
};

const requestRowToItem = async (
  row: FriendRequestRow,
  currentUserId: string,
  direction: FriendRequestItem['direction'],
  profileMap?: Map<string, { username: string; avatarUrl: string | null }>
) => {
  const peerId = direction === 'incoming' ? row.sender_id : row.receiver_id;
  const profile = profileMap?.get(peerId);

  return {
    id: row.id,
    userId: peerId,
    username: profile?.username || 'kullanici',
    avatarUrl: profile?.avatarUrl ?? null,
    direction,
    createdAt: row.created_at ? Date.parse(row.created_at) || Date.now() : Date.now(),
  } satisfies FriendRequestItem;
};

export const loadFriends = async (): Promise<FriendItem[]> => {
  const currentUserId = await getAuthUserId();
  if (!currentUserId) return [];

  const rows = await loadRawRequestsForCurrentUser('accepted');
  const peerIds = rows.map((item) =>
    item.sender_id === currentUserId ? item.receiver_id : item.sender_id
  );
  const profileMap = await loadProfilesByIds(peerIds);

  const friends = rows
    .map((item) => {
      const peerId = item.sender_id === currentUserId ? item.receiver_id : item.sender_id;
      const profile = profileMap.get(peerId);
      if (!peerId || !profile?.username) return null;

      return {
        id: peerId,
        username: profile.username,
        avatarUrl: profile.avatarUrl,
      } as FriendItem;
    })
    .filter((item): item is FriendItem => item !== null);

  const deduped = friends.filter(
    (item, index, array) => array.findIndex((next) => next.id === item.id) === index
  );

  return deduped;
};

export const removeFriend = async (friendId: string) => {
  const currentUserId = await getAuthUserId();
  if (!currentUserId) return [];

  const tableName = await resolveFriendRequestTable();
  if (!tableName) return loadFriends();

  await supabase
    .from(tableName)
    .delete()
    .eq('status', 'accepted')
    .or(`and(sender_id.eq.${currentUserId},receiver_id.eq.${friendId}),and(sender_id.eq.${friendId},receiver_id.eq.${currentUserId})`);

  return loadFriends();
};

export const loadIncomingRequests = async () => {
  const currentUserId = await getAuthUserId();
  if (!currentUserId) return [] as FriendRequestItem[];

  const rows = await loadRawRequestsForCurrentUser('pending');
  const incomingRows = rows.filter((item) => item.receiver_id === currentUserId);
  const peerIds = incomingRows.map((item) => item.sender_id);
  const profileMap = await loadProfilesByIds(peerIds);

  const mapped = await Promise.all(
    incomingRows.map((row) => requestRowToItem(row, currentUserId, 'incoming', profileMap))
  );

  return mapped;
};

export const loadOutgoingRequests = async () => {
  const currentUserId = await getAuthUserId();
  if (!currentUserId) return [] as FriendRequestItem[];

  const rows = await loadRawRequestsForCurrentUser('pending');
  const outgoingRows = rows.filter((item) => item.sender_id === currentUserId);
  const peerIds = outgoingRows.map((item) => item.receiver_id);
  const profileMap = await loadProfilesByIds(peerIds);

  const mapped = await Promise.all(
    outgoingRows.map((row) => requestRowToItem(row, currentUserId, 'outgoing', profileMap))
  );

  return mapped;
};

export const getIncomingRequestsCount = async () => {
  const incoming = await loadIncomingRequests();
  return incoming.length;
};

export const loadFriendDashboard = async () => {
  const currentUserId = await getAuthUserId();
  if (!currentUserId) {
    return {
      currentUserId: '',
      friends: [] as FriendItem[],
      outgoingRequestIds: new Set<string>(),
      incomingRequestCount: 0,
    };
  }

  const rows = await loadRawRequestsForCurrentUser();

  const acceptedRows = rows.filter((item) => item.status === 'accepted');
  const pendingIncomingRows = rows.filter(
    (item) => item.status === 'pending' && item.receiver_id === currentUserId
  );
  const pendingOutgoingRows = rows.filter(
    (item) => item.status === 'pending' && item.sender_id === currentUserId
  );

  const profileIds = [
    ...acceptedRows.map((item) => (item.sender_id === currentUserId ? item.receiver_id : item.sender_id)),
    ...pendingIncomingRows.map((item) => item.sender_id),
    ...pendingOutgoingRows.map((item) => item.receiver_id),
  ];

  const profileMap = await loadProfilesByIds(profileIds);

  const friends = acceptedRows
    .map((item) => {
      const peerId = item.sender_id === currentUserId ? item.receiver_id : item.sender_id;
      const profile = profileMap.get(peerId);
      if (!peerId || !profile?.username) return null;

      return {
        id: peerId,
        username: profile.username,
        avatarUrl: profile.avatarUrl,
      } as FriendItem;
    })
    .filter((item): item is FriendItem => item !== null)
    .filter((item, index, array) => array.findIndex((next) => next.id === item.id) === index);

  const outgoingRequestIds = new Set<string>(pendingOutgoingRows.map((item) => item.receiver_id));

  return {
    currentUserId,
    friends,
    outgoingRequestIds,
    incomingRequestCount: pendingIncomingRows.length,
  };
};

export const sendFriendRequest = async (payload: Pick<FriendRequestItem, 'userId' | 'username' | 'avatarUrl'>) => {
  const currentUserId = await getAuthUserId();
  if (!currentUserId) return { status: 'auth-required' as const };

  if (payload.userId === currentUserId) {
    return { status: 'self-request' as const };
  }

  const friends = await loadFriends();
  const alreadyFriend = friends.some((item) => item.id === payload.userId);
  if (alreadyFriend) return { status: 'already-friend' as const };

  const tableName = await resolveFriendRequestTable();
  if (!tableName) return { status: 'table-missing' as const };

  const { data: existingRows, error: existingError } = await supabase
    .from(tableName)
    .select('id,sender_id,receiver_id,status,created_at')
    .or(`and(sender_id.eq.${currentUserId},receiver_id.eq.${payload.userId}),and(sender_id.eq.${payload.userId},receiver_id.eq.${currentUserId})`);

  if (existingError) {
    return { status: 'failed' as const };
  }

  const rows = (Array.isArray(existingRows) ? existingRows : []) as FriendRequestRow[];
  const hasAccepted = rows.some((item) => item.status === 'accepted');
  if (hasAccepted) return { status: 'already-friend' as const };

  const hasOutgoingPending = rows.some(
    (item) =>
      item.status === 'pending' && item.sender_id === currentUserId && item.receiver_id === payload.userId
  );
  if (hasOutgoingPending) return { status: 'already-requested' as const };

  const hasIncomingPending = rows.some(
    (item) =>
      item.status === 'pending' && item.sender_id === payload.userId && item.receiver_id === currentUserId
  );
  if (hasIncomingPending) return { status: 'incoming-exists' as const };

  const { error } = await supabase.from(tableName).insert({
    sender_id: currentUserId,
    receiver_id: payload.userId,
    status: 'pending',
  });

  if (error) {
    return { status: 'failed' as const };
  }

  return { status: 'sent' as const };
};

export const acceptIncomingRequest = async (requestId: string) => {
  const currentUserId = await getAuthUserId();
  if (!currentUserId) return;

  const tableName = await resolveFriendRequestTable();
  if (!tableName) return;

  await supabase
    .from(tableName)
    .update({ status: 'accepted' })
    .eq('id', requestId)
    .eq('receiver_id', currentUserId)
    .eq('status', 'pending');
};

export const rejectIncomingRequest = async (requestId: string) => {
  const currentUserId = await getAuthUserId();
  if (!currentUserId) return;

  const tableName = await resolveFriendRequestTable();
  if (!tableName) return;

  await supabase
    .from(tableName)
    .delete()
    .eq('id', requestId)
    .eq('receiver_id', currentUserId)
    .eq('status', 'pending');
};

const buildProfileAvatarKey = (userId: string) => `${PROFILE_AVATAR_STORAGE_KEY_PREFIX}:${userId}`;

const resolveAvatarUrl = (value?: string | null) => {
  const publicUrl = resolveAvatarPublicUrl(value);
  if (!publicUrl) return null;
  return `${publicUrl}?t=${Date.now()}`;
};

const loadProfileAvatarFromTable = async (userId: string) => {
  for (const tableName of PROFILE_TABLE_CANDIDATES) {
    const { data, error } = await supabase
      .from(tableName)
      .select('avatar_url')
      .eq('id', userId)
      .maybeSingle();

    if (error) {
      continue;
    }

    const avatarUrl = resolveAvatarUrl((data as { avatar_url?: string | null } | null)?.avatar_url);
    if (!avatarUrl) {
      return null;
    }

    await AsyncStorage.setItem(buildProfileAvatarKey(userId), avatarUrl);
    return avatarUrl;
  }

  return null;
};

const saveProfileAvatarInTable = async (userId: string, avatarUrl: string) => {
  for (const tableName of PROFILE_TABLE_CANDIDATES) {
    try {
      // 1. Try to update an existing row first (avoids touching the unique username column)
      const { error: updateError, data } = await supabase
        .from(tableName)
        .update({ avatar_url: avatarUrl })
        .eq('id', userId)
        .select();

      // If update was successful and a row was modified, we're done
      if (!updateError && data && data.length > 0) return true;

      // 2. If no row exists, we need to insert. We provide a default username to satisfy NOT NULL or UNIQUE constraints
      // (Using a random string to avoid unique constraint collisions)
      const randomUsername = `user_${Math.random().toString(36).slice(2, 10)}`;
      const { error: insertError } = await supabase
        .from(tableName)
        .insert({
          id: userId,
          avatar_url: avatarUrl,
          username: randomUsername
        });

      if (!insertError) return true;
    } catch {
      continue;
    }
  }

  return false;
};

const detectContentTypeFromUri = (uri: string) => {
  const lower = uri.toLowerCase().split('?')[0].split('#')[0];
  if (lower.endsWith('.png')) return { extension: 'png', contentType: 'image/png' };
  if (lower.endsWith('.webp')) return { extension: 'webp', contentType: 'image/webp' };
  return { extension: 'jpg', contentType: 'image/jpeg' };
};

export const loadProfileAvatar = async (userId: string) => {
  if (!userId) return null;

  try {
    const raw = await AsyncStorage.getItem(buildProfileAvatarKey(userId));
    if (raw) return raw;

    return loadProfileAvatarFromTable(userId);
  } catch {
    return loadProfileAvatarFromTable(userId);
  }
};

export const saveProfileAvatar = async (userId: string, uri: string) => {
  if (!userId || !uri) throw new Error('Kullanici veya fotograf bilgisi eksik.');

  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.access_token) {
    throw new Error('Oturum bilgisi gecersiz, tekrar giris yap.');
  }

  try {
    const { extension, contentType } = detectContentTypeFromUri(uri);
    // Use a unique filename each upload to avoid UPDATE permissions on storage.objects.
    const objectPath = `${userId}/avatar-${Date.now()}.${extension}`;

    // Read file as base64
    const base64 = await FileSystem.readAsStringAsync(uri, {
      encoding: 'base64',
    });
    
    // Convert base64 to Uint8Array
    const binaryString = atob(base64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }

    // Upload using Supabase SDK
    const { error: uploadError } = await supabase.storage
      .from(PROFILE_AVATAR_BUCKET)
      .upload(objectPath, bytes, {
        contentType: contentType,
        upsert: false,
      });

    if (uploadError) {
      throw new Error(`Avatar yuklenemedi: ${uploadError.message}`);
    }

    const { data } = supabase.storage.from(PROFILE_AVATAR_BUCKET).getPublicUrl(objectPath);
    const publicUrl = data?.publicUrl || null;

    if (!publicUrl) {
      throw new Error('Avatar URL olusturulamadi.');
    }

    // Save only the object path to database (not the full URL)
    const saved = await saveProfileAvatarInTable(userId, objectPath);
    if (!saved) {
      throw new Error('Profil tablosu avatar guncellenemedi.');
    }

    // Add cache busting parameter to force refresh
    const cachedBustingUrl = `${publicUrl}?t=${Date.now()}`;
    await AsyncStorage.setItem(buildProfileAvatarKey(userId), cachedBustingUrl);
    return cachedBustingUrl;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Avatar yuklenirken bir hata olustu.';
    throw new Error(message);
  }
};
