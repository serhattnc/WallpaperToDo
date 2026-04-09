import { supabase } from '@/constants/supabase';
import AsyncStorage from '@react-native-async-storage/async-storage';

export type SubtaskItem = {
  id: string;
  title: string;
  is_completed: boolean;
};

export type TaskSchedule = {
  name: string;
  color: string;
  date?: string;
  dueDateTime?: string | null;
  reminderBeforeMinutes?: number | null;
  recurrence?: 'today' | 'daily' | 'weekend' | 'weekday';
  skipDates?: string[];
};

export type FriendTaskItem = {
  id: string;
  task: string;
  description?: string | null;
  subtask?: string | null;
  category?: string | null;
  createdAt: number;
  assignedById: string;
  assignedByName: string;
  assignedByAvatarUrl?: string | null;
};

const FRIEND_TASKS_KEY_PREFIX = '@wallpapertodo:friend_tasks_v2';
const FRIEND_TASK_PERMISSION_TABLE_CANDIDATES = ['friend_task_permissions', 'user_friend_task_permissions'];
const FRIEND_CAN_SEND_KEY_PREFIX = '@wallpapertodo:friend_can_send_tasks_v1';
const FRIEND_REQUEST_TABLE_CANDIDATES = ['friend_requests', 'user_friend_requests'];
const PROFILE_TABLE_CANDIDATES = ['profiles', 'user_profiles'];
const TABLE_RESOLVE_RECHECK_MS = 20000;

let cachedFriendRequestTable: string | null | undefined;
let cachedFriendTaskPermissionTable: string | null | undefined;
let cachedFriendRequestTableAt = 0;
let cachedFriendTaskPermissionTableAt = 0;
let friendRequestResolvePromise: Promise<string | null> | null = null;
let friendTaskPermissionResolvePromise: Promise<string | null> | null = null;

type ProfileRow = {
  id?: string;
  username?: string;
  avatar_url?: string | null;
};

type FriendRequestRow = {
  id: string;
  sender_id: string;
  receiver_id: string;
  status: string;
};

type TodoTaskRow = {
  id: string | number;
  user_id?: string | null;
  creator_id?: string | null;
  assigned_id?: string | null;
  task: string;
  description?: string | null;
  subtask?: string | null;
  category?: string | null;
  created_at?: string;
};

type FriendTaskRow = {
  id: string;
  sender_id: string;
  receiver_id: string;
  task: string;
  description?: string | null;
  subtask?: string | null;
  category?: string | null;
  sender_name?: string | null;
  sender_avatar_url?: string | null;
  created_at?: string;
};

type FriendTaskPermissionRow = {
  owner_id: string;
  friend_id: string;
  can_send: boolean;
};

type SimpleProfile = {
  id: string;
  username: string;
  avatarUrl: string | null;
};

const buildKey = (prefix: string, currentUserId: string, friendId: string) =>
  `${prefix}:${currentUserId}:${friendId}`;

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
  if (
    cachedFriendRequestTable !== undefined &&
    (cachedFriendRequestTable !== null || Date.now() - cachedFriendRequestTableAt < TABLE_RESOLVE_RECHECK_MS)
  ) {
    return cachedFriendRequestTable;
  }

  if (!friendRequestResolvePromise) {
    friendRequestResolvePromise = (async () => {
      for (const tableName of FRIEND_REQUEST_TABLE_CANDIDATES) {
        const { error } = await supabase.from(tableName).select('id').limit(1);
        if (!error) {
          cachedFriendRequestTable = tableName;
          cachedFriendRequestTableAt = Date.now();
          return tableName;
        }
      }

      cachedFriendRequestTable = null;
      cachedFriendRequestTableAt = Date.now();
      return null;
    })();
  }

  const resolved = await friendRequestResolvePromise;
  friendRequestResolvePromise = null;
  return resolved;
};

const resolveFriendTaskPermissionTable = async () => {
  if (
    cachedFriendTaskPermissionTable !== undefined &&
    (cachedFriendTaskPermissionTable !== null || Date.now() - cachedFriendTaskPermissionTableAt < TABLE_RESOLVE_RECHECK_MS)
  ) {
    return cachedFriendTaskPermissionTable;
  }

  if (!friendTaskPermissionResolvePromise) {
    friendTaskPermissionResolvePromise = (async () => {
      for (const tableName of FRIEND_TASK_PERMISSION_TABLE_CANDIDATES) {
        const { error } = await supabase.from(tableName).select('owner_id').limit(1);
        if (!error) {
          cachedFriendTaskPermissionTable = tableName;
          cachedFriendTaskPermissionTableAt = Date.now();
          return tableName;
        }
      }

      cachedFriendTaskPermissionTable = null;
      cachedFriendTaskPermissionTableAt = Date.now();
      return null;
    })();
  }

  const resolved = await friendTaskPermissionResolvePromise;
  friendTaskPermissionResolvePromise = null;
  return resolved;
};

let cachedProfileTable: string | null | undefined;
let profileTableResolvePromise: Promise<string | null> | null = null;
let cachedProfileTableAt = 0;

const resolveProfileTable = async () => {
  if (
    cachedProfileTable !== undefined &&
    (cachedProfileTable !== null || Date.now() - cachedProfileTableAt < TABLE_RESOLVE_RECHECK_MS)
  ) {
    return cachedProfileTable;
  }

  if (!profileTableResolvePromise) {
    profileTableResolvePromise = (async () => {
      for (const tableName of PROFILE_TABLE_CANDIDATES) {
        const { error } = await supabase.from(tableName).select('id').limit(1);
        if (!error) {
          cachedProfileTable = tableName;
          cachedProfileTableAt = Date.now();
          return tableName;
        }
      }
      cachedProfileTable = null;
      cachedProfileTableAt = Date.now();
      return null;
    })();
  }
  return profileTableResolvePromise;
};

const loadProfileById = async (userId: string) => {
  const tableName = await resolveProfileTable();
  if (!tableName) return null;

  const { data, error } = await supabase
    .from(tableName)
    .select('id,username,avatar_url')
    .eq('id', userId)
    .maybeSingle();

  if (error || !data) return null;

  const row = data as ProfileRow;
  return {
    id: String(row.id || userId),
    username: String(row.username || '').trim(),
    avatarUrl: typeof row.avatar_url === 'string' ? row.avatar_url : null,
  };
};

const loadProfilesByIds = async (userIds: string[]) => {
  const uniqueIds = Array.from(new Set(userIds.filter((item) => typeof item === 'string' && item.length > 0)));
  if (uniqueIds.length === 0) {
    return new Map<string, SimpleProfile>();
  }

  const tableName = await resolveProfileTable();
  if (!tableName) return new Map<string, SimpleProfile>();

  const { data, error } = await supabase.from(tableName).select('id,username,avatar_url').in('id', uniqueIds);

  if (error || !Array.isArray(data)) {
    return new Map<string, SimpleProfile>();
  }

  const profiles = new Map<string, SimpleProfile>();
  data.forEach((row) => {
    const typed = row as ProfileRow;
    if (!typed.id) return;

    profiles.set(String(typed.id), {
      id: String(typed.id),
      username: String(typed.username || '').trim(),
      avatarUrl: typeof typed.avatar_url === 'string' ? typed.avatar_url : null,
    });
  });

  return profiles;
};

const normalizeUsername = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_');

const createSubtaskId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

export const createFriendSubtask = (): SubtaskItem => ({
  id: createSubtaskId(),
  title: '',
  is_completed: false,
});

export const parseFriendSubtasks = (value?: string | null): SubtaskItem[] => {
  if (!value) return [];

  try {
    const parsed = JSON.parse(value) as Partial<SubtaskItem>[];
    if (!Array.isArray(parsed)) return [];

    return parsed
      .map((item) => ({
        id: String(item.id || createSubtaskId()),
        title: String(item.title || '').trim(),
        is_completed: Boolean(item.is_completed),
      }))
      .filter((item) => item.title.length > 0);
  } catch {
    return [];
  }
};

export const serializeFriendSubtasks = (items: SubtaskItem[]) =>
  JSON.stringify(
    items
      .map((item) => ({
        id: item.id || createSubtaskId(),
        title: String(item.title || '').trim(),
        is_completed: Boolean(item.is_completed),
      }))
      .filter((item) => item.title.length > 0)
  );

export const parseFriendSchedule = (value?: string | null): TaskSchedule | null => {
  if (!value) return null;

  try {
    const parsed = JSON.parse(value) as TaskSchedule;
    if (!parsed || !parsed.name) return null;

    return {
      name: String(parsed.name).trim(),
      color: String(parsed.color || '#6B7280'),
      date: parsed.date,
      dueDateTime: parsed.dueDateTime || null,
      reminderBeforeMinutes:
        typeof parsed.reminderBeforeMinutes === 'number' ? parsed.reminderBeforeMinutes : null,
      recurrence:
        parsed.recurrence === 'daily' ||
        parsed.recurrence === 'weekend' ||
        parsed.recurrence === 'weekday' ||
        parsed.recurrence === 'today'
          ? parsed.recurrence
          : 'today',
      skipDates: Array.isArray(parsed.skipDates)
        ? parsed.skipDates.filter((item): item is string => typeof item === 'string')
        : [],
    };
  } catch {
    return null;
  }
};

const loadAcceptedFriendIds = async (userId: string) => {
  const tableName = await resolveFriendRequestTable();
  if (!tableName) return [] as string[];

  const { data, error } = await supabase
    .from(tableName)
    .select('id,sender_id,receiver_id,status')
    .eq('status', 'accepted')
    .or(`sender_id.eq.${userId},receiver_id.eq.${userId}`);

  if (error || !Array.isArray(data)) return [] as string[];

  return data
    .map((row) => row as FriendRequestRow)
    .map((row) => (row.sender_id === userId ? row.receiver_id : row.sender_id))
    .filter((item) => typeof item === 'string' && item.length > 0);
};

const loadCurrentUserProfile = async (): Promise<SimpleProfile | null> => {
  const currentUserId = await getAuthUserId();
  if (!currentUserId) return null;

  const profile = await loadProfileById(currentUserId);
  if (!profile) {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return null;

    return {
      id: user.id,
      username: normalizeUsername(user.email?.split('@')[0] || 'kullanici'),
      avatarUrl: null,
    };
  }

  return {
    id: profile.id,
    username: normalizeUsername(profile.username || 'kullanici'),
    avatarUrl: profile.avatarUrl,
  };
};

const readJson = async <T>(key: string, fallback: T) => {
  try {
    const raw = await AsyncStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
};

const writeJson = async (key: string, value: unknown) => {
  await AsyncStorage.setItem(key, JSON.stringify(value));
};

const mapLegacyFriendTaskRow = (row: FriendTaskRow): FriendTaskItem => ({
  id: String(row.id),
  task: String(row.task || '').trim(),
  description: typeof row.description === 'string' ? row.description : null,
  subtask: typeof row.subtask === 'string' ? row.subtask : null,
  category: typeof row.category === 'string' ? row.category : null,
  createdAt: row.created_at ? Date.parse(row.created_at) || Date.now() : Date.now(),
  assignedById: String(row.sender_id || ''),
  assignedByName: String(row.sender_name || '').trim() || 'kullanici',
  assignedByAvatarUrl: typeof row.sender_avatar_url === 'string' ? row.sender_avatar_url : null,
});

const mapTodoTaskRow = (row: TodoTaskRow, profileMap: Map<string, SimpleProfile>): FriendTaskItem => {
  const assignedById = String(row.creator_id || row.user_id || '');
  const assignedByProfile = profileMap.get(assignedById);

  return {
    id: String(row.id),
    task: String(row.task || '').trim(),
    description: typeof row.description === 'string' ? row.description : null,
    subtask: typeof row.subtask === 'string' ? row.subtask : null,
    category: typeof row.category === 'string' ? row.category : null,
    createdAt: row.created_at ? Date.parse(row.created_at) || Date.now() : Date.now(),
    assignedById,
    assignedByName: assignedByProfile?.username || 'kullanici',
    assignedByAvatarUrl: assignedByProfile?.avatarUrl ?? null,
  };
};

const loadLegacyRemoteFriendTasks = async (query: { receiverId?: string; senderId?: string }) => {
  for (const tableName of ['friend_tasks', 'user_friend_tasks']) {
    const { data, error } = await supabase
      .from(tableName)
      .select('id,sender_id,receiver_id,task,description,subtask,category,sender_name,sender_avatar_url,created_at')
      .order('created_at', { ascending: false });

    if (error || !Array.isArray(data)) {
      continue;
    }

    const filtered = (data as FriendTaskRow[]).filter((row) => {
      if (query.receiverId && row.receiver_id !== query.receiverId) return false;
      if (query.senderId && row.sender_id !== query.senderId) return false;
      return true;
    });

    return filtered.map((row) => mapLegacyFriendTaskRow(row));
  }

  return [] as FriendTaskItem[];
};

const loadRemoteFriendTasks = async (query: { receiverId?: string; senderId?: string }) => {
  let request = supabase
    .from('todos')
    .select('id,user_id,creator_id,assigned_id,task,description,subtask,category,created_at');

  if (query.receiverId) {
    request = request.eq('assigned_id', query.receiverId);
  }

  if (query.senderId) {
    request = request.eq('creator_id', query.senderId);
  }

  const { data, error } = await request.order('created_at', { ascending: false });
  if (error || !Array.isArray(data)) return null;

  const todoRows = data as TodoTaskRow[];
  const legacyRows = await loadLegacyRemoteFriendTasks(query);
  const profileMap = await loadProfilesByIds(todoRows.map((row) => String(row.creator_id || row.user_id || '')));

  return [
    ...todoRows.map((row) => mapTodoTaskRow(row, profileMap)),
    ...legacyRows.filter((legacyRow) => !todoRows.some((row) => String(row.id) === String(legacyRow.id))),
  ].sort((left, right) => right.createdAt - left.createdAt);
};

const loadBlockedSendersForOwner = async (ownerId: string) => {
  const tableName = await resolveFriendTaskPermissionTable();
  if (!tableName) return new Set<string>();

  const { data, error } = await supabase
    .from(tableName)
    .select('friend_id,can_send')
    .eq('owner_id', ownerId)
    .eq('can_send', false);

  if (error || !Array.isArray(data)) return new Set<string>();

  const blocked = new Set<string>();
  data.forEach((row) => {
    const typed = row as FriendTaskPermissionRow;
    if (typed.friend_id) {
      blocked.add(String(typed.friend_id));
    }
  });

  return blocked;
};

export const loadFriendProfile = async (friendId: string) => {
  const profile = await loadProfileById(friendId);
  if (profile) return profile;

  return {
    id: friendId,
    username: 'kullanici',
    avatarUrl: null,
  };
};

export const loadFriendStats = async (friendId: string) => {
  const [friendIds, { data, error }] = await Promise.all([
    loadAcceptedFriendIds(friendId),
    supabase.from('todos').select('id,is_completed,category,user_id').eq('user_id', friendId).order('id', { ascending: true }),
  ]);

  const friendsCount = friendIds.length;
  const todos = !error && Array.isArray(data) ? (data as { id: number | string; is_completed: boolean; category?: string | null }[]) : [];
  const completedTasks = todos.filter((item) => item.is_completed).length;

  const formatDateKey = (date: Date) =>
    `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

  const normalizeRecurrence = (value?: string | null) => {
    if (value === 'daily' || value === 'weekend' || value === 'weekday' || value === 'today') {
      return value;
    }
    return 'today';
  };

  const parseCategory = (value?: string | null) => {
    if (!value) return null;

    try {
      const parsed = JSON.parse(value) as { date?: string; recurrence?: string; skipDates?: string[] };
      return {
        date: parsed.date,
        recurrence: normalizeRecurrence(parsed.recurrence),
        skipDates: Array.isArray(parsed.skipDates)
          ? parsed.skipDates.filter((item): item is string => typeof item === 'string')
          : [],
      };
    } catch {
      return null;
    }
  };

  const parsedTodos = todos.map(task => ({
    ...task,
    parsedMeta: parseCategory(task.category)
  }));

  const isTaskVisibleOnDateFast = (task: typeof parsedTodos[0], targetDate: string, todayDate: string) => {
    const categoryMeta = task.parsedMeta;
    const taskDate = categoryMeta?.date;
    if (!taskDate) return targetDate === todayDate;

    if (targetDate < taskDate) return false;
    if ((categoryMeta?.skipDates || []).includes(targetDate)) return false;

    const recurrence = normalizeRecurrence(categoryMeta?.recurrence);
    if (recurrence === 'today') return targetDate === taskDate;
    if (recurrence === 'daily') return true;

    const dayOfWeek = new Date(`${targetDate}T00:00:00`).getDay();
    if (recurrence === 'weekend') return dayOfWeek === 0 || dayOfWeek === 6;
    return dayOfWeek >= 1 && dayOfWeek <= 5;
  };

  const todayKey = formatDateKey(new Date());
  let streakDays = 0;
  for (let i = 0; i < 365; i += 1) {
    const targetDate = formatDateKey(new Date(Date.now() - i * 24 * 60 * 60 * 1000));
    const dayTasks = parsedTodos.filter((task) => isTaskVisibleOnDateFast(task, targetDate, todayKey));
    if (dayTasks.length === 0) break;

    const allDone = dayTasks.every((task) => task.is_completed);
    if (!allDone) break;

    streakDays += 1;
  }

  return {
    friendsCount,
    completedTasks,
    streakDays,
  };
};

export const loadFriendTasks = async (friendId: string) => {
  const currentUserId = await getAuthUserId();
  if (!currentUserId) return [] as FriendTaskItem[];

  const remoteTasks = await loadRemoteFriendTasks({ receiverId: friendId, senderId: currentUserId });
  if (remoteTasks) {
    await writeJson(`${FRIEND_TASKS_KEY_PREFIX}:${currentUserId}:${friendId}`, remoteTasks);
    return remoteTasks;
  }

  return readJson<FriendTaskItem[]>(`${FRIEND_TASKS_KEY_PREFIX}:${currentUserId}:${friendId}`, []);
};

export const saveFriendTasks = async (friendId: string, tasks: FriendTaskItem[]) => {
  const currentUserId = await getAuthUserId();
  if (!currentUserId) return;

  const payload = tasks.map((item) => ({
    id: item.id,
    user_id: currentUserId,
    creator_id: currentUserId,
    assigned_id: friendId,
    task: item.task,
    description: item.description,
    subtask: item.subtask,
    category: item.category,
    created_at: new Date(item.createdAt).toISOString(),
  }));

  const { error: deleteError } = await supabase
    .from('todos')
    .delete()
    .eq('creator_id', currentUserId)
    .eq('assigned_id', friendId);

  if (!deleteError && payload.length > 0) {
    const { error } = await supabase.from('todos').insert(payload);
    if (!error) {
      await writeJson(`${FRIEND_TASKS_KEY_PREFIX}:${currentUserId}:${friendId}`, tasks);
      return;
    }
  }

  await writeJson(`${FRIEND_TASKS_KEY_PREFIX}:${currentUserId}:${friendId}`, tasks);
};

export const loadIncomingFriendTasks = async () => {
  const currentUserId = await getAuthUserId();
  if (!currentUserId) return [] as FriendTaskItem[];

  const remoteTasks = await loadRemoteFriendTasks({ receiverId: currentUserId });
  if (remoteTasks) {
    const blockedSenders = await loadBlockedSendersForOwner(currentUserId);
    const visibleRemoteTasks = remoteTasks.filter((item) => !blockedSenders.has(item.assignedById));
    await writeJson(`${FRIEND_TASKS_KEY_PREFIX}:${currentUserId}:incoming`, visibleRemoteTasks);
    return visibleRemoteTasks;
  }

  return readJson<FriendTaskItem[]>(`${FRIEND_TASKS_KEY_PREFIX}:${currentUserId}:incoming`, []);
};

export const addFriendTask = async (
  friendId: string,
  payload: {
    task: string;
    description?: string | null;
    subtask?: string | null;
    category?: string | null;
  }
) => {
  const sender = await loadCurrentUserProfile();
  if (!sender) return [] as FriendTaskItem[];

  const nextTask: FriendTaskItem = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    task: payload.task.trim(),
    description: payload.description?.trim() || null,
    subtask: payload.subtask || null,
    category: payload.category || null,
    createdAt: Date.now(),
    assignedById: sender.id,
    assignedByName: sender.username,
    assignedByAvatarUrl: sender.avatarUrl,
  };

  const { error } = await supabase.from('todos').insert({
    id: nextTask.id,
    user_id: sender.id,
    creator_id: sender.id,
    assigned_id: friendId,
    task: nextTask.task,
    description: nextTask.description,
    subtask: nextTask.subtask,
    category: nextTask.category,
    created_at: new Date(nextTask.createdAt).toISOString(),
  });

  if (error) {
    throw new Error(error.message || 'Gorev Supabase tarafina kaydedilemedi.');
  }

  const current = await loadFriendTasks(friendId);
  return [nextTask, ...current.filter((item) => item.id !== nextTask.id)];
};

export const removeFriendTask = async (friendId: string, taskId: string) => {
  const currentUserId = await getAuthUserId();
  if (!currentUserId) return [] as FriendTaskItem[];

  const { error } = await supabase
    .from('todos')
    .delete()
    .eq('id', taskId)
    .eq('creator_id', currentUserId)
    .eq('assigned_id', friendId);

  if (error) {
    throw new Error(error.message || 'Gorev silinemedi.');
  }

  return loadFriendTasks(friendId);
};

export const loadCanFriendSendTasks = async (friendId: string) => {
  const currentUserId = await getAuthUserId();
  if (!currentUserId) return true;

  const tableName = await resolveFriendTaskPermissionTable();
  if (tableName) {
    const { data, error } = await supabase
      .from(tableName)
      .select('can_send')
      .eq('owner_id', currentUserId)
      .eq('friend_id', friendId)
      .maybeSingle();

    if (!error && data) {
      return Boolean((data as FriendTaskPermissionRow).can_send);
    }
  }

  return readJson<boolean>(buildKey(FRIEND_CAN_SEND_KEY_PREFIX, currentUserId, friendId), true);
};

export const saveCanFriendSendTasks = async (friendId: string, canSend: boolean) => {
  const currentUserId = await getAuthUserId();
  if (!currentUserId) return;

  const tableName = await resolveFriendTaskPermissionTable();
  if (tableName) {
    await supabase.from(tableName).upsert({
      owner_id: currentUserId,
      friend_id: friendId,
      can_send: canSend,
    });
    return;
  }

  await writeJson(buildKey(FRIEND_CAN_SEND_KEY_PREFIX, currentUserId, friendId), canSend);
};
